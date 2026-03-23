import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { GitWebhookController } from './git-webhook.controller.js';
import { IngestionService } from './ingestion.service.js';
import { GraphSyncService } from './graph-sync.service.js';
import { GitSyncService } from './git-sync.service.js';

@Module({
  controllers: [IngestionController, GitWebhookController],
  providers: [IngestionService, GraphSyncService, GitSyncService],
  exports: [IngestionService, GraphSyncService, GitSyncService],
})
export class IngestionModule {}
