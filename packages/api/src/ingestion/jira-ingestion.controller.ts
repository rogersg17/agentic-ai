import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../auth/rbac.guard.js';
import { RequireCapability } from '../auth/rbac.decorator.js';
import { Capability, AccessLevel } from '@agentic/shared';
import { JiraAdapterService } from './jira-adapter.service.js';
import { GraphSyncService } from './graph-sync.service.js';
import { AuditService } from '../audit/audit.service.js';

@ApiTags('ingestion')
@ApiBearerAuth()
@Controller('ingestion')
@UseGuards(JwtAuthGuard, RbacGuard)
export class JiraIngestionController {
  private readonly logger = new Logger(JiraIngestionController.name);

  constructor(
    private readonly jiraAdapter: JiraAdapterService,
    private readonly graphSync: GraphSyncService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Import defects from Jira using a JQL query.
   */
  @Post('jira-import')
  @RequireCapability(Capability.UPLOAD_TESTS, AccessLevel.WRITE)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Target project ID' },
        jql: {
          type: 'string',
          description: 'JQL query to fetch issues (e.g. "project = PROJ AND type = Bug")',
        },
        maxResults: { type: 'number', description: 'Max issues to fetch (default: 50)' },
      },
      required: ['projectId', 'jql'],
    },
  })
  async importFromJira(
    @Body() body: { projectId: string; jql: string; maxResults?: number },
  ) {
    if (!this.jiraAdapter.isConfigured) {
      throw new BadRequestException(
        'Jira integration is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.',
      );
    }

    const defects = await this.jiraAdapter.fetchDefects(body.jql, body.maxResults ?? 50);

    const nodeIds = await this.graphSync.syncDefects(body.projectId, defects);

    await this.auditService.log({
      actorId: 'jira-import',
      action: 'jira_import',
      entityType: 'defect',
      entityId: body.projectId,
      after: {
        jql: body.jql,
        defectsImported: defects.length,
        nodeIds,
      },
    });

    this.logger.log(`Imported ${defects.length} defects from Jira into project ${body.projectId}`);

    return {
      imported: defects.length,
      nodeIds,
      defects: defects.map((d) => ({
        externalId: d.externalId,
        title: d.title,
        severity: d.severity,
        status: d.status,
      })),
    };
  }

  /**
   * Import a single Jira issue by key.
   */
  @Post('jira-import-issue')
  @RequireCapability(Capability.UPLOAD_TESTS, AccessLevel.WRITE)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        issueKey: { type: 'string', description: 'Jira issue key (e.g. "PROJ-123")' },
      },
      required: ['projectId', 'issueKey'],
    },
  })
  async importSingleIssue(
    @Body() body: { projectId: string; issueKey: string },
  ) {
    if (!this.jiraAdapter.isConfigured) {
      throw new BadRequestException('Jira integration is not configured.');
    }

    const defect = await this.jiraAdapter.fetchIssue(body.issueKey);
    const nodeIds = await this.graphSync.syncDefects(body.projectId, [defect]);

    return {
      imported: 1,
      nodeIds,
      defect: {
        externalId: defect.externalId,
        title: defect.title,
        severity: defect.severity,
        status: defect.status,
      },
    };
  }
}
