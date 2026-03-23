import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgres://agentic:agentic_dev@localhost:5432/agentic_platform',
  },
  verbose: true,
  strict: true,
});
