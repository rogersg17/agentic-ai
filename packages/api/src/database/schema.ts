import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── helpers ────────────────────────────────────────────────────────────────────
const pkUuid = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

const createdAt = {
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ─── users ──────────────────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: pkUuid(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    password_hash: text('password_hash').notNull(),
    role: varchar('role', { length: 50 }).notNull(), // admin | sdet | manual_qa
    status: varchar('status', { length: 50 }).notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
  ],
);

// ─── projects ───────────────────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id: pkUuid(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),
    git_repos: jsonb('git_repos').notNull().default([]),
    settings: jsonb('settings').notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('projects_slug_idx').on(table.slug),
  ],
);

// ─── execution_runs ─────────────────────────────────────────────────────────────
export const executionRuns = pgTable(
  'execution_runs',
  {
    id: pkUuid(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    triggered_by: uuid('triggered_by').references(() => users.id),
    trigger_source: varchar('trigger_source', { length: 50 }).notNull(),
    ci_build_id: varchar('ci_build_id', { length: 255 }),
    git_commit: varchar('git_commit', { length: 255 }),
    git_branch: varchar('git_branch', { length: 255 }),
    environment: varchar('environment', { length: 255 }),
    browser_config: jsonb('browser_config').notNull().default({}),
    shard_count: integer('shard_count').notNull().default(1),
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    total_tests: integer('total_tests').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    flaky: integer('flaky').notNull().default(0),
    duration_ms: integer('duration_ms'),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    ...createdAt,
  },
  (table) => [
    index('execution_runs_project_id_idx').on(table.project_id),
    index('execution_runs_status_idx').on(table.status),
    index('execution_runs_created_at_idx').on(table.created_at),
  ],
);

// ─── test_results ───────────────────────────────────────────────────────────────
export const testResults = pgTable(
  'test_results',
  {
    id: pkUuid(),
    run_id: uuid('run_id')
      .notNull()
      .references(() => executionRuns.id),
    test_case_neo4j_id: varchar('test_case_neo4j_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    retry_count: integer('retry_count').notNull().default(0),
    duration_ms: integer('duration_ms'),
    error_message: text('error_message'),
    stack_trace: text('stack_trace'),
    failure_classification: varchar('failure_classification', { length: 50 }),
    classification_confidence: real('classification_confidence'),
    screenshot_url: text('screenshot_url'),
    trace_url: text('trace_url'),
    dom_snapshot_url: text('dom_snapshot_url'),
    log_url: text('log_url'),
    shard_index: integer('shard_index'),
    ...createdAt,
  },
  (table) => [
    index('test_results_run_id_idx').on(table.run_id),
    index('test_results_status_idx').on(table.status),
    index('test_results_created_at_idx').on(table.created_at),
  ],
);

// ─── healing_proposals ──────────────────────────────────────────────────────────
export const healingProposals = pgTable(
  'healing_proposals',
  {
    id: pkUuid(),
    test_result_id: uuid('test_result_id')
      .notNull()
      .references(() => testResults.id),
    test_case_neo4j_id: varchar('test_case_neo4j_id', { length: 255 }).notNull(),
    change_type: varchar('change_type', { length: 50 }).notNull(),
    risk_level: varchar('risk_level', { length: 50 }).notNull(),
    original_code: text('original_code').notNull(),
    proposed_code: text('proposed_code').notNull(),
    unified_diff: text('unified_diff').notNull(),
    explanation: text('explanation').notNull(),
    confidence_score: real('confidence_score').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    reviewed_by: uuid('reviewed_by').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    policy_checks: jsonb('policy_checks').notNull().default({}),
    ...createdAt,
  },
  (table) => [
    index('healing_proposals_test_result_id_idx').on(table.test_result_id),
    index('healing_proposals_status_idx').on(table.status),
    index('healing_proposals_created_at_idx').on(table.created_at),
  ],
);

// ─── generation_requests ────────────────────────────────────────────────────────
export const generationRequests = pgTable(
  'generation_requests',
  {
    id: pkUuid(),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    requested_by: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    requirement_neo4j_ids: jsonb('requirement_neo4j_ids').notNull().default([]),
    page_object_neo4j_ids: jsonb('page_object_neo4j_ids').notNull().default([]),
    style_exemplar_neo4j_ids: jsonb('style_exemplar_neo4j_ids').notNull().default([]),
    configuration: jsonb('configuration').notNull().default({}),
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    generated_test_neo4j_ids: jsonb('generated_test_neo4j_ids').notNull().default([]),
    llm_model_used: varchar('llm_model_used', { length: 255 }),
    token_usage: jsonb('token_usage').notNull().default({}),
    ...createdAt,
  },
  (table) => [
    index('generation_requests_project_id_idx').on(table.project_id),
    index('generation_requests_status_idx').on(table.status),
    index('generation_requests_created_at_idx').on(table.created_at),
  ],
);

// ─── audit_log ──────────────────────────────────────────────────────────────────
export const auditLog = pgTable(
  'audit_log',
  {
    id: pkUuid(),
    project_id: uuid('project_id').references(() => projects.id),
    actor_id: uuid('actor_id').notNull(),
    actor_type: varchar('actor_type', { length: 50 }).notNull(), // human | system | agent
    action: varchar('action', { length: 255 }).notNull(),
    entity_type: varchar('entity_type', { length: 255 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    before_state: jsonb('before_state'),
    after_state: jsonb('after_state'),
    metadata: jsonb('metadata').notNull().default({}),
    ...createdAt,
  },
  (table) => [
    index('audit_log_project_id_idx').on(table.project_id),
    index('audit_log_actor_id_idx').on(table.actor_id),
    index('audit_log_entity_type_entity_id_idx').on(
      table.entity_type,
      table.entity_id,
    ),
    index('audit_log_created_at_idx').on(table.created_at),
  ],
);

// ─── relations ──────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  executionRuns: many(executionRuns),
  healingReviews: many(healingProposals),
  generationRequests: many(generationRequests),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  executionRuns: many(executionRuns),
  generationRequests: many(generationRequests),
  auditLogs: many(auditLog),
}));

export const executionRunsRelations = relations(
  executionRuns,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [executionRuns.project_id],
      references: [projects.id],
    }),
    triggeredBy: one(users, {
      fields: [executionRuns.triggered_by],
      references: [users.id],
    }),
    testResults: many(testResults),
  }),
);

export const testResultsRelations = relations(
  testResults,
  ({ one, many }) => ({
    run: one(executionRuns, {
      fields: [testResults.run_id],
      references: [executionRuns.id],
    }),
    healingProposals: many(healingProposals),
  }),
);

export const healingProposalsRelations = relations(
  healingProposals,
  ({ one }) => ({
    testResult: one(testResults, {
      fields: [healingProposals.test_result_id],
      references: [testResults.id],
    }),
    reviewer: one(users, {
      fields: [healingProposals.reviewed_by],
      references: [users.id],
    }),
  }),
);

export const generationRequestsRelations = relations(
  generationRequests,
  ({ one }) => ({
    project: one(projects, {
      fields: [generationRequests.project_id],
      references: [projects.id],
    }),
    requestedBy: one(users, {
      fields: [generationRequests.requested_by],
      references: [users.id],
    }),
  }),
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  project: one(projects, {
    fields: [auditLog.project_id],
    references: [projects.id],
  }),
}));
