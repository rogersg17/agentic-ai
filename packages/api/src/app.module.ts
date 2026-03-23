import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { DatabaseModule } from './database/database.module.js';
import { KnowledgeGraphModule } from './knowledge-graph/knowledge-graph.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    KnowledgeGraphModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
