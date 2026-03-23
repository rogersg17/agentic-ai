import * as ts from 'typescript';
import type { ParsedFixture } from './parser.types.js';

/**
 * Parse a Playwright fixture file using the TypeScript Compiler API.
 * Extracts fixture definitions from test.extend<T>({ ... }) calls.
 *
 * Playwright fixtures are typically defined as:
 *   export const test = base.extend<MyFixtures>({
 *     myFixture: async ({ page }, use) => { ... },
 *     workerFixture: [async ({ ... }, use) => { ... }, { scope: 'worker' }],
 *   });
 */
export function parseFixtures(
  filePath: string,
  sourceContent: string,
): ParsedFixture[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const fixtures: ParsedFixture[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      // Match *.extend({ ... }) patterns
      if (callText.endsWith('.extend') && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name) {
              const fixture = extractFixture(prop, filePath, sourceContent, sourceFile);
              if (fixture) fixtures.push(fixture);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return fixtures;
}

function extractFixture(
  prop: ts.PropertyAssignment,
  filePath: string,
  sourceContent: string,
  sourceFile: ts.SourceFile,
): ParsedFixture | undefined {
  const name = prop.name.getText(sourceFile);
  const init = prop.initializer;

  // Simple fixture: async ({ dep1, dep2 }, use) => { ... }
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    const dependencies = extractDependencies(init, sourceFile);
    return {
      name,
      filePath,
      sourceContent: prop.getText(sourceFile),
      scope: 'test',
      provides: name,
      dependencies,
    };
  }

  // Tuple fixture with options: [async ({ ... }, use) => { ... }, { scope: 'worker' }]
  if (ts.isArrayLiteralExpression(init) && init.elements.length >= 2) {
    const fn = init.elements[0];
    const options = init.elements[1];

    let scope: 'test' | 'worker' = 'test';
    if (ts.isObjectLiteralExpression(options)) {
      for (const optProp of options.properties) {
        if (
          ts.isPropertyAssignment(optProp) &&
          optProp.name.getText(sourceFile) === 'scope' &&
          ts.isStringLiteral(optProp.initializer) &&
          optProp.initializer.text === 'worker'
        ) {
          scope = 'worker';
        }
      }
    }

    const dependencies = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
      ? extractDependencies(fn, sourceFile)
      : [];

    return {
      name,
      filePath,
      sourceContent: prop.getText(sourceFile),
      scope,
      provides: name,
      dependencies,
    };
  }

  return undefined;
}

function extractDependencies(
  fn: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
): string[] {
  const deps: string[] = [];
  const firstParam = fn.parameters[0];
  if (firstParam && firstParam.name && ts.isObjectBindingPattern(firstParam.name)) {
    for (const element of firstParam.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        deps.push(element.name.text);
      }
    }
  }
  return deps;
}
