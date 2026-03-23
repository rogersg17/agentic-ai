import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import neo4j, { Driver } from 'neo4j-driver';
import Redis from 'ioredis';

interface ServiceStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

interface HealthReport {
  status: 'healthy' | 'degraded';
  timestamp: string;
  services: {
    postgres: ServiceStatus;
    neo4j: ServiceStatus;
    redis: ServiceStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [pg, n4j, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkNeo4j(),
      this.checkRedis(),
    ]);

    const allUp = pg.status === 'up' && n4j.status === 'up' && redis.status === 'up';

    return {
      status: allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        postgres: pg,
        neo4j: n4j,
        redis,
      },
    };
  }

  private async checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    let client: ReturnType<typeof postgres> | undefined;
    try {
      const connectionString = this.configService.get<string>(
        'postgres.connectionString',
        'postgres://agentic:agentic_dev@localhost:5432/agentic_platform',
      );
      client = postgres(connectionString, { connect_timeout: 5 });
      await client`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: String(err) };
    } finally {
      if (client) await client.end().catch(() => {});
    }
  }

  private async checkNeo4j(): Promise<ServiceStatus> {
    const start = Date.now();
    let driver: Driver | undefined;
    try {
      const uri = this.configService.get<string>('neo4j.uri', 'bolt://localhost:7687');
      const user = this.configService.get<string>('neo4j.user', 'neo4j');
      const password = this.configService.get<string>('neo4j.password', 'agentic_dev');
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      const serverInfo = await driver.getServerInfo();
      return { status: serverInfo ? 'up' : 'down', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: String(err) };
    } finally {
      if (driver) await driver.close().catch(() => {});
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    let client: Redis | undefined;
    try {
      const host = this.configService.get<string>('redis.host', 'localhost');
      const port = this.configService.get<number>('redis.port', 6379);
      client = new Redis({ host, port, connectTimeout: 5000, lazyConnect: true });
      await client.connect();
      await client.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: String(err) };
    } finally {
      if (client) await client.quit().catch(() => {});
    }
  }
}
