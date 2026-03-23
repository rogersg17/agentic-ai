import { Module } from '@nestjs/common';
import { HealingController } from './healing.controller.js';
import { HealingService } from './healing.service.js';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module.js';

@Module({
  imports: [KnowledgeGraphModule],
  controllers: [HealingController],
  providers: [HealingService],
  exports: [HealingService],
})
export class HealingModule {}
