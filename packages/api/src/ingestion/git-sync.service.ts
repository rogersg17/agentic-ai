import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from './ingestion.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface GitPushPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    full_name: string;
    clone_url?: string;
    html_url?: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  sender?: { login: string; id: number };
}

export interface GitSyncResult {
  branch: string;
  commit: string;
  filesProcessed: number;
  filesSkipped: number;
  results: Array<{
    filePath: string;
    action: 'ingested' | 'skipped' | 'error';
    reason?: string;
  }>;
}

/** File extensions we know how to ingest */
const INGESTABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.md',
  '.feature',
  '.gherkin',
]);

@Injectable()
export class GitSyncService {
  private readonly logger = new Logger(GitSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ingestionService: IngestionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Verify a GitHub webhook signature (HMAC-SHA256).
   */
  verifyGitHubSignature(payload: string, signature: string): boolean {
    const secret = this.configService.get<string>('GIT_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('GIT_WEBHOOK_SECRET not configured — skipping signature verification');
      return true;
    }

    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  /**
   * Process a Git push webhook event.
   * Collects added/modified files from the commits and re-ingests them.
   */
  async processWebhookPush(
    projectId: string,
    payload: GitPushPayload,
    fileContents: Map<string, string>,
  ): Promise<GitSyncResult> {
    const branch = payload.ref.replace('refs/heads/', '');
    const commitSha = payload.after;

    // Collect unique changed file paths (added + modified)
    const changedFiles = new Set<string>();
    for (const commit of payload.commits) {
      for (const f of [...commit.added, ...commit.modified]) {
        if (this.isIngestableFile(f)) {
          changedFiles.add(f);
        }
      }
    }

    this.logger.log(
      `Git webhook: ${payload.repository.full_name} branch=${branch} commit=${commitSha.slice(0, 8)} ` +
        `changed=${changedFiles.size} files`,
    );

    const results: GitSyncResult['results'] = [];
    let filesProcessed = 0;
    let filesSkipped = 0;

    for (const filePath of changedFiles) {
      const content = fileContents.get(filePath);
      if (!content) {
        results.push({ filePath, action: 'skipped', reason: 'Content not provided' });
        filesSkipped++;
        continue;
      }

      try {
        await this.ingestionService.ingestFile(
          projectId,
          filePath,
          Buffer.from(content, 'utf-8'),
          'text/plain',
          undefined,
          undefined,
        );
        results.push({ filePath, action: 'ingested' });
        filesProcessed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to ingest ${filePath}: ${message}`);
        results.push({ filePath, action: 'error', reason: message });
        filesSkipped++;
      }
    }

    // Audit the sync
    await this.auditService.log({
      actorId: 'git-webhook',
      action: 'git_sync',
      entityType: 'project',
      entityId: projectId,
      after: {
        repository: payload.repository.full_name,
        branch,
        commit: commitSha,
        filesProcessed,
        filesSkipped,
      },
    });

    return { branch, commit: commitSha, filesProcessed, filesSkipped, results };
  }

  /**
   * Check if a file path is one we can ingest
   */
  private isIngestableFile(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return INGESTABLE_EXTENSIONS.has(ext.toLowerCase());
  }
}
