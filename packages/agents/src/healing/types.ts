/**
 * Types for the self-healing pipeline.
 */

import type { HealingChangeType, HealingRiskLevel, HealingPolicy } from '@agentic/shared';

/** A single failing test to analyze for healing */
export interface HealingTarget {
  testResultId: string;
  testCaseNeo4jId: string;
  /** Original test source code */
  sourceCode: string;
  /** File path of the test */
  filePath: string;
  errorMessage: string | null;
  stackTrace: string | null;
  /** Before/after DOM snapshots if available */
  domSnapshotBefore: string | null;
  domSnapshotAfter: string | null;
  /** Screenshot URL or base64 */
  screenshotUrl: string | null;
  /** Number of times this test has been healed previously */
  priorHealingCount: number;
}

/** Context assembled from the knowledge graph for healing */
export interface HealingContext {
  /** Project-level healing policy */
  policy: HealingPolicy;
  /** The failing test to heal */
  target: HealingTarget;
  /** Page objects used by the test */
  pageObjects: Array<{
    id: string;
    className: string;
    filePath: string;
    sourceContent: string;
    selectors: Array<{ strategy: string; value: string }>;
    methods: Array<{ name: string; params: string[] }>;
  }>;
  /** How many proposals have been created for this run so far */
  runProposalCount: number;
  /** How many proposals have been created for this test so far */
  testProposalCount: number;
}

/** DOM diff result comparing before/after snapshots */
export interface DomDiff {
  /** Elements that changed */
  changedElements: Array<{
    selector: string;
    changeType: 'added' | 'removed' | 'modified' | 'moved';
    oldAttributes?: Record<string, string>;
    newAttributes?: Record<string, string>;
    oldText?: string;
    newText?: string;
  }>;
  /** Suggested alternative selectors for removed/modified elements */
  suggestedSelectors: Array<{
    original: string;
    alternatives: Array<{
      selector: string;
      strategy: string;
      confidence: number;
    }>;
  }>;
}

/** Diagnosis produced by the Healer Agent */
export interface HealingDiagnosis {
  /** What type of change is needed */
  changeType: HealingChangeType;
  /** Assessed risk level */
  riskLevel: HealingRiskLevel;
  /** Confidence in the diagnosis (0–1) */
  confidence: number;
  /** Human-readable explanation */
  explanation: string;
  /** Specific lines/selectors that need changes */
  affectedLocations: Array<{
    lineNumber: number;
    selector?: string;
    issue: string;
  }>;
  /** Evidence backing the diagnosis */
  evidence: {
    domDiff?: DomDiff;
    errorAnalysis: string;
    matchedPattern?: string;
  };
}

/** A single proposed code change */
export interface HealingProposalDraft {
  changeType: HealingChangeType;
  riskLevel: HealingRiskLevel;
  originalCode: string;
  proposedCode: string;
  unifiedDiff: string;
  explanation: string;
  confidence: number;
  evidence: Record<string, unknown>;
  policyChecks: PolicyCheckResult;
}

/** Result of running all policy checks on a proposal */
export interface PolicyCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
  autoApprovable: boolean;
}

/** Complete healing pipeline state */
export interface HealingState {
  requestId: string;
  runId: string;
  status: 'diagnosing' | 'generating' | 'validating' | 'complete' | 'failed';
  context: HealingContext;
  diagnosis?: HealingDiagnosis;
  proposals: HealingProposalDraft[];
  validationResults: Array<{
    proposalIndex: number;
    passed: boolean;
    message: string;
  }>;
  error?: string;
}
