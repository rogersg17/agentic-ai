import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { DatabaseModule } from './database/database.module.js';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module.js';
import { StorageModule } from './storage/storage.module.js';
import { EmbeddingModule } from './embedding/embedding.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { ExecutionModule } from './execution/execution.module.js';
import { ClassificationModule } from './classification/classification.module.js';
import { GenerationModule } from './generation/generation.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    KnowledgeGraphModule,
    StorageModule,
    EmbeddingModule,
    AuthModule,
    AuditModule,
    IngestionModule,
    ProjectsModule,
    KnowledgeModule,
    ExecutionModule,
    ClassificationModule,
    GenerationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
