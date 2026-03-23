/**
 * Generator Agent — produces Playwright test code from requirements using
 * RAG context (page objects, helpers, fixtures) and style exemplars.
 */

import { LlmService, type LlmMessage } from '../llm/llm.service.js';
import type {
  GenerationContext,
  GeneratedTest,
  AnalysisResult,
  StyleProfile,
} from '../generation/types.js';

export class GeneratorAgent {
  constructor(private readonly llm: LlmService) {}

  /**
   * Generate Playwright tests for the analyzed requirement.
   */
  async generate(
    context: GenerationContext,
    analysis: AnalysisResult,
    styleProfile: StyleProfile,
  ): Promise<GeneratedTest[]> {
    const messages = this.buildPrompt(context, analysis, styleProfile);
    const response = await this.llm.chat(messages, {
      temperature: 0.3,
      maxTokens: 8192,
    });

    const tests = this.parseGeneratedTests(response.content, context, analysis);

    return tests.map((test) => ({
      ...test,
      model: response.model,
      tokenUsage: response.tokenUsage,
    }));
  }

  private buildPrompt(
    context: GenerationContext,
    analysis: AnalysisResult,
    styleProfile: StyleProfile,
  ): LlmMessage[] {
    const systemPrompt = this.buildSystemPrompt(styleProfile);
    const userPrompt = this.buildUserPrompt(context, analysis);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  private buildSystemPrompt(styleProfile: StyleProfile): string {
    return `You are an expert Playwright test engineer. Generate high-quality, production-ready Playwright tests.

## Code Style Requirements
- Import style: ${styleProfile.importStyle}
- ${styleProfile.describeStructure ? 'Use test.describe() blocks to group related tests' : 'Write flat test() calls without describe blocks'}
- Assertion style: Use ${styleProfile.assertionStyle === 'expect' ? 'expect()' : styleProfile.assertionStyle === 'assert' ? 'assert' : 'expect() primarily'} for assertions
- ${styleProfile.usesTestSteps ? 'Use test.step() for readable step grouping' : 'Do not use test.step()'}
- Page object pattern: ${styleProfile.pageObjectPattern}
- Naming: ${styleProfile.namingConvention === 'should' ? "Test names should start with 'should'" : 'Use descriptive test names'}
- Comment density: ${styleProfile.commentDensity}

## Critical Rules
1. NEVER generate business assertions without explicit acceptance criteria backing
2. ALWAYS use existing page objects and helpers when available — never inline selectors that exist in POs
3. Add \`// @covers AC-{n}\` annotations for traceability
4. Add \`// @generated\` annotation to indicate AI generation
5. Use \`test.step()\` for readability when steps > 3
6. Mark missing page object methods with \`// TODO: Add method to {PageObject}\`
7. Each test must have at least one assertion (expect/assert)
8. Follow the project's existing patterns exactly

## Output Format
Respond with ONLY the TypeScript test code. If generating multiple test files, separate them with:
\`// --- FILE: suggested/path/to/test.spec.ts ---\``;
  }

  private buildUserPrompt(context: GenerationContext, analysis: AnalysisResult): string {
    const sections: string[] = [];

    // Requirement
    sections.push(`## Requirement: ${analysis.title}`);
    sections.push(context.requirement.body);

    // Acceptance criteria
    sections.push('\n## Acceptance Criteria');
    for (const ac of analysis.acceptanceCriteria) {
      sections.push(`- ${ac.id}: ${ac.text} (${ac.testable ? 'testable' : 'informational'}, suggested type: ${ac.suggestedTestType})`);
    }

    // Page objects
    if (context.pageObjects.length > 0) {
      sections.push('\n## Available Page Objects');
      for (const po of context.pageObjects) {
        sections.push(`### ${po.className} (${po.filePath})`);
        sections.push('Methods:');
        for (const method of po.methods) {
          const params = method.params.join(', ');
          const ret = method.returnType ? `: ${method.returnType}` : '';
          sections.push(`  - ${method.name}(${params})${ret}`);
        }
      }
    }

    // Helpers
    if (context.helpers.length > 0) {
      sections.push('\n## Available Helpers');
      for (const helper of context.helpers) {
        sections.push(`### ${helper.filePath}`);
        for (const fn of helper.functions) {
          const params = fn.params.join(', ');
          sections.push(`  - ${fn.name}(${params})`);
        }
      }
    }

    // Fixtures
    if (context.fixtures.length > 0) {
      sections.push('\n## Available Fixtures');
      for (const fixture of context.fixtures) {
        sections.push(`- ${fixture.name}: provides \`${fixture.provides}\` (scope: ${fixture.scope})`);
      }
    }

    // Existing tests to avoid duplication
    if (context.existingTests.length > 0) {
      sections.push('\n## Existing Tests (DO NOT duplicate)');
      for (const test of context.existingTests) {
        sections.push(`- ${test.title} (${test.filePath})`);
      }
    }

    // Style exemplars
    if (context.styleExemplars.length > 0) {
      sections.push('\n## Style Exemplars (match this style)');
      for (const exemplar of context.styleExemplars.slice(0, 2)) {
        sections.push(`### ${exemplar.title}`);
        sections.push('```typescript');
        sections.push(exemplar.sourceContent.slice(0, 2000));
        sections.push('```');
      }
    }

    sections.push(`\n## Task
Generate ${analysis.suggestedTestCount} Playwright test(s) covering ALL acceptance criteria above.
Complexity: ${analysis.complexity}
Use existing page objects and helpers. Add traceability annotations.`);

    return sections.join('\n');
  }

  private parseGeneratedTests(
    content: string,
    context: GenerationContext,
    analysis: AnalysisResult,
  ): Omit<GeneratedTest, 'model' | 'tokenUsage'>[] {
    // Check if multiple files were generated
    const fileMarker = /\/\/\s*---\s*FILE:\s*(.+?)\s*---/g;
    const matches = [...content.matchAll(fileMarker)];

    if (matches.length > 0) {
      const tests: Omit<GeneratedTest, 'model' | 'tokenUsage'>[] = [];

      for (let i = 0; i < matches.length; i++) {
        const filePath = matches[i][1].trim();
        const start = matches[i].index! + matches[i][0].length;
        const end = i < matches.length - 1 ? matches[i + 1].index! : content.length;
        const code = content.slice(start, end).trim();

        tests.push({
          code,
          suggestedFilePath: filePath,
          coveredCriteria: this.extractCoveredCriteria(code, analysis),
        });
      }

      return tests;
    }

    // Single test file
    const slug = context.requirement.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    return [
      {
        code: content.trim(),
        suggestedFilePath: `tests/generated/${slug}.spec.ts`,
        coveredCriteria: this.extractCoveredCriteria(content, analysis),
      },
    ];
  }

  private extractCoveredCriteria(code: string, analysis: AnalysisResult): string[] {
    const covered: string[] = [];
    for (const ac of analysis.acceptanceCriteria) {
      if (code.includes(`@covers ${ac.id}`) || code.includes(ac.id)) {
        covered.push(ac.id);
      }
    }
    // If none explicitly tagged, assume all are covered
    if (covered.length === 0) {
      return analysis.acceptanceCriteria.map((ac) => ac.id);
    }
    return covered;
  }
}
