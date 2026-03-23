/**
 * Analyst Agent — parses requirements and extracts testable acceptance criteria.
 * Uses LLM for complex requirement analysis, falls back to deterministic parsing.
 */

import { LlmService, type LlmMessage } from '../llm/llm.service.js';
import type { GenerationContext, AnalysisResult } from '../generation/types.js';

export class AnalystAgent {
  constructor(private readonly llm: LlmService) {}

  /**
   * Analyze a requirement and extract structured acceptance criteria.
   */
  async analyze(context: GenerationContext): Promise<AnalysisResult> {
    const { requirement } = context;

    // If acceptance criteria are already extracted (from ingestion), use them
    if (requirement.acceptanceCriteria.length > 0) {
      return this.buildFromExistingCriteria(requirement);
    }

    // Use LLM to extract acceptance criteria from requirement body
    return this.analyzeWithLlm(requirement);
  }

  private buildFromExistingCriteria(requirement: GenerationContext['requirement']): AnalysisResult {
    return {
      requirementId: requirement.id,
      title: requirement.title,
      acceptanceCriteria: requirement.acceptanceCriteria.map((text, i) => ({
        id: `AC-${i + 1}`,
        text,
        testable: true,
        suggestedTestType: this.inferTestType(text),
      })),
      suggestedTestCount: Math.max(1, requirement.acceptanceCriteria.length),
      complexity: this.estimateComplexity(requirement.acceptanceCriteria),
      missingContext: [],
    };
  }

  private async analyzeWithLlm(
    requirement: GenerationContext['requirement'],
  ): Promise<AnalysisResult> {
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are a test analysis expert. Given a requirement, extract testable acceptance criteria.
Respond ONLY with a JSON object (no markdown fences) matching this shape:
{
  "acceptanceCriteria": [
    { "id": "AC-1", "text": "...", "testable": true, "suggestedTestType": "e2e|integration|component|api" }
  ],
  "suggestedTestCount": number,
  "complexity": "low|medium|high",
  "missingContext": ["..."]
}`,
      },
      {
        role: 'user',
        content: `Requirement: ${requirement.title}\n\n${requirement.body}`,
      },
    ];

    const response = await this.llm.chat(messages, { temperature: 0.1, maxTokens: 2048 });

    try {
      const parsed = JSON.parse(response.content) as {
        acceptanceCriteria: AnalysisResult['acceptanceCriteria'];
        suggestedTestCount: number;
        complexity: 'low' | 'medium' | 'high';
        missingContext: string[];
      };

      return {
        requirementId: requirement.id,
        title: requirement.title,
        ...parsed,
      };
    } catch {
      // Fallback: split requirement body into acceptance criteria heuristically
      return this.heuristicAnalysis(requirement);
    }
  }

  private heuristicAnalysis(requirement: GenerationContext['requirement']): AnalysisResult {
    const lines = requirement.body.split('\n').filter((l) => l.trim().length > 0);
    const criteria: AnalysisResult['acceptanceCriteria'] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match bullet points, numbered items, "Given/When/Then", checkboxes
      if (
        /^[-*•]\s+/.test(trimmed) ||
        /^\d+[.)]\s+/.test(trimmed) ||
        /^(Given|When|Then|And)\s+/i.test(trimmed) ||
        /^\[[ x]\]\s+/i.test(trimmed)
      ) {
        const text = trimmed.replace(/^[-*•\d.)\[\]x\s]+/i, '').trim();
        if (text.length > 10) {
          criteria.push({
            id: `AC-${criteria.length + 1}`,
            text,
            testable: true,
            suggestedTestType: this.inferTestType(text),
          });
        }
      }
    }

    // If no structured criteria found, treat the whole body as one criterion
    if (criteria.length === 0) {
      criteria.push({
        id: 'AC-1',
        text: requirement.body.slice(0, 500),
        testable: true,
        suggestedTestType: 'e2e',
      });
    }

    return {
      requirementId: requirement.id,
      title: requirement.title,
      acceptanceCriteria: criteria,
      suggestedTestCount: Math.max(1, criteria.length),
      complexity: this.estimateComplexity(criteria.map((c) => c.text)),
      missingContext: [],
    };
  }

  private inferTestType(text: string): string {
    const lower = text.toLowerCase();
    if (/\b(api|endpoint|request|response|status code)\b/.test(lower)) return 'api';
    if (/\b(component|render|display|button|input|form)\b/.test(lower)) return 'component';
    if (/\b(navigate|page|url|redirect|login|flow|workflow)\b/.test(lower)) return 'e2e';
    return 'e2e';
  }

  private estimateComplexity(criteria: string[]): 'low' | 'medium' | 'high' {
    if (criteria.length <= 2) return 'low';
    if (criteria.length <= 5) return 'medium';
    return 'high';
  }
}
