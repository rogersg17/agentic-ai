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
