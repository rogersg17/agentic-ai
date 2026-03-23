import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionStatus, TestResultStatus, ExecutionEvent } from '@agentic/shared';
import type { CreateRunDto } from './dto/create-run.dto.js';
import type { ExecutionService } from './execution.service.js';
import { ArtifactCollectionService } from './artifact-collection.service.js';
import type { ExecutionGateway } from './execution.gateway.js';
import { Inject, forwardRef } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

interface ActiveRun {
  process?: ChildProcess;
  cancelled: boolean;
}

@Injectable()
export class ExecutionWorkerService {
  private readonly logger = new Logger(ExecutionWorkerService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => 'ExecutionService'))
    private readonly executionService: ExecutionService,
    private readonly artifactService: ArtifactCollectionService,
    @Inject(forwardRef(() => 'ExecutionGateway'))
    private readonly gateway: ExecutionGateway,
  ) {}

  /**
   * Dispatch an execution run. Spawns a Playwright process, collects results,
   * and uploads artifacts.
   */
  async dispatch(runId: string, dto: CreateRunDto): Promise<void> {
    const activeRun: ActiveRun = { cancelled: false };
    this.activeRuns.set(runId, activeRun);

    try {
      // Mark run as running
      await this.executionService.updateRunStatus(runId, ExecutionStatus.RUNNING);
      this.gateway.emitToRun(runId, ExecutionEvent.RUN_STARTED, { runId, status: ExecutionStatus.RUNNING });

      // Create temp output directory for results
      const outputDir = join(tmpdir(), 'agentic-execution', runId);
      await mkdir(outputDir, { recursive: true });

      // Build Playwright command
      const args = this.buildPlaywrightArgs(dto, outputDir);
      this.logger.log(`Executing run ${runId}: npx playwright test ${args.join(' ')}`);

      // Spawn Playwright process
      const startTime = Date.now();
      const exitCode = await this.runPlaywright(runId, args, activeRun, outputDir);
      const durationMs = Date.now() - startTime;

      if (activeRun.cancelled) {
        this.logger.log(`Run ${runId} was cancelled`);
        return;
      }

      // Parse results from JSON reporter output
      const results = await this.parseResults(outputDir, runId);

      // Collect artifacts and save results
      let passed = 0, failed = 0, skipped = 0;

      for (const result of results) {
        // Upload artifacts from the output directory
        const artifacts = await this.collectTestArtifacts(runId, result.testId, outputDir);

        const testResult = await this.executionService.saveTestResult({
          runId,
          testCaseNeo4jId: result.testId,
          status: result.status,
          retryCount: result.retryCount,
          durationMs: result.durationMs,
          errorMessage: result.errorMessage,
          stackTrace: result.stackTrace,
          screenshotUrl: artifacts.screenshotUrl,
          traceUrl: artifacts.traceUrl,
          domSnapshotUrl: artifacts.domSnapshotUrl,
          logUrl: artifacts.logUrl,
          shardIndex: result.shardIndex,
        });

        // Update counters
        if (result.status === TestResultStatus.PASSED) passed++;
        else if (result.status === TestResultStatus.FAILED) failed++;
        else if (result.status === TestResultStatus.SKIPPED) skipped++;

        // Emit individual test completion
        this.gateway.emitToRun(runId, ExecutionEvent.TEST_COMPLETED, {
          runId,
          testResultId: testResult.id,
          testTitle: result.testTitle,
          status: result.status,
          durationMs: result.durationMs,
          errorMessage: result.errorMessage,
          retryCount: result.retryCount,
        });

        // Emit progress
        this.gateway.emitToRun(runId, ExecutionEvent.RUN_PROGRESS, {
          runId,
          status: ExecutionStatus.RUNNING,
          totalTests: results.length,
          completed: passed + failed + skipped,
          passed,
          failed,
          skipped,
          flaky: 0,
          durationMs: Date.now() - startTime,
        });
      }

      // Finalize run
      const finalStatus = failed > 0 ? ExecutionStatus.FAILED : ExecutionStatus.COMPLETED;
      await this.executionService.updateRunStatus(runId, finalStatus, {
        totalTests: results.length,
        passed,
        failed,
        skipped,
        flaky: 0,
        durationMs,
      });

      this.gateway.emitToRun(runId, ExecutionEvent.RUN_COMPLETED, {
        runId,
        status: finalStatus,
        totalTests: results.length,
        completed: results.length,
        passed,
        failed,
        skipped,
        flaky: 0,
        durationMs,
      });

      this.logger.log(
        `Run ${runId} completed: ${passed} passed, ${failed} failed, ${skipped} skipped (${durationMs}ms)`,
      );
    } catch (error) {
      this.logger.error(`Run ${runId} errored`, error);
      await this.executionService.updateRunStatus(runId, ExecutionStatus.FAILED);
      this.gateway.emitToRun(runId, ExecutionEvent.RUN_COMPLETED, {
        runId,
        status: ExecutionStatus.FAILED,
        totalTests: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        durationMs: 0,
      });
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  /** Cancel a running execution */
  cancel(runId: string): void {
    const active = this.activeRuns.get(runId);
    if (active) {
      active.cancelled = true;
      if (active.process && !active.process.killed) {
        active.process.kill('SIGTERM');
        this.logger.log(`Sent SIGTERM to run ${runId}`);
      }
    }
  }

  /** Build Playwright CLI arguments from the run configuration */
  private buildPlaywrightArgs(dto: CreateRunDto, outputDir: string): string[] {
    const args: string[] = [];

    // Reporter: JSON for machine parsing + list for logs
    args.push('--reporter', `json,list`);

    // Output directory for traces/screenshots
    args.push('--output', outputDir);

    // Browser selection
    if (dto.browserConfig.browsers.length > 0) {
      args.push('--project', ...dto.browserConfig.browsers);
    }

    // Headless mode (Playwright headless by default, use headed flag to disable)
    if (!dto.browserConfig.headless) {
      args.push('--headed');
    }

    // Retries
    if (dto.browserConfig.retries !== undefined) {
      args.push('--retries', String(dto.browserConfig.retries));
    }

    // Timeout
    if (dto.browserConfig.timeout !== undefined) {
      args.push('--timeout', String(dto.browserConfig.timeout));
    }

    // Workers
    if (dto.browserConfig.workers !== undefined) {
      args.push('--workers', String(dto.browserConfig.workers));
    }

    // Sharding
    if (dto.shardCount && dto.shardCount > 1) {
      // placeholder; actual sharding would spawn multiple processes
      args.push('--shard', `1/${dto.shardCount}`);
    }

    // Test filter by grep
    if (dto.grepPattern) {
      args.push('--grep', dto.grepPattern);
    }

    // Specific test files
    if (dto.testFilter && dto.testFilter.length > 0) {
      args.push(...dto.testFilter);
    }

    return args;
  }

  /** Spawn Playwright and wait for exit */
  private runPlaywright(
    runId: string,
    args: string[],
    activeRun: ActiveRun,
    outputDir: string,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

      const proc = spawn(npxCmd, ['playwright', 'test', ...args], {
        cwd: this.configService.get<string>('execution.workingDirectory', process.cwd()),
        env: {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: join(outputDir, 'results.json'),
          PW_TEST_REPORTER: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      activeRun.process = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        this.logger.error(`Failed to spawn Playwright for run ${runId}`, err);
        reject(err);
      });

      proc.on('close', (code) => {
        this.logger.debug(`Playwright exited with code ${code} for run ${runId}`);
        resolve(code ?? 1);
      });
    });
  }

  /** Parse Playwright JSON reporter output */
  private async parseResults(
    outputDir: string,
    runId: string,
  ): Promise<
    Array<{
      testId: string;
      testTitle: string;
      status: TestResultStatus;
      durationMs: number;
      retryCount: number;
      errorMessage?: string;
      stackTrace?: string;
      shardIndex?: number;
    }>
  > {
    const resultsPath = join(outputDir, 'results.json');

    try {
      await access(resultsPath);
    } catch {
      this.logger.warn(`No results.json found for run ${runId}, returning empty results`);
      return [];
    }

    const raw = await readFile(resultsPath, 'utf-8');
    const report = JSON.parse(raw);
    const results: Array<{
      testId: string;
      testTitle: string;
      status: TestResultStatus;
      durationMs: number;
      retryCount: number;
      errorMessage?: string;
      stackTrace?: string;
      shardIndex?: number;
    }> = [];

    // Playwright JSON report structure: { suites: [{ suites, specs }] }
    const processSpecs = (suites: Array<Record<string, unknown>>) => {
      for (const suite of suites) {
        if (Array.isArray(suite.suites)) {
          processSpecs(suite.suites as Array<Record<string, unknown>>);
        }
        if (Array.isArray(suite.specs)) {
          for (const spec of suite.specs as Array<Record<string, unknown>>) {
            const tests = (spec.tests ?? []) as Array<Record<string, unknown>>;
            for (const test of tests) {
              const testResults = (test.results ?? []) as Array<Record<string, unknown>>;
              const lastResult = testResults[testResults.length - 1];

              let status: TestResultStatus;
              const rawStatus = String(test.status ?? lastResult?.status ?? 'failed');
              if (rawStatus === 'expected' || rawStatus === 'passed') {
                status = TestResultStatus.PASSED;
              } else if (rawStatus === 'skipped') {
                status = TestResultStatus.SKIPPED;
              } else if (rawStatus === 'timedOut') {
                status = TestResultStatus.TIMED_OUT;
              } else {
                status = TestResultStatus.FAILED;
              }

              const errorObj = lastResult?.error as Record<string, unknown> | undefined;

              results.push({
                testId: String(spec.file ?? '') + '::' + String(spec.title ?? ''),
                testTitle: String(spec.title ?? 'unnamed'),
                status,
                durationMs: Number(lastResult?.duration ?? 0),
                retryCount: Math.max(0, testResults.length - 1),
                errorMessage: errorObj?.message ? String(errorObj.message) : undefined,
                stackTrace: errorObj?.stack ? String(errorObj.stack) : undefined,
              });
            }
          }
        }
      }
    };

    if (Array.isArray(report.suites)) {
      processSpecs(report.suites);
    }

    return results;
  }

  /** Collect artifacts (traces, screenshots) from the output directory */
  private async collectTestArtifacts(
    runId: string,
    testId: string,
    outputDir: string,
  ) {
    const safeTestId = testId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);

    try {
      const entries = await readdir(outputDir, { recursive: true });
      let trace: Buffer | undefined;
      let screenshot: Buffer | undefined;

      for (const entry of entries) {
        const entryStr = String(entry);
        if (entryStr.endsWith('.zip') && entryStr.includes('trace')) {
          trace = await readFile(join(outputDir, entryStr));
        } else if (entryStr.endsWith('.png')) {
          screenshot = await readFile(join(outputDir, entryStr));
        }
      }

      return await this.artifactService.collectAll(runId, safeTestId, {
        trace,
        screenshot,
      });
    } catch {
      return {};
    }
  }
}
