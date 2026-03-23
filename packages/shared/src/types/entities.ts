/** Entity types stored in the Neo4j knowledge graph */

export enum RequirementType {
  EPIC = 'epic',
  STORY = 'story',
  TASK = 'task',
  ACCEPTANCE_CRITERION = 'acceptance_criterion',
}

export enum EntityStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  PENDING_REVIEW = 'pending_review',
}

export enum Priority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum TestType {
  E2E = 'e2e',
  INTEGRATION = 'integration',
  COMPONENT = 'component',
  API = 'api',
}

export enum TestOrigin {
  HUMAN_AUTHORED = 'human_authored',
  AI_GENERATED = 'ai_generated',
  AI_HEALED = 'ai_healed',
}

export enum DefectSeverity {
  BLOCKER = 'blocker',
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor',
  TRIVIAL = 'trivial',
}

export enum DefectStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum LinkOrigin {
  MANUAL = 'manual',
  AI_SUGGESTED = 'ai_suggested',
  ANNOTATION_EXTRACTED = 'annotation_extracted',
}

/** Base properties shared by all knowledge graph nodes */
export interface KnowledgeNodeBase {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Requirement extends KnowledgeNodeBase {
  externalId?: string;
  title: string;
  body: string;
  type: RequirementType;
  status: EntityStatus;
  priority: Priority;
  ownerId?: string;
}

export interface TestCase extends KnowledgeNodeBase {
  filePath: string;
  fileHash: string;
  title: string;
  describeBlock?: string;
  testType: TestType;
  status: EntityStatus;
  origin: TestOrigin;
  confidenceScore?: number;
  sourceContent: string;
  astSummary?: Record<string, unknown>;
  locatorsUsed?: Array<{ strategy: string; value: string }>;
  fixturesUsed?: string[];
}

export interface PageObject extends KnowledgeNodeBase {
  filePath: string;
  fileHash: string;
  className: string;
  methods: Array<{
    name: string;
    params: string[];
    returnType?: string;
    locators?: Array<{ strategy: string; value: string }>;
  }>;
  selectors: Array<{
    strategy: string;
    value: string;
    targetElement?: string;
    pageUrlPattern?: string;
  }>;
  sourceContent: string;
}

export interface Helper extends KnowledgeNodeBase {
  filePath: string;
  exportedFunctions: Array<{
    name: string;
    params: string[];
    returnType?: string;
    description?: string;
  }>;
  sourceContent: string;
}

export interface Fixture extends KnowledgeNodeBase {
  name: string;
  filePath: string;
  scope: 'test' | 'worker';
  provides: string;
  dependencies: string[];
  sourceContent: string;
}

export interface Defect extends KnowledgeNodeBase {
  externalId?: string;
  title: string;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  affectedComponent?: string;
}
