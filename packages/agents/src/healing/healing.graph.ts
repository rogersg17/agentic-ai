/**
 * Healing Pipeline — orchestrates the self-healing flow:
 * Diagnose → Generate Proposal → Policy Check → Validate
 *
 * Uses LangGraph.js StateGraph for checkpointed, auditable state transitions.
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { LlmService, type LlmConfig } from '../llm/llm.service.js';
import { HealerAgent } from '../agents/healer.agent.js';
import { evaluatePolicy } from './policy-engine.js';
import { validateAssertionImmutability } from './assertion-guard.js';
import type {
  HealingContext,
  HealingState,
  HealingDiagnosis,
  HealingProposalDraft,
} from './types.js';

// ─── LangGraph State Schema ────────────────────────────────────────────────────

const HealingAnnotation = Annotation.Root({
  requestId: Annotation<string>,
  runId: Annotation<string>,
  status: Annotation<HealingState['status']>,
  context: Annotation<HealingContext>,
  diagnosis: Annotation<HealingDiagnosis | undefined>,
  proposals: Annotation<HealingProposalDraft[]>,
  validationResults: Annotation<HealingState['validationResults']>,
  error: Annotation<string | undefined>,
});

type StateType = typeof HealingAnnotation.State;

// ─── Pipeline Config ────────────────────────────────────────────────────────────

export interface HealingPipelineConfig {
  llmConfig: LlmConfig;
}

/**
 * Build a compiled LangGraph StateGraph for the healing pipeline.
 */
export function buildHealingGraph(config: HealingPipelineConfig) {
  const llm = new LlmService(config.llmConfig);
  const healer = new HealerAgent(llm);

  // ─── Node functions ─────────────────────────────────────────────────────────

  async function diagnoseNode(state: StateType): Promise<Partial<StateType>> {
    try {
      const diagnosis = await healer.diagnose(state.context);
      return { status: 'diagnosing', diagnosis };
    } catch (err) {
      return { status: 'failed', error: `Diagnosis failed: ${String(err)}` };
    }
  }

  async function generateProposalNode(state: StateType): Promise<Partial<StateType>> {
    if (!state.diagnosis) {
      return { status: 'failed', error: 'No diagnosis available' };
    }

    try {
      const proposal = await healer.propose(state.context, state.diagnosis);
      if (!proposal) {
        return {
          status: 'complete',
          proposals: [],
          validationResults: [],
        };
      }

      // Run policy checks
      const policyResult = evaluatePolicy(proposal, state.context);
      const checkedProposal = { ...proposal, policyChecks: policyResult };

      return { status: 'generating', proposals: [checkedProposal] };
    } catch (err) {
      return { status: 'failed', error: `Proposal generation failed: ${String(err)}` };
    }
  }

  async function validateNode(state: StateType): Promise<Partial<StateType>> {
    const results: HealingState['validationResults'] = [];

    for (let i = 0; i < state.proposals.length; i++) {
      const proposal = state.proposals[i];

      // Validate policy checks passed
      if (!proposal.policyChecks.passed) {
        results.push({
          proposalIndex: i,
          passed: false,
          message: `Policy check failed: ${proposal.policyChecks.checks.filter((c) => !c.passed).map((c) => c.message).join('; ')}`,
        });
        continue;
      }

      // Validate assertion immutability (double-check)
      const assertionViolations = validateAssertionImmutability(
        proposal.originalCode,
        proposal.proposedCode,
      );
      if (assertionViolations.length > 0) {
        results.push({
          proposalIndex: i,
          passed: false,
          message: `Assertion immutability violated: ${assertionViolations[0].violation}`,
        });
        continue;
      }

      // Basic syntax check: ensure the proposed code has valid structure
      const syntaxOk = basicSyntaxCheck(proposal.proposedCode);
      if (!syntaxOk) {
        results.push({
          proposalIndex: i,
          passed: false,
          message: 'Proposed code has syntax issues (unbalanced brackets/parens)',
        });
        continue;
      }

      results.push({
        proposalIndex: i,
        passed: true,
        message: 'All validation checks passed',
      });
    }

    return { status: 'complete', validationResults: results };
  }

  // ─── Routing ──────────────────────────────────────────────────────────────────

  function routeAfterDiagnosis(state: StateType): string {
    if (state.status === 'failed') return END;
    return 'generateProposal';
  }

  function routeAfterGeneration(state: StateType): string {
    if (state.status === 'failed') return END;
    if (state.proposals.length === 0) return END; // No proposal generated
    return 'validate';
  }

  // ─── Graph Assembly ───────────────────────────────────────────────────────────

  const graph = new StateGraph(HealingAnnotation)
    .addNode('diagnose', diagnoseNode)
    .addNode('generateProposal', generateProposalNode)
    .addNode('validate', validateNode)
    .addEdge(START, 'diagnose')
    .addConditionalEdges('diagnose', routeAfterDiagnosis, ['generateProposal', END])
    .addConditionalEdges('generateProposal', routeAfterGeneration, ['validate', END])
    .addEdge('validate', END);

  return graph.compile();
}

/**
 * Run the healing pipeline for a single failing test.
 */
export async function runHealingPipeline(
  config: HealingPipelineConfig,
  requestId: string,
  runId: string,
  context: HealingContext,
): Promise<HealingState> {
  const graph = buildHealingGraph(config);

  const initialState: StateType = {
    requestId,
    runId,
    status: 'diagnosing',
    context,
    diagnosis: undefined,
    proposals: [],
    validationResults: [],
    error: undefined,
  };

  const result = await graph.invoke(initialState);

  return {
    requestId: result.requestId,
    runId: result.runId,
    status: result.status,
    context: result.context,
    diagnosis: result.diagnosis,
    proposals: result.proposals,
    validationResults: result.validationResults,
    error: result.error,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Basic bracket/paren balance check */
function basicSyntaxCheck(code: string): boolean {
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (inString) {
      if (c === stringChar && prev !== '\\') inString = false;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }

    if (c === '(') parens++;
    else if (c === ')') parens--;
    else if (c === '[') brackets++;
    else if (c === ']') brackets--;
    else if (c === '{') braces++;
    else if (c === '}') braces--;

    if (parens < 0 || brackets < 0 || braces < 0) return false;
  }

  return parens === 0 && brackets === 0 && braces === 0;
}
