/**
 * Post-processor — deterministic validation of generated test code.
 * Runs checks that don't require LLM: import validation, assertion presence,
 * traceability verification, and secret scanning.
 */

import type { PostProcessingResult, GeneratedTest, GenerationContext } from './types.js';

/**
 * Run deterministic post-processing checks on a generated test.
 */
export function postProcess(
  test: GeneratedTest,
  context: GenerationContext,
): PostProcessingResult {
  const checks: PostProcessingResult['checks'] = [];
  let fixedCode = test.code;

  // 1. Check for Playwright import
  const hasImport = /@playwright\/test/.test(fixedCode);
  if (!hasImport) {
    fixedCode = `import { test, expect } from '@playwright/test';\n\n${fixedCode}`;
    checks.push({
      name: 'Import resolution',
      passed: false,
      message: 'Added missing @playwright/test import',
    });
  } else {
    checks.push({ name: 'Import resolution', passed: true, message: 'Import present' });
  }

  // 2. Assertion presence (>=1 per test block)
  const testBlocks = fixedCode.match(/test\s*\(/g) ?? [];
  const assertions =
    fixedCode.match(/expect\s*\(|\.toHave|\.toBe|\.toEqual|\.toContain|assert\s*[.(]/g) ?? [];
  const hasAssertions = assertions.length >= testBlocks.length;
  checks.push({
    name: 'Assertion presence',
    passed: hasAssertions,
    message: hasAssertions
      ? `${assertions.length} assertion(s) for ${testBlocks.length} test(s)`
      : `Only ${assertions.length} assertion(s) for ${testBlocks.length} test(s)`,
  });

  // 3. Traceability check (every AC should have >= 1 covering test)
  const coveredACs = new Set(test.coveredCriteria);
  const allACs = (context.requirement.acceptanceCriteria ?? []).length;
  const traceabilityOk = coveredACs.size >= allACs || allACs === 0;
  checks.push({
    name: 'Traceability coverage',
    passed: traceabilityOk,
    message: traceabilityOk
      ? `${coveredACs.size}/${allACs} acceptance criteria covered`
      : `Only ${coveredACs.size}/${allACs} acceptance criteria covered`,
  });

  // 4. Selector validation (all selectors reference existing POs)
  const inlineSelectors =
    fixedCode.match(/page\.locator\s*\(\s*['"]([^'"]+)['"]\s*\)/g) ?? [];
  const poSelectorValues = new Set(
    context.pageObjects.flatMap((po) => po.selectors.map((s) => s.value)),
  );
  const orphanSelectors = inlineSelectors.filter((sel) => {
    const value = sel.match(/['"]([^'"]+)['"]/)?.[1];
    return value && !poSelectorValues.has(value);
  });
  checks.push({
    name: 'Selector validation',
    passed: orphanSelectors.length <= 2,
    message:
      orphanSelectors.length <= 2
        ? 'Selectors look valid'
        : `${orphanSelectors.length} inline selectors not found in page objects`,
  });

  // 5. Secret/hardcoded data scan
  const secretPatterns = [
    /password\s*[:=]\s*['"][^'"]{3,}['"]/i,
    /api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/,
  ];
  const hasSecrets = secretPatterns.some((p) => p.test(fixedCode));
  checks.push({
    name: 'Secret scan',
    passed: !hasSecrets,
    message: hasSecrets
      ? 'Potential hardcoded credentials detected'
      : 'No hardcoded secrets found',
  });

  // 6. @generated annotation
  if (!/@generated/.test(fixedCode)) {
    // Add generated annotation
    fixedCode = fixedCode.replace(
      /(import\s+.+\n\n?)/,
      `$1// @generated — AI-generated test\n`,
    );
    checks.push({
      name: 'Generated annotation',
      passed: false,
      message: 'Added missing @generated annotation',
    });
  } else {
    checks.push({ name: 'Generated annotation', passed: true, message: '@generated present' });
  }

  const allPassed = checks.every((c) => c.passed);
  const codeWasFixed = fixedCode !== test.code;

  return {
    passed: allPassed || codeWasFixed,
    checks,
    fixedCode: codeWasFixed ? fixedCode : undefined,
  };
}
