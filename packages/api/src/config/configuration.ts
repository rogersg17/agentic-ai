export default () => ({
  api: {
    port: parseInt(process.env.API_PORT ?? '3001', 10),
  },

  postgres: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USER ?? 'agentic',
    password: process.env.POSTGRES_PASSWORD ?? 'agentic_dev',
    database: process.env.POSTGRES_DB ?? 'agentic_platform',
    get connectionString(): string {
      return (
        process.env.DATABASE_URL ??
        `postgres://${this.user}:${this.password}@${this.host}:${this.port}/${this.database}`
      );
    },
  },

  neo4j: {
    uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    user: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'agentic_dev',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'agentic',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'agentic_dev',
    bucket: process.env.MINIO_BUCKET ?? 'agentic-artifacts',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiration: process.env.JWT_EXPIRATION ?? '24h',
  },

  llm: {
    gatewayUrl: process.env.LLM_GATEWAY_URL ?? 'http://localhost:4000',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },

  execution: {
    workingDirectory: process.env.EXECUTION_WORKING_DIR ?? process.cwd(),
    maxConcurrentRuns: parseInt(process.env.EXECUTION_MAX_CONCURRENT ?? '3', 10),
    defaultTimeout: parseInt(process.env.EXECUTION_DEFAULT_TIMEOUT ?? '60000', 10),
    artifactRetentionDays: parseInt(process.env.ARTIFACT_RETENTION_DAYS ?? '30', 10),
  },
});
