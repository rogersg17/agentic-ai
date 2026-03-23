import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller.js';
import { GenerationService } from './generation.service.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';

@Module({
  imports: [KnowledgeModule],
  controllers: [GenerationController],
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
