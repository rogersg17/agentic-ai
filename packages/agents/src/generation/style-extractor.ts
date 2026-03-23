/**
 * Style Extractor — analyzes existing test exemplars to derive a style profile
 * that the Generator Agent uses to match project conventions.
 */

import type { StyleProfile } from './types.js';

/**
 * Extract a style profile from a set of test source code exemplars.
 * Pure deterministic analysis — no LLM calls.
 */
export function extractStyleProfile(exemplarSources: string[]): StyleProfile {
  if (exemplarSources.length === 0) {
    return defaultStyleProfile();
  }

  const importStyles = exemplarSources.map(detectImportStyle);
  const describeUsage = exemplarSources.map((s) => /test\.describe\s*\(/.test(s));
  const assertions = exemplarSources.map(detectAssertionStyle);
  const stepUsage = exemplarSources.map((s) => /test\.step\s*\(/.test(s));
  const poPatterns = exemplarSources.map(detectPageObjectPattern);
  const naming = exemplarSources.map(detectNamingConvention);
  const lengths = exemplarSources.map((s) => s.split('\n').length);
  const comments = exemplarSources.map(detectCommentDensity);

  return {
    importStyle: majority(importStyles) ?? 'import { test, expect } from \'@playwright/test\';',
    describeStructure: majority(describeUsage.map(String)) === 'true',
    assertionStyle: majority(assertions) as StyleProfile['assertionStyle'] ?? 'expect',
    usesTestSteps: majority(stepUsage.map(String)) === 'true',
    pageObjectPattern: majority(poPatterns) as StyleProfile['pageObjectPattern'] ?? 'fixture',
    namingConvention: majority(naming) as StyleProfile['namingConvention'] ?? 'should',
    averageTestLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    commentDensity: majority(comments) as StyleProfile['commentDensity'] ?? 'light',
  };
}

function defaultStyleProfile(): StyleProfile {
  return {
    importStyle: 'import { test, expect } from \'@playwright/test\';',
    describeStructure: true,
    assertionStyle: 'expect',
    usesTestSteps: true,
    pageObjectPattern: 'fixture',
    namingConvention: 'should',
    averageTestLength: 40,
    commentDensity: 'light',
  };
}

function detectImportStyle(source: string): string {
  const importLine = source.match(/^import\s+.+from\s+['"]@playwright\/test['"];?\s*$/m);
  return importLine?.[0] ?? 'import { test, expect } from \'@playwright/test\';';
}

function detectAssertionStyle(source: string): string {
  const expectCount = (source.match(/expect\s*\(/g) ?? []).length;
  const assertCount = (source.match(/assert\s*[.(]/g) ?? []).length;
  if (expectCount > 0 && assertCount > 0) return 'mixed';
  if (assertCount > expectCount) return 'assert';
  return 'expect';
}

function detectPageObjectPattern(source: string): string {
  if (/new\s+\w+Page\s*\(/.test(source)) return 'constructor';
  if (/\{\s*\w+Page\s*\}/.test(source) || /\(\s*\{\s*\w+/.test(source)) return 'fixture';
  return 'inline';
}

function detectNamingConvention(source: string): string {
  const testNames = source.match(/test\s*\(\s*['"](.+?)['"]/g) ?? [];
  const shouldCount = testNames.filter((t) => /should/i.test(t)).length;
  if (shouldCount > testNames.length / 2) return 'should';
  if (shouldCount > 0) return 'mixed';
  return 'descriptive';
}

function detectCommentDensity(source: string): string {
  const lines = source.split('\n');
  const commentLines = lines.filter(
    (l) => l.trim().startsWith('//') || l.trim().startsWith('/*') || l.trim().startsWith('*'),
  ).length;
  const ratio = commentLines / Math.max(lines.length, 1);
  if (ratio > 0.15) return 'heavy';
  if (ratio > 0.05) return 'light';
  return 'none';
}

/** Return the most common value in an array */
function majority<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}
