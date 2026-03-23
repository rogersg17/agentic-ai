// Agent orchestration package
// Phase 4: Analyst, Generator, Reviewer agents + generation pipeline
// Phase 5: Healer agent + healing pipeline

// LLM service
export { LlmService, type LlmConfig, type LlmMessage, type LlmResponse } from './llm/llm.service.js';

// Agents
export { AnalystAgent } from './agents/analyst.agent.js';
export { GeneratorAgent } from './agents/generator.agent.js';
export { ReviewerAgent } from './agents/reviewer.agent.js';
export { HealerAgent } from './agents/healer.agent.js';

// Generation pipeline
export { buildGenerationGraph, runGenerationPipeline } from './generation/generation.graph.js';
export type { GenerationPipelineConfig } from './generation/generation.graph.js';
export { extractStyleProfile } from './generation/style-extractor.js';
export { postProcess } from './generation/post-processor.js';

// Healing pipeline
export { buildHealingGraph, runHealingPipeline } from './healing/healing.graph.js';
export type { HealingPipelineConfig } from './healing/healing.graph.js';
export { evaluatePolicy } from './healing/policy-engine.js';
export { isAssertionLine, extractAssertions, validateAssertionImmutability } from './healing/assertion-guard.js';
export { diffDomSnapshots } from './healing/dom-diff.js';
export { createUnifiedDiff } from './healing/diff-utils.js';

// Generation types
export type {
  GenerationContext,
  GenerationState,
  AnalysisResult,
  GeneratedTest,
  ReviewResult,
  PostProcessingResult,
  StyleProfile,
} from './generation/types.js';

// Healing types
export type {
  HealingTarget,
  HealingContext,
  HealingDiagnosis,
  HealingProposalDraft,
  HealingState,
  PolicyCheckResult,
  DomDiff,
} from './healing/types.js';
