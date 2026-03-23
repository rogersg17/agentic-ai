export enum ExecutionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TestResultStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMED_OUT = 'timed_out',
}

export enum FailureClassification {
  REGRESSION = 'regression',
  FLAKE = 'flake',
  ENVIRONMENT = 'environment',
  OBSOLETE = 'obsolete',
  UNCLASSIFIED = 'unclassified',
}

export enum TriggerSource {
  MANUAL = 'manual',
  CI_WEBHOOK = 'ci_webhook',
  SCHEDULED = 'scheduled',
}

export enum ActorType {
  HUMAN = 'human',
  SYSTEM = 'system',
  AGENT = 'agent',
}

export enum GenerationStatus {
  QUEUED = 'queued',
  GENERATING = 'generating',
  REVIEW = 'review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// ─── Execution run types ────────────────────────────────────────────────────────

export interface BrowserConfig {
  browsers: string[];
  headless: boolean;
  viewport?: { width: number; height: number };
  retries?: number;
  timeout?: number;
  workers?: number;
}

export interface ShardProgress {
  shardIndex: number;
  status: ExecutionStatus;
  testsTotal: number;
  testsCompleted: number;
  passed: number;
  failed: number;
  skipped: number;
}

/** WebSocket event payloads for real-time execution progress */
export enum ExecutionEvent {
  RUN_STARTED = 'execution:run_started',
  RUN_PROGRESS = 'execution:run_progress',
  RUN_COMPLETED = 'execution:run_completed',
  TEST_COMPLETED = 'execution:test_completed',
  SHARD_PROGRESS = 'execution:shard_progress',
}

export interface RunProgressPayload {
  runId: string;
  status: ExecutionStatus;
  totalTests: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
  shards?: ShardProgress[];
}

export interface TestCompletedPayload {
  runId: string;
  testResultId: string;
  testTitle: string;
  status: TestResultStatus;
  durationMs: number;
  errorMessage?: string;
  retryCount: number;
}

// ─── Classification types ───────────────────────────────────────────────────────

/** Result of running the failure classifier on a test result */
export interface ClassificationResult {
  classification: FailureClassification;
  confidence: number;
  reasoning: string;
  matchedPatterns: string[];
  method: 'heuristic' | 'llm' | 'manual';
}

/** A pattern used for deterministic classification of failures */
export interface FailurePattern {
  id: string;
  name: string;
  classification: FailureClassification;
  /** Regex patterns to match against error messages */
  errorPatterns: string[];
  /** Regex patterns to match against stack traces */
  stackPatterns: string[];
  /** Description of when this pattern matches */
  description: string;
  /** Priority (higher = matched first) */
  priority: number;
  enabled: boolean;
}

/** Triage action taken by a user on a classified failure */
export enum TriageAction {
  ACCEPT = 'accept',
  RECLASSIFY = 'reclassify',
  IGNORE = 'ignore',
  CREATE_DEFECT = 'create_defect',
}

/** Summary of classifications for a run */
export interface ClassificationSummary {
  total: number;
  byClassification: Record<FailureClassification, number>;
  avgConfidence: number;
  triaged: number;
  untriaged: number;
}
