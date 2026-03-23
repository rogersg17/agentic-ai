import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { GraphSyncService } from './graph-sync.service.js';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, GraphSyncService],
  exports: [IngestionService, GraphSyncService],
})
export class IngestionModule {}
