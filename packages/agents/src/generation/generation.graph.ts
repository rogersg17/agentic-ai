/**
 * Generation Pipeline — orchestrates the full test generation flow:
 * Analyst → Style Extraction → Generator → Post-Processing → Reviewer
 *
 * Uses LangGraph.js StateGraph for checkpointed, auditable state transitions.
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { LlmService, type LlmConfig } from '../llm/llm.service.js';
import { AnalystAgent } from '../agents/analyst.agent.js';
import { GeneratorAgent } from '../agents/generator.agent.js';
import { ReviewerAgent } from '../agents/reviewer.agent.js';
import { extractStyleProfile } from './style-extractor.js';
import { postProcess } from './post-processor.js';
import type {
  GenerationContext,
  GenerationState,
  AnalysisResult,
  GeneratedTest,
  ReviewResult,
  PostProcessingResult,
  StyleProfile,
} from './types.js';

// ─── LangGraph State Schema ────────────────────────────────────────────────────

const GenerationAnnotation = Annotation.Root({
  requestId: Annotation<string>,
  projectId: Annotation<string>,
  status: Annotation<GenerationState['status']>,
  context: Annotation<GenerationContext>,
  styleProfile: Annotation<StyleProfile | undefined>,
  analysis: Annotation<AnalysisResult | undefined>,
  generatedTests: Annotation<GeneratedTest[]>,
  reviewResults: Annotation<ReviewResult[]>,
  postProcessingResults: Annotation<PostProcessingResult[]>,
  error: Annotation<string | undefined>,
});

type StateType = typeof GenerationAnnotation.State;

// ─── Pipeline Builder ───────────────────────────────────────────────────────────

export interface GenerationPipelineConfig {
  llmConfig: LlmConfig;
}

/**
 * Build a compiled LangGraph StateGraph for the generation pipeline.
 */
export function buildGenerationGraph(config: GenerationPipelineConfig) {
  const llm = new LlmService(config.llmConfig);
  const analyst = new AnalystAgent(llm);
  const generator = new GeneratorAgent(llm);
  const reviewer = new ReviewerAgent(llm);

  // ─── Node functions ─────────────────────────────────────────────────────────

  async function analyzeNode(state: StateType): Promise<Partial<StateType>> {
    try {
      const analysis = await analyst.analyze(state.context);
      return { status: 'analyzing', analysis };
    } catch (err) {
      return { status: 'failed', error: `Analysis failed: ${String(err)}` };
    }
  }

  async function extractStyleNode(state: StateType): Promise<Partial<StateType>> {
    const exemplarSources = state.context.styleExemplars.map((e) => e.sourceContent);
    const styleProfile = extractStyleProfile(exemplarSources);
    return { styleProfile };
  }

  async function generateNode(state: StateType): Promise<Partial<StateType>> {
    if (!state.analysis || !state.styleProfile) {
      return { status: 'failed', error: 'Missing analysis or style profile' };
    }

    try {
      const tests = await generator.generate(state.context, state.analysis, state.styleProfile);
      return { status: 'generating', generatedTests: tests };
    } catch (err) {
      return { status: 'failed', error: `Generation failed: ${String(err)}` };
    }
  }

  async function postProcessNode(state: StateType): Promise<Partial<StateType>> {
    const results: PostProcessingResult[] = [];
    const fixedTests: GeneratedTest[] = [];

    for (const test of state.generatedTests) {
      const result = postProcess(test, state.context);
      results.push(result);

      // Apply fixes if post-processor modified the code
      fixedTests.push(
        result.fixedCode ? { ...test, code: result.fixedCode } : test,
      );
    }

    return {
      status: 'post-processing',
      postProcessingResults: results,
      generatedTests: fixedTests,
    };
  }

  async function reviewNode(state: StateType): Promise<Partial<StateType>> {
    const results: ReviewResult[] = [];

    for (const test of state.generatedTests) {
      const result = await reviewer.review(test, state.context);
      results.push(result);
    }

    return { status: 'complete', reviewResults: results };
  }

  // ─── Routing ──────────────────────────────────────────────────────────────────

  function routeAfterAnalysis(state: StateType): string {
    if (state.status === 'failed') return END;
    return 'extractStyle';
  }

  function routeAfterGeneration(state: StateType): string {
    if (state.status === 'failed') return END;
    return 'postProcess';
  }

  // ─── Graph Assembly ───────────────────────────────────────────────────────────

  const graph = new StateGraph(GenerationAnnotation)
    .addNode('analyze', analyzeNode)
    .addNode('extractStyle', extractStyleNode)
    .addNode('generate', generateNode)
    .addNode('postProcess', postProcessNode)
    .addNode('review', reviewNode)
    .addEdge(START, 'analyze')
    .addConditionalEdges('analyze', routeAfterAnalysis, ['extractStyle', END])
    .addEdge('extractStyle', 'generate')
    .addConditionalEdges('generate', routeAfterGeneration, ['postProcess', END])
    .addEdge('postProcess', 'review')
    .addEdge('review', END);

  return graph.compile();
}

/**
 * Run the generation pipeline with the given context.
 * Returns the final generation state.
 */
export async function runGenerationPipeline(
  config: GenerationPipelineConfig,
  requestId: string,
  projectId: string,
  context: GenerationContext,
): Promise<GenerationState> {
  const graph = buildGenerationGraph(config);

  const initialState: StateType = {
    requestId,
    projectId,
    status: 'analyzing',
    context,
    styleProfile: undefined,
    analysis: undefined,
    generatedTests: [],
    reviewResults: [],
    postProcessingResults: [],
    error: undefined,
  };

  const result = await graph.invoke(initialState);

  return {
    requestId: result.requestId,
    projectId: result.projectId,
    status: result.status,
    context: result.context,
    styleProfile: result.styleProfile,
    analysis: result.analysis,
    generatedTests: result.generatedTests,
    reviewResults: result.reviewResults,
    postProcessingResults: result.postProcessingResults,
    error: result.error,
  };
}
