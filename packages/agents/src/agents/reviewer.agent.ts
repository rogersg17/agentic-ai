/**
 * Reviewer Agent — pre-review checklist for AI-generated tests.
 * Performs deterministic checks + optional LLM-based quality assessment.
 * Flags issues but NEVER auto-approves.
 */

import { LlmService, type LlmMessage } from '../llm/llm.service.js';
import type { GeneratedTest, GenerationContext, ReviewResult } from '../generation/types.js';

interface ReviewCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export class ReviewerAgent {
  constructor(private readonly llm: LlmService) {}

  /**
   * Review a generated test against the checklist.
   */
  async review(
    test: GeneratedTest,
    context: GenerationContext,
  ): Promise<ReviewResult> {
    const checks: ReviewCheck[] = [];

    // 1. Assertion presence check
    checks.push(this.checkAssertionPresence(test.code));

    // 2. Import validation
    checks.push(this.checkImports(test.code));

    // 3. Traceability annotations
    checks.push(this.checkTraceability(test.code, test.coveredCriteria));

    // 4. Page object usage (no inline selectors when POs available)
    checks.push(this.checkPageObjectUsage(test.code, context));

    // 5. No hardcoded credentials/secrets
    checks.push(this.checkNoSecrets(test.code));

    // 6. Test structure (has describe/test blocks)
    checks.push(this.checkTestStructure(test.code));

    // 7. No TODO items that block execution
    checks.push(this.checkTodoItems(test.code));

    // 8. Generated annotation present
    checks.push(this.checkGeneratedAnnotation(test.code));

    // Optional: LLM quality assessment
    const llmCheck = await this.llmQualityCheck(test, context);
    if (llmCheck) {
      checks.push(llmCheck);
    }

    const errorCount = checks.filter((c) => !c.passed && c.severity === 'error').length;
    const warningCount = checks.filter((c) => !c.passed && c.severity === 'warning').length;
    const totalChecks = checks.length;
    const passedChecks = checks.filter((c) => c.passed).length;

    const score = Math.round((passedChecks / totalChecks) * 100);

    return {
      passed: errorCount === 0,
      score,
      checks,
      suggestions: this.generateSuggestions(checks, warningCount),
    };
  }

  private checkAssertionPresence(code: string): ReviewCheck {
    const hasExpect = /expect\s*\(/.test(code);
    const hasAssert = /assert\s*[.(]/.test(code);
    const hasToHave = /\.toHave|\.toBe|\.toEqual|\.toContain|\.toBeTruthy|\.toBeFalsy/.test(code);

    const passed = hasExpect || hasAssert || hasToHave;
    return {
      name: 'Assertion presence',
      passed,
      severity: 'error',
      message: passed
        ? 'Test contains at least one assertion'
        : 'No assertions found — every test must verify something',
    };
  }

  private checkImports(code: string): ReviewCheck {
    const hasPlaywrightImport = /@playwright\/test/.test(code);
    const passed = hasPlaywrightImport;
    return {
      name: 'Playwright import',
      passed,
      severity: 'error',
      message: passed
        ? 'Playwright test import present'
        : 'Missing import from @playwright/test',
    };
  }

  private checkTraceability(code: string, coveredCriteria: string[]): ReviewCheck {
    const annotations = code.match(/@covers\s+AC-\d+/g) ?? [];
    const passed = annotations.length > 0 || coveredCriteria.length > 0;
    return {
      name: 'Traceability annotations',
      passed,
      severity: 'warning',
      message: passed
        ? `Found ${annotations.length} @covers annotation(s)`
        : 'No @covers annotations — add traceability links to requirements',
    };
  }

  private checkPageObjectUsage(code: string, context: GenerationContext): ReviewCheck {
    if (context.pageObjects.length === 0) {
      return {
        name: 'Page object usage',
        passed: true,
        severity: 'info',
        message: 'No page objects available in project',
      };
    }

    // Check for inline selectors that should use POs
    const inlineSelectors = code.match(/page\.locator\s*\(\s*['"].*?['"]\s*\)/g) ?? [];
    const hasInline = inlineSelectors.length > 3; // Allow a few inline selectors

    return {
      name: 'Page object usage',
      passed: !hasInline,
      severity: 'warning',
      message: hasInline
        ? `Found ${inlineSelectors.length} inline selectors — consider using page objects`
        : 'Page object usage looks appropriate',
    };
  }

  private checkNoSecrets(code: string): ReviewCheck {
    const secretPatterns = [
      /password\s*[:=]\s*['"][^'"]{3,}['"]/i,
      /api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i,
      /secret\s*[:=]\s*['"][^'"]{3,}['"]/i,
      /token\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/i,
    ];

    const hasSecrets = secretPatterns.some((p) => p.test(code));
    return {
      name: 'No hardcoded secrets',
      passed: !hasSecrets,
      severity: 'error',
      message: hasSecrets
        ? 'Potential hardcoded credentials detected — use environment variables'
        : 'No hardcoded secrets found',
    };
  }

  private checkTestStructure(code: string): ReviewCheck {
    const hasTest = /test\s*\(/.test(code) || /test\.describe/.test(code);
    return {
      name: 'Test structure',
      passed: hasTest,
      severity: 'error',
      message: hasTest
        ? 'Valid test structure detected'
        : 'No test() or test.describe() blocks found',
    };
  }

  private checkTodoItems(code: string): ReviewCheck {
    const todos = code.match(/\/\/\s*TODO/gi) ?? [];
    const hasBlockingTodos = todos.length > 0;
    return {
      name: 'TODO items',
      passed: !hasBlockingTodos,
      severity: 'warning',
      message: hasBlockingTodos
        ? `Found ${todos.length} TODO item(s) — review before approving`
        : 'No TODO items',
    };
  }

  private checkGeneratedAnnotation(code: string): ReviewCheck {
    const hasAnnotation = /@generated/.test(code);
    return {
      name: 'Generated annotation',
      passed: hasAnnotation,
      severity: 'info',
      message: hasAnnotation
        ? '@generated annotation present for audit trail'
        : 'Missing @generated annotation',
    };
  }

  private async llmQualityCheck(
    test: GeneratedTest,
    context: GenerationContext,
  ): Promise<ReviewCheck | null> {
    try {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: `You are a Playwright test code reviewer. Rate the test quality from 1-10 and identify critical issues.
Respond ONLY with JSON: { "score": number, "issues": string[], "quality": "good"|"acceptable"|"poor" }`,
        },
        {
          role: 'user',
          content: `Review this generated test:\n\n${test.code.slice(0, 4000)}\n\nRequirement: ${context.requirement.title}`,
        },
      ];

      const response = await this.llm.chat(messages, { temperature: 0.1, maxTokens: 1024 });
      const parsed = JSON.parse(response.content) as {
        score: number;
        issues: string[];
        quality: string;
      };

      return {
        name: 'LLM quality assessment',
        passed: parsed.quality !== 'poor',
        severity: parsed.quality === 'poor' ? 'warning' : 'info',
        message: `Quality: ${parsed.quality} (${parsed.score}/10)${parsed.issues.length > 0 ? ` — Issues: ${parsed.issues.join('; ')}` : ''}`,
      };
    } catch {
      // LLM unavailable — skip this check
      return null;
    }
  }

  private generateSuggestions(checks: ReviewCheck[], warningCount: number): string[] {
    const suggestions: string[] = [];

    for (const check of checks) {
      if (!check.passed && check.severity === 'error') {
        suggestions.push(`Fix: ${check.message}`);
      }
    }

    if (warningCount > 0) {
      suggestions.push('Review warnings and consider addressing them before approval');
    }

    return suggestions;
  }
}
