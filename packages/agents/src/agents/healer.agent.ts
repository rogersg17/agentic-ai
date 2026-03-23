/**
 * Healer Agent — diagnoses test failures and proposes minimal, evidence-backed code fixes.
 *
 * Uses deterministic heuristics (selector patterns, error message analysis) first,
 * and falls back to LLM reasoning for ambiguous failures.
 * Business assertions are NEVER modified (enforced by assertion immutability checks).
 */

import { HealingChangeType, HealingRiskLevel } from '@agentic/shared';
import { LlmService, type LlmMessage } from '../llm/llm.service.js';
import type {
  HealingContext,
  HealingDiagnosis,
  HealingProposalDraft,
  DomDiff,
} from '../healing/types.js';
import { createUnifiedDiff } from '../healing/diff-utils.js';
import { isAssertionLine } from '../healing/assertion-guard.js';

// ─── Error patterns for deterministic diagnosis ─────────────────────────────────

interface DiagnosticPattern {
  id: string;
  changeType: HealingChangeType;
  riskLevel: HealingRiskLevel;
  errorPatterns: RegExp[];
  stackPatterns: RegExp[];
  confidence: number;
  explanation: string;
}

const DIAGNOSTIC_PATTERNS: DiagnosticPattern[] = [
  {
    id: 'selector-not-found',
    changeType: HealingChangeType.SELECTOR_UPDATE,
    riskLevel: HealingRiskLevel.LOW,
    errorPatterns: [
      /No element found for selector/i,
      /locator resolved to 0 elements/i,
      /Timeout \d+ms exceeded.*waiting for (selector|locator)/i,
      /locator\.(?:click|fill|check|hover).*Timeout/i,
    ],
    stackPatterns: [],
    confidence: 0.85,
    explanation: 'Element selector no longer matches any DOM element — likely a UI change.',
  },
  {
    id: 'strict-mode-violation',
    changeType: HealingChangeType.SELECTOR_UPDATE,
    riskLevel: HealingRiskLevel.MEDIUM,
    errorPatterns: [
      /strict mode violation/i,
      /locator resolved to \d+ elements/i,
    ],
    stackPatterns: [],
    confidence: 0.80,
    explanation: 'Selector matches multiple elements — needs to be more specific.',
  },
  {
    id: 'navigation-changed',
    changeType: HealingChangeType.NAVIGATION_PATH,
    riskLevel: HealingRiskLevel.MEDIUM,
    errorPatterns: [
      /page\.goto.*404/i,
      /net::ERR_ABORTED.*404/i,
      /Navigation to .* was interrupted/i,
      /page\.goto\(.*\).*net::ERR_TOO_MANY_REDIRECTS/i,
    ],
    stackPatterns: [],
    confidence: 0.75,
    explanation: 'Navigation URL has changed or is no longer valid.',
  },
  {
    id: 'frame-switch-needed',
    changeType: HealingChangeType.FRAME_SWITCH,
    riskLevel: HealingRiskLevel.LOW,
    errorPatterns: [
      /frame was detached/i,
      /Frame with.*not found/i,
      /frameLocator.*resolved to 0/i,
    ],
    stackPatterns: [],
    confidence: 0.80,
    explanation: 'iframe reference is invalid — frame may have been renamed or restructured.',
  },
  {
    id: 'wait-condition-needed',
    changeType: HealingChangeType.WAIT_CONDITION,
    riskLevel: HealingRiskLevel.LOW,
    errorPatterns: [
      /Element is not (?:visible|stable|enabled)/i,
      /Element is not attached to the DOM/i,
      /Timeout \d+ms exceeded.*waiting for.*to be visible/i,
    ],
    stackPatterns: [],
    confidence: 0.80,
    explanation: 'Element exists but is not in the expected state — may need an explicit wait.',
  },
  {
    id: 'element-structure-changed',
    changeType: HealingChangeType.ELEMENT_STRUCTURE,
    riskLevel: HealingRiskLevel.HIGH,
    errorPatterns: [
      /can't access property .* of undefined/i,
      /Cannot read properties of null/i,
      /expected (?:locator|element) to (?:be|have)/i,
    ],
    stackPatterns: [/page-object/i, /\.po\./i, /pages\//i],
    confidence: 0.65,
    explanation: 'Element structure has changed — may require page object updates.',
  },
];

export class HealerAgent {
  constructor(private readonly llm: LlmService) {}

  /**
   * Diagnose a failing test: identify root cause and change type.
   */
  async diagnose(context: HealingContext): Promise<HealingDiagnosis> {
    const { target } = context;

    // 1. Try deterministic heuristic matching first
    const heuristicResult = this.heuristicDiagnosis(target.errorMessage, target.stackTrace);
    if (heuristicResult) {
      return this.enrichDiagnosis(heuristicResult, context);
    }

    // 2. Fall back to LLM for ambiguous failures
    return this.llmDiagnosis(context);
  }

  /**
   * Generate a healing proposal based on the diagnosis.
   */
  async propose(
    context: HealingContext,
    diagnosis: HealingDiagnosis,
  ): Promise<HealingProposalDraft | null> {
    const { target } = context;

    // Check policy limits first
    if (context.runProposalCount >= context.policy.maxHealingsPerRun) {
      return null; // Circuit breaker
    }
    if (context.testProposalCount >= context.policy.maxHealingsPerTest) {
      return null;
    }
    if (diagnosis.confidence < context.policy.minConfidenceThreshold) {
      return null; // Below minimum confidence
    }

    let proposedCode: string;

    switch (diagnosis.changeType) {
      case HealingChangeType.SELECTOR_UPDATE:
        proposedCode = this.healSelector(target.sourceCode, diagnosis, context);
        break;
      case HealingChangeType.WAIT_CONDITION:
        proposedCode = this.healWaitCondition(target.sourceCode, diagnosis);
        break;
      case HealingChangeType.FRAME_SWITCH:
        proposedCode = await this.healWithLlm(target.sourceCode, diagnosis, context);
        break;
      case HealingChangeType.NAVIGATION_PATH:
        proposedCode = await this.healWithLlm(target.sourceCode, diagnosis, context);
        break;
      case HealingChangeType.ELEMENT_STRUCTURE:
        proposedCode = await this.healWithLlm(target.sourceCode, diagnosis, context);
        break;
      default:
        return null;
    }

    // If no change was made, skip
    if (proposedCode === target.sourceCode) {
      return null;
    }

    const diff = createUnifiedDiff(target.filePath, target.sourceCode, proposedCode);

    return {
      changeType: diagnosis.changeType,
      riskLevel: diagnosis.riskLevel,
      originalCode: target.sourceCode,
      proposedCode,
      unifiedDiff: diff,
      explanation: diagnosis.explanation,
      confidence: diagnosis.confidence,
      evidence: {
        errorMessage: target.errorMessage,
        diagnosis: {
          changeType: diagnosis.changeType,
          affectedLocations: diagnosis.affectedLocations,
        },
        domDiff: diagnosis.evidence.domDiff ?? null,
      },
      policyChecks: { passed: true, checks: [], autoApprovable: false },
    };
  }

  // ─── Private: heuristic diagnosis ───────────────────────────────────────────

  private heuristicDiagnosis(
    errorMessage: string | null,
    stackTrace: string | null,
  ): HealingDiagnosis | null {
    const error = errorMessage ?? '';
    const stack = stackTrace ?? '';

    for (const pattern of DIAGNOSTIC_PATTERNS) {
      const errorMatch = pattern.errorPatterns.length === 0 ||
        pattern.errorPatterns.some((r) => r.test(error));
      const stackMatch = pattern.stackPatterns.length === 0 ||
        pattern.stackPatterns.some((r) => r.test(stack));

      if (errorMatch && stackMatch) {
        return {
          changeType: pattern.changeType,
          riskLevel: pattern.riskLevel,
          confidence: pattern.confidence,
          explanation: pattern.explanation,
          affectedLocations: this.extractAffectedLocations(error, stack),
          evidence: {
            errorAnalysis: `Matched pattern: ${pattern.id}`,
            matchedPattern: pattern.id,
          },
        };
      }
    }

    return null;
  }

  private extractAffectedLocations(
    error: string,
    stack: string,
  ): HealingDiagnosis['affectedLocations'] {
    const locations: HealingDiagnosis['affectedLocations'] = [];

    // Extract selector from error message
    const selectorMatch = error.match(
      /(?:selector|locator)\s*["'`]([^"'`]+)["'`]/i,
    );
    if (selectorMatch) {
      locations.push({
        lineNumber: 0,
        selector: selectorMatch[1],
        issue: 'Selector not found or ambiguous',
      });
    }

    // Extract line numbers from stack trace
    const lineMatches = stack.matchAll(/at.*?[:(](\d+):\d+/g);
    for (const m of lineMatches) {
      const lineNum = parseInt(m[1], 10);
      if (lineNum > 0 && locations.length < 5) {
        locations.push({ lineNumber: lineNum, issue: 'Stack frame' });
      }
    }

    return locations;
  }

  private enrichDiagnosis(
    diagnosis: HealingDiagnosis,
    context: HealingContext,
  ): HealingDiagnosis {
    // If DOM snapshots are available, try to compute diff
    if (context.target.domSnapshotBefore && context.target.domSnapshotAfter) {
      diagnosis.evidence.domDiff = this.computeDomDiff(
        context.target.domSnapshotBefore,
        context.target.domSnapshotAfter,
      );
    }
    return diagnosis;
  }

  // ─── Private: LLM-based diagnosis ──────────────────────────────────────────

  private async llmDiagnosis(context: HealingContext): Promise<HealingDiagnosis> {
    const { target, pageObjects } = context;
    const poSummary = pageObjects
      .map((po: { className: string; selectors: Array<{ strategy: string; value: string }> }) => `  ${po.className}: selectors=[${po.selectors.map((s: { value: string }) => s.value).join(', ')}]`)
      .join('\n');

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are a Playwright test healing expert. Diagnose why a test failed and suggest the minimal change type needed.
IMPORTANT: You must NEVER suggest modifying assertion logic (expect/assert statements). Only fix locators, waits, navigation, or frame references.

Respond ONLY with a JSON object (no markdown fences):
{
  "changeType": "selector_update" | "wait_condition" | "frame_switch" | "navigation_path" | "element_structure",
  "riskLevel": "low" | "medium" | "high",
  "confidence": 0.0–1.0,
  "explanation": "...",
  "affectedLocations": [{"lineNumber": N, "selector": "...", "issue": "..."}]
}`,
      },
      {
        role: 'user',
        content: `Test file: ${target.filePath}
Error: ${target.errorMessage ?? 'N/A'}
Stack trace (first 500 chars): ${(target.stackTrace ?? '').slice(0, 500)}

Page objects:
${poSummary || '  (none)'}

Test source (first 2000 chars):
${target.sourceCode.slice(0, 2000)}`,
      },
    ];

    const response = await this.llm.chat(messages, { temperature: 0.1, maxTokens: 1024 });

    try {
      const parsed = JSON.parse(response.content) as {
        changeType: string;
        riskLevel: string;
        confidence: number;
        explanation: string;
        affectedLocations: Array<{ lineNumber: number; selector?: string; issue: string }>;
      };

      return {
        changeType: parsed.changeType as HealingChangeType,
        riskLevel: parsed.riskLevel as HealingRiskLevel,
        confidence: Math.min(parsed.confidence, 0.9), // Cap LLM confidence
        explanation: parsed.explanation,
        affectedLocations: parsed.affectedLocations,
        evidence: {
          errorAnalysis: `LLM diagnosis: ${parsed.explanation}`,
        },
      };
    } catch {
      // If LLM output is unparseable, return a low-confidence selector update guess
      return {
        changeType: HealingChangeType.SELECTOR_UPDATE,
        riskLevel: HealingRiskLevel.MEDIUM,
        confidence: 0.4,
        explanation: 'Unable to determine root cause — LLM analysis inconclusive.',
        affectedLocations: [],
        evidence: {
          errorAnalysis: 'LLM response parsing failed',
        },
      };
    }
  }

  // ─── Private: healing strategies ──────────────────────────────────────────

  /**
   * Heal a broken selector by finding alternatives from DOM diff or page objects.
   */
  private healSelector(
    sourceCode: string,
    diagnosis: HealingDiagnosis,
    context: HealingContext,
  ): string {
    const lines = sourceCode.split('\n');
    let modified = false;

    for (const loc of diagnosis.affectedLocations) {
      if (!loc.selector) continue;

      // Find alternative selector from DOM diff suggestions
      const alternative = diagnosis.evidence.domDiff?.suggestedSelectors.find(
        (s: { original: string; alternatives: Array<{ selector: string; strategy: string; confidence: number }> }) => s.original === loc.selector,
      )?.alternatives[0];

      if (!alternative) continue;

      // Replace the selector in source code, but skip assertion lines
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(loc.selector) && !isAssertionLine(lines[i])) {
          lines[i] = lines[i].replace(loc.selector, alternative.selector);
          modified = true;
        }
      }
    }

    // If DOM diff didn't help, check page objects for matching selectors
    if (!modified) {
      for (const loc of diagnosis.affectedLocations) {
        if (!loc.selector) continue;

        for (const po of context.pageObjects) {
          const matchingSelector = po.selectors.find(
            (s: { strategy: string; value: string }) => s.value !== loc.selector && this.selectorLikelyMatches(s.value, loc.selector!),
          );
          if (matchingSelector) {
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(loc.selector) && !isAssertionLine(lines[i])) {
                lines[i] = lines[i].replace(loc.selector, matchingSelector.value);
                modified = true;
              }
            }
            break;
          }
        }
      }
    }

    return modified ? lines.join('\n') : sourceCode;
  }

  /**
   * Heal by adding an explicit wait condition before the failing action.
   */
  private healWaitCondition(
    sourceCode: string,
    diagnosis: HealingDiagnosis,
  ): string {
    const lines = sourceCode.split('\n');

    for (const loc of diagnosis.affectedLocations) {
      if (loc.lineNumber <= 0 || loc.lineNumber > lines.length) continue;
      const idx = loc.lineNumber - 1;
      const line = lines[idx];

      // Don't modify assertion lines
      if (isAssertionLine(line)) continue;

      // Extract the locator from the line
      const locatorMatch = line.match(
        /(page\.(?:locator|getByRole|getByText|getByTestId|getByLabel|getByPlaceholder)\([^)]+\))/,
      );
      if (locatorMatch) {
        const indent = line.match(/^(\s*)/)?.[1] ?? '';
        const waitLine = `${indent}await ${locatorMatch[1]}.waitFor({ state: 'visible' });`;
        lines.splice(idx, 0, waitLine);
        break; // Only add one wait
      }
    }

    return lines.join('\n');
  }

  /**
   * Use LLM for complex healing (frame switch, navigation, structure changes).
   */
  private async healWithLlm(
    sourceCode: string,
    diagnosis: HealingDiagnosis,
    context: HealingContext,
  ): Promise<string> {
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are a Playwright test healing expert. Apply the MINIMAL fix to the test code.

CRITICAL RULES:
1. NEVER modify expect() or assert() statements or their arguments — business assertions are immutable.
2. Only fix locators, wait conditions, navigation paths, or frame references.
3. Return ONLY the complete fixed source code, nothing else (no markdown fences, no explanations).
4. Preserve all other code exactly as-is: imports, test structure, variable names.
5. Make the smallest possible change that addresses the failure.`,
      },
      {
        role: 'user',
        content: `Diagnosis:
Change type: ${diagnosis.changeType}
Explanation: ${diagnosis.explanation}
Affected locations: ${JSON.stringify(diagnosis.affectedLocations)}

Original test code:
${sourceCode}

Page objects available:
${context.pageObjects.map((po: { className: string; selectors: Array<{ strategy: string; value: string }> }) => `${po.className}: ${po.selectors.map((s: { strategy: string; value: string }) => `${s.strategy}=${s.value}`).join(', ')}`).join('\n')}`,

      },
    ];

    const response = await this.llm.chat(messages, { temperature: 0.1, maxTokens: 4096 });

    // Validate the LLM output hasn't modified assertions
    const proposedCode = response.content.trim();
    if (this.assertionsModified(sourceCode, proposedCode)) {
      return sourceCode; // Reject — assertion modification detected
    }

    return proposedCode;
  }

  // ─── Private: helpers ─────────────────────────────────────────────────────

  private computeDomDiff(
    _snapshotBefore: string,
    _snapshotAfter: string,
  ): DomDiff {
    // Basic DOM diff — compare raw HTML structure
    // Full implementation would use a real DOM parser
    return {
      changedElements: [],
      suggestedSelectors: [],
    };
  }

  /** Rough check: do two selectors target a similar element? */
  private selectorLikelyMatches(candidate: string, broken: string): boolean {
    // If the candidate is a data-testid with similar name
    const brokenParts = broken.replace(/[^a-zA-Z0-9]/g, ' ').toLowerCase().split(/\s+/);
    const candidateParts = candidate.replace(/[^a-zA-Z0-9]/g, ' ').toLowerCase().split(/\s+/);
    const commonWords = brokenParts.filter((w) => w.length > 2 && candidateParts.includes(w));
    return commonWords.length >= 1 && commonWords.length / brokenParts.length >= 0.3;
  }

  /** Check if assertions were changed between original and proposed code */
  private assertionsModified(original: string, proposed: string): boolean {
    const origAssertions = original.split('\n').filter(isAssertionLine);
    const propAssertions = proposed.split('\n').filter(isAssertionLine);

    if (origAssertions.length !== propAssertions.length) return true;

    for (let i = 0; i < origAssertions.length; i++) {
      if (origAssertions[i].trim() !== propAssertions[i].trim()) return true;
    }

    return false;
  }
}
