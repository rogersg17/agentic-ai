import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, desc, and, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module.js';
import { executionRuns, testResults } from '../database/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { ExecutionStatus, TriggerSource } from '@agentic/shared';
import type { CreateRunDto } from './dto/create-run.dto.js';
import { ExecutionWorkerService } from './execution-worker.service.js';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
    private readonly workerService: ExecutionWorkerService,
  ) {}

  /** Create a new execution run and dispatch it for processing */
  async createRun(dto: CreateRunDto, userId: string) {
    const [run] = await this.db
      .insert(executionRuns)
      .values({
        project_id: dto.projectId,
        triggered_by: userId,
        trigger_source: TriggerSource.MANUAL,
        environment: dto.environment ?? 'default',
        git_commit: dto.gitCommit,
        git_branch: dto.gitBranch,
        browser_config: dto.browserConfig,
        shard_count: dto.shardCount ?? 1,
        status: ExecutionStatus.QUEUED,
      })
      .returning();

    await this.auditService.log({
      actorId: userId,
      action: 'execution_run.created',
      entityType: 'execution_run',
      entityId: run.id,
      after: {
        projectId: dto.projectId,
        environment: dto.environment,
        shardCount: dto.shardCount ?? 1,
      },
    });

    this.logger.log(`Created execution run ${run.id} for project ${dto.projectId}`);

    // Dispatch to worker (async, non-blocking)
    this.workerService.dispatch(run.id, dto).catch((err) => {
      this.logger.error(`Failed to dispatch run ${run.id}`, err);
    });

    return run;
  }

  /** Create a CI-triggered execution run */
  async createCiRun(
    projectId: string,
    ciBuildId: string,
    gitCommit: string,
    gitBranch: string,
    browserConfig: CreateRunDto['browserConfig'],
    shardCount: number,
  ) {
    const [run] = await this.db
      .insert(executionRuns)
      .values({
        project_id: projectId,
        trigger_source: TriggerSource.CI_WEBHOOK,
        ci_build_id: ciBuildId,
        git_commit: gitCommit,
        git_branch: gitBranch,
        browser_config: browserConfig,
        shard_count: shardCount,
        status: ExecutionStatus.QUEUED,
      })
      .returning();

    this.logger.log(`Created CI execution run ${run.id} (build: ${ciBuildId})`);

    return run;
  }

  /** Get all execution runs for a project (paginated, newest first) */
  async listRuns(projectId: string, limit = 20, offset = 0) {
    const runs = await this.db
      .select()
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId))
      .orderBy(desc(executionRuns.created_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId));

    return { runs, total: count };
  }

  /** Get a single execution run by ID */
  async getRun(runId: string) {
    const [run] = await this.db
      .select()
      .from(executionRuns)
      .where(eq(executionRuns.id, runId))
      .limit(1);

    if (!run) throw new NotFoundException(`Execution run ${runId} not found`);
    return run;
  }

  /** Get all test results for a run */
  async getRunResults(runId: string, limit = 100, offset = 0) {
    // Verify run exists
    await this.getRun(runId);

    const results = await this.db
      .select()
      .from(testResults)
      .where(eq(testResults.run_id, runId))
      .orderBy(desc(testResults.created_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(testResults)
      .where(eq(testResults.run_id, runId));

    return { results, total: count };
  }

  /** Get a single test result with full details */
  async getTestResult(resultId: string) {
    const [result] = await this.db
      .select()
      .from(testResults)
      .where(eq(testResults.id, resultId))
      .limit(1);

    if (!result) throw new NotFoundException(`Test result ${resultId} not found`);
    return result;
  }

  /** Cancel a running or queued execution run */
  async cancelRun(runId: string, userId: string, reason?: string) {
    const run = await this.getRun(runId);

    if (run.status !== ExecutionStatus.QUEUED && run.status !== ExecutionStatus.RUNNING) {
      throw new NotFoundException(`Run ${runId} is not cancellable (status: ${run.status})`);
    }

    const [updated] = await this.db
      .update(executionRuns)
      .set({
        status: ExecutionStatus.CANCELLED,
        completed_at: new Date(),
      })
      .where(eq(executionRuns.id, runId))
      .returning();

    await this.auditService.log({
      actorId: userId,
      action: 'execution_run.cancelled',
      entityType: 'execution_run',
      entityId: runId,
      before: { status: run.status },
      after: { status: ExecutionStatus.CANCELLED, reason },
    });

    // Signal worker to stop
    this.workerService.cancel(runId);

    this.logger.log(`Cancelled execution run ${runId}`);
    return updated;
  }

  /** Update run status (called by worker) */
  async updateRunStatus(
    runId: string,
    status: ExecutionStatus,
    counts?: {
      totalTests?: number;
      passed?: number;
      failed?: number;
      skipped?: number;
      flaky?: number;
      durationMs?: number;
    },
  ) {
    const values: Record<string, unknown> = { status };

    if (status === ExecutionStatus.RUNNING) {
      values.started_at = new Date();
    }
    if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED) {
      values.completed_at = new Date();
    }
    if (counts?.totalTests !== undefined) values.total_tests = counts.totalTests;
    if (counts?.passed !== undefined) values.passed = counts.passed;
    if (counts?.failed !== undefined) values.failed = counts.failed;
    if (counts?.skipped !== undefined) values.skipped = counts.skipped;
    if (counts?.flaky !== undefined) values.flaky = counts.flaky;
    if (counts?.durationMs !== undefined) values.duration_ms = counts.durationMs;

    const [updated] = await this.db
      .update(executionRuns)
      .set(values)
      .where(eq(executionRuns.id, runId))
      .returning();

    return updated;
  }

  /** Save a test result (called by worker per test) */
  async saveTestResult(data: {
    runId: string;
    testCaseNeo4jId: string;
    status: string;
    retryCount?: number;
    durationMs?: number;
    errorMessage?: string;
    stackTrace?: string;
    screenshotUrl?: string;
    traceUrl?: string;
    domSnapshotUrl?: string;
    logUrl?: string;
    shardIndex?: number;
  }) {
    const [result] = await this.db
      .insert(testResults)
      .values({
        run_id: data.runId,
        test_case_neo4j_id: data.testCaseNeo4jId,
        status: data.status,
        retry_count: data.retryCount ?? 0,
        duration_ms: data.durationMs,
        error_message: data.errorMessage,
        stack_trace: data.stackTrace,
        screenshot_url: data.screenshotUrl,
        trace_url: data.traceUrl,
        dom_snapshot_url: data.domSnapshotUrl,
        log_url: data.logUrl,
        shard_index: data.shardIndex,
      })
      .returning();

    return result;
  }

  /** Get summary stats for a project's execution history */
  async getProjectStats(projectId: string) {
    const [stats] = await this.db
      .select({
        totalRuns: sql<number>`count(*)::int`,
        completedRuns: sql<number>`count(*) filter (where ${executionRuns.status} = 'completed')::int`,
        failedRuns: sql<number>`count(*) filter (where ${executionRuns.status} = 'failed')::int`,
        avgDurationMs: sql<number>`avg(${executionRuns.duration_ms})::int`,
        totalPassed: sql<number>`sum(${executionRuns.passed})::int`,
        totalFailed: sql<number>`sum(${executionRuns.failed})::int`,
        totalSkipped: sql<number>`sum(${executionRuns.skipped})::int`,
        totalFlaky: sql<number>`sum(${executionRuns.flaky})::int`,
      })
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId));

    return stats;
  }
}
