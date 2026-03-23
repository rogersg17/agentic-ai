/**
 * Types for the generation pipeline.
 */

/** Input context assembled from the knowledge graph for generation. */
export interface GenerationContext {
  /** The requirement being targeted */
  requirement: {
    id: string;
    title: string;
    body: string;
    type: string;
    acceptanceCriteria: string[];
  };

  /** Related requirements (parent/child/depends) */
  relatedRequirements: Array<{
    id: string;
    title: string;
    relationship: string;
  }>;

  /** Page objects available in the project */
  pageObjects: Array<{
    id: string;
    className: string;
    filePath: string;
    methods: Array<{
      name: string;
      params: string[];
      returnType?: string;
    }>;
    selectors: Array<{
      strategy: string;
      value: string;
    }>;
  }>;

  /** Helpers available in the project */
  helpers: Array<{
    id: string;
    filePath: string;
    functions: Array<{
      name: string;
      params: string[];
      returnType?: string;
    }>;
  }>;

  /** Fixtures available in the project */
  fixtures: Array<{
    id: string;
    name: string;
    provides: string;
    scope: string;
  }>;

  /** Existing tests to avoid duplication */
  existingTests: Array<{
    id: string;
    title: string;
    filePath: string;
  }>;

  /** Style exemplar tests used for style extraction */
  styleExemplars: Array<{
    id: string;
    title: string;
    sourceContent: string;
  }>;
}

/** Extracted style profile from existing test exemplars */
export interface StyleProfile {
  importStyle: string;
  describeStructure: boolean;
  assertionStyle: 'expect' | 'assert' | 'mixed';
  usesTestSteps: boolean;
  pageObjectPattern: 'constructor' | 'fixture' | 'inline';
  namingConvention: 'should' | 'descriptive' | 'mixed';
  averageTestLength: number;
  commentDensity: 'none' | 'light' | 'heavy';
}

/** Analyst Agent output: parsed/enriched requirement */
export interface AnalysisResult {
  requirementId: string;
  title: string;
  acceptanceCriteria: Array<{
    id: string;
    text: string;
    testable: boolean;
    suggestedTestType: string;
  }>;
  suggestedTestCount: number;
  complexity: 'low' | 'medium' | 'high';
  missingContext: string[];
}

/** Generator Agent output: generated test code */
export interface GeneratedTest {
  /** Generated Playwright test code */
  code: string;
  /** File path suggestion */
  suggestedFilePath: string;
  /** Which acceptance criteria it covers */
  coveredCriteria: string[];
  /** Model used for generation */
  model: string;
  /** Token usage stats */
  tokenUsage: { prompt: number; completion: number; total: number };
}

/** Reviewer Agent output: pre-review checklist */
export interface ReviewResult {
  passed: boolean;
  score: number;
  checks: Array<{
    name: string;
    passed: boolean;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
  suggestions: string[];
}

/** Post-processing result */
export interface PostProcessingResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
  fixedCode?: string;
}

/** Complete generation pipeline state */
export interface GenerationState {
  requestId: string;
  projectId: string;
  status: 'analyzing' | 'generating' | 'reviewing' | 'post-processing' | 'complete' | 'failed';
  context: GenerationContext;
  styleProfile?: StyleProfile;
  analysis?: AnalysisResult;
  generatedTests: GeneratedTest[];
  reviewResults: ReviewResult[];
  postProcessingResults: PostProcessingResult[];
  error?: string;
}
