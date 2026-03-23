import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  RawBody,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { GitSyncService, type GitPushPayload } from './git-sync.service.js';

interface WebhookBody {
  payload: GitPushPayload;
  fileContents?: Record<string, string>;
}

@ApiTags('ingestion')
@Controller('ingestion')
export class GitWebhookController {
  private readonly logger = new Logger(GitWebhookController.name);

  constructor(private readonly gitSyncService: GitSyncService) {}

  /**
   * Receive a Git push webhook (GitHub-compatible).
   * The webhook sends push event data, plus optionally the file contents for changed files.
   *
   * For GitHub native webhooks, file contents must be fetched separately
   * (e.g. via a CI step that POSTs to this endpoint with the content).
   */
  @Post('git-webhook/:projectId')
  @ApiBody({
    description:
      'Git push webhook payload. Include fileContents map of {path: content} for changed files.',
    schema: {
      type: 'object',
      properties: {
        payload: {
          type: 'object',
          description: 'GitHub/GitLab push event payload',
        },
        fileContents: {
          type: 'object',
          description: 'Map of file path to file content for changed files',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['payload'],
    },
  })
  async handleGitWebhook(
    @Param('projectId') projectId: string,
    @Body() body: WebhookBody,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-event') githubEvent?: string,
    @Headers('x-gitlab-event') gitlabEvent?: string,
  ) {
    // Validate event type — only process push events
    const event = githubEvent ?? gitlabEvent ?? 'push';
    if (event !== 'push' && event !== 'Push Hook') {
      return { message: `Ignored event: ${event}` };
    }

    if (!body.payload || !body.payload.ref || !body.payload.commits) {
      throw new BadRequestException(
        'Invalid payload: expected ref, commits fields',
      );
    }

    // Verify signature if provided
    if (signature) {
      const rawPayload = JSON.stringify(body);
      if (!this.gitSyncService.verifyGitHubSignature(rawPayload, signature)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const fileContents = new Map<string, string>(
      Object.entries(body.fileContents ?? {}),
    );

    const result = await this.gitSyncService.processWebhookPush(
      projectId,
      body.payload,
      fileContents,
    );

    this.logger.log(
      `Git sync complete: ${result.filesProcessed} ingested, ${result.filesSkipped} skipped`,
    );

    return result;
  }
}
