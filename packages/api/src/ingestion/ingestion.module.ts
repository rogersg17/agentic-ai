import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { GitWebhookController } from './git-webhook.controller.js';
import { JiraIngestionController } from './jira-ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { GraphSyncService } from './graph-sync.service.js';
import { GitSyncService } from './git-sync.service.js';
import { JiraAdapterService } from './jira-adapter.service.js';

@Module({
  controllers: [IngestionController, GitWebhookController, JiraIngestionController],
  providers: [IngestionService, GraphSyncService, GitSyncService, JiraAdapterService],
  exports: [IngestionService, GraphSyncService, GitSyncService, JiraAdapterService],
})
export class IngestionModule {}
