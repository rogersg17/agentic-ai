import * as ts from 'typescript';
import type { ParsedTestCase, ParsedLocator } from './parser.types.js';

/** Locator strategies recognized in Playwright */
const LOCATOR_METHODS = new Set([
  'getByTestId',
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'locator',
  'frameLocator',
]);

/**
 * Parse a Playwright test file using the TypeScript Compiler API.
 * Extracts test names, describe blocks, assertions, imports, locators,
 * fixtures, requirement annotations, and test.step usage.
 */
export function parsePlaywrightTest(filePath: string, sourceContent: string): ParsedTestCase[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const imports = extractImports(sourceFile);
  const tests: ParsedTestCase[] = [];

  function visit(node: ts.Node, currentDescribe?: string): void {
    // test.describe('name', () => { ... })
    if (isDescribeCall(node)) {
      const call = node as ts.CallExpression;
      const describeName = getFirstStringArg(call);
      const callback = getCallbackArg(call);
      if (callback) {
        ts.forEachChild(callback, (child) => visit(child, describeName));
      }
      return;
    }

    // test('name', ...) or test.only('name', ...)
    if (isTestCall(node)) {
      const call = node as ts.CallExpression;
      const testTitle = getFirstStringArg(call);
      if (!testTitle) return;

      const callback = getCallbackArg(call);
      const body = callback ? callback.getText(sourceFile) : '';

      const locatorsUsed = extractLocators(body);
      const fixturesUsed = extractFixtures(call, sourceFile);
      const assertions = extractAssertions(body);
      const annotations = extractRequirementAnnotations(sourceContent, node, sourceFile);
      const testSteps = extractTestSteps(body);

      tests.push({
        title: testTitle,
        describeBlock: currentDescribe,
        filePath,
        sourceContent: call.getText(sourceFile),
        locatorsUsed,
        fixturesUsed,
        assertions,
        imports,
        requirementAnnotations: annotations,
        testSteps,
      });
      return;
    }

    ts.forEachChild(node, (child) => visit(child, currentDescribe));
  }

  visit(sourceFile);
  return tests;
}

function extractImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, ''));
    }
  });
  return imports;
}

function isDescribeCall(node: ts.Node): boolean {
  if (!ts.isExpressionStatement(node)) return false;
  const expr = node.expression;
  if (!ts.isCallExpression(expr)) return false;

  const callText = expr.expression.getText();
  return (
    callText === 'test.describe' ||
    callText === 'test.describe.serial' ||
    callText === 'test.describe.parallel'
  );
}

function isTestCall(node: ts.Node): boolean {
  if (!ts.isExpressionStatement(node)) return false;
  const expr = node.expression;
  if (!ts.isCallExpression(expr)) return false;

  const callText = expr.expression.getText();
  return (
    callText === 'test' ||
    callText === 'test.only' ||
    callText === 'test.skip' ||
    callText === 'test.fixme' ||
    callText === 'test.slow'
  );
}

function getFirstStringArg(call: ts.CallExpression): string | undefined {
  const firstArg = call.arguments[0];
  if (!firstArg) return undefined;
  if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
    return firstArg.text;
  }
  if (ts.isTemplateExpression(firstArg)) {
    return firstArg.getText().replace(/`/g, '');
  }
  return undefined;
}

function getCallbackArg(call: ts.CallExpression): ts.Block | undefined {
  for (const arg of call.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      if (arg.body && ts.isBlock(arg.body)) {
        return arg.body;
      }
    }
  }
  return undefined;
}

function extractLocators(bodyText: string): ParsedLocator[] {
  const locators: ParsedLocator[] = [];
  const seen = new Set<string>();

  for (const method of LOCATOR_METHODS) {
    // Match patterns like .getByTestId('value') or .locator('css-selector')
    const regex = new RegExp(`\\.${method}\\((['"\`])(.*?)\\1`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(bodyText)) !== null) {
      const key = `${method}:${match[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        locators.push({ strategy: method, value: match[2] });
      }
    }
  }

  return locators;
}

function extractFixtures(call: ts.CallExpression, _sourceFile: ts.SourceFile): string[] {
  const fixtures: string[] = [];

  // Playwright fixtures are destructured from the callback parameter:
  // test('name', async ({ page, context, myFixture }) => { ... })
  for (const arg of call.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      const param = arg.parameters[0];
      if (param && param.name && ts.isObjectBindingPattern(param.name)) {
        for (const element of param.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            fixtures.push(element.name.text);
          }
        }
      }
    }
  }

  return fixtures;
}

function extractAssertions(bodyText: string): string[] {
  const assertions: string[] = [];
  // Match expect(...).toBe(...), expect(...).toHaveText(...), etc.
  const regex = /expect\([^)]*\)\.[a-zA-Z]+\([^)]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(bodyText)) !== null) {
    assertions.push(match[0]);
  }
  return assertions;
}

function extractRequirementAnnotations(
  fullSource: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string[] {
  const annotations: string[] = [];
  // Look for @requirement or @covers annotations in comments near the test
  const start = node.getStart(sourceFile);
  const leadingText = fullSource.slice(Math.max(0, start - 500), start);
  const regex = /@(?:requirement|covers|req)\s+(\S+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(leadingText)) !== null) {
    annotations.push(match[1]);
  }
  return annotations;
}

function extractTestSteps(bodyText: string): string[] {
  const steps: string[] = [];
  const regex = /test\.step\(\s*(['"`])(.*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(bodyText)) !== null) {
    steps.push(match[2]);
  }
  return steps;
}
