/** Queue names used by BullMQ */
export const QUEUE_NAMES = {
  INGESTION: 'ingestion',
  GENERATION: 'generation',
  HEALING: 'healing',
  ANALYSIS: 'analysis',
  EXECUTION: 'execution',
  NEO4J_SYNC: 'neo4j-sync',
} as const;

/** Neo4j node labels */
export const NEO4J_LABELS = {
  REQUIREMENT: 'Requirement',
  TEST_CASE: 'TestCase',
  PAGE_OBJECT: 'PageObject',
  HELPER: 'Helper',
  FIXTURE: 'Fixture',
  DEFECT: 'Defect',
} as const;

/** Neo4j relationship types */
export const NEO4J_RELATIONSHIPS = {
  COVERED_BY: 'COVERED_BY',
  PARTIALLY_COVERED_BY: 'PARTIALLY_COVERED_BY',
  USES_PAGE_OBJECT: 'USES_PAGE_OBJECT',
  USES_HELPER: 'USES_HELPER',
  USES_FIXTURE: 'USES_FIXTURE',
  BLOCKED_BY: 'BLOCKED_BY',
  RELATED_TO: 'RELATED_TO',
  EXPOSED: 'EXPOSED',
  PARENT_OF: 'PARENT_OF',
  DEPENDS_ON: 'DEPENDS_ON',
  EXTENDS: 'EXTENDS',
  USES: 'USES',
} as const;

/** MinIO bucket names */
export const BUCKETS = {
  ARTIFACTS: 'agentic-artifacts',
} as const;

/** Artifact path prefixes in object storage */
export const ARTIFACT_PATHS = {
  TRACES: 'traces',
  SCREENSHOTS: 'screenshots',
  DOM_SNAPSHOTS: 'dom-snapshots',
  LOGS: 'logs',
  UPLOADS: 'uploads',
} as const;
