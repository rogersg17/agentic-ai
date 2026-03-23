import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

export interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'postgres.connectionString',
      'postgres://agentic:agentic_dev@localhost:5432/agentic_platform',
    );
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }

  async log(entry: AuditEntry): Promise<void> {
    const id = randomUUID();
    const beforeJson = entry.before ? JSON.stringify(entry.before) : null;
    const afterJson = entry.after ? JSON.stringify(entry.after) : null;

    await this.db.execute(sql`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, before_state, after_state, created_at)
      VALUES (
        ${id},
        ${entry.actorId},
        ${entry.action},
        ${entry.entityType},
        ${entry.entityId},
        ${beforeJson}::jsonb,
        ${afterJson}::jsonb,
        NOW()
      )
    `);
  }
}
