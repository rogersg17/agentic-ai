import * as ts from 'typescript';
import type {
  ParsedPageObject,
  ParsedMethod,
  ParsedSelector,
  ParsedLocator,
} from './parser.types.js';

/**
 * Parse a Playwright Page Object file using the TypeScript Compiler API.
 * Extracts class name, methods, selectors/locators, imports, and base classes.
 */
export function parsePageObject(filePath: string, sourceContent: string): ParsedPageObject[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const imports = extractImports(sourceFile);
  const pageObjects: ParsedPageObject[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text;
      const baseClasses = extractBaseClasses(node);
      const methods = extractMethods(node, sourceFile);
      const selectors = extractSelectors(node, sourceFile);

      pageObjects.push({
        className,
        filePath,
        sourceContent,
        methods,
        selectors,
        imports,
        baseClasses,
      });
    }
  });

  return pageObjects;
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

function extractBaseClasses(classDecl: ts.ClassDeclaration): string[] {
  const bases: string[] = [];
  if (classDecl.heritageClauses) {
    for (const clause of classDecl.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const type of clause.types) {
          bases.push(type.expression.getText());
        }
      }
    }
  }
  return bases;
}

function extractMethods(classDecl: ts.ClassDeclaration, sourceFile: ts.SourceFile): ParsedMethod[] {
  const methods: ParsedMethod[] = [];

  for (const member of classDecl.members) {
    if (ts.isMethodDeclaration(member) && member.name) {
      const name = member.name.getText(sourceFile);
      const params = member.parameters.map((p) => p.getText(sourceFile));
      const returnType = member.type?.getText(sourceFile);
      const bodyText = member.body?.getText(sourceFile) ?? '';
      const locators = extractLocatorsFromBody(bodyText);

      methods.push({ name, params, returnType, locators });
    }
  }

  return methods;
}

function extractSelectors(
  classDecl: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): ParsedSelector[] {
  const selectors: ParsedSelector[] = [];

  for (const member of classDecl.members) {
    if (ts.isPropertyDeclaration(member) && member.name && member.initializer) {
      const propertyName = member.name.getText(sourceFile);
      const initText = member.initializer.getText(sourceFile);

      // Match locator patterns: this.page.locator('...'), this.page.getByTestId('...'), etc.
      const locatorMatch = initText.match(
        /\.(?:locator|getByTestId|getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle)\(\s*(['"`])(.*?)\1/,
      );
      if (locatorMatch) {
        const strategy = initText.match(
          /\.(locator|getByTestId|getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle)\(/,
        );
        selectors.push({
          strategy: strategy ? strategy[1] : 'locator',
          value: locatorMatch[2],
          propertyName,
        });
      }
    }

    // Also check getter methods that return locators
    if (ts.isGetAccessorDeclaration(member) && member.name) {
      const propertyName = member.name.getText(sourceFile);
      const bodyText = member.body?.getText(sourceFile) ?? '';

      const locatorMatch = bodyText.match(
        /\.(?:locator|getByTestId|getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle)\(\s*(['"`])(.*?)\1/,
      );
      if (locatorMatch) {
        const strategy = bodyText.match(
          /\.(locator|getByTestId|getByRole|getByText|getByLabel|getByPlaceholder|getByAltText|getByTitle)\(/,
        );
        selectors.push({
          strategy: strategy ? strategy[1] : 'locator',
          value: locatorMatch[2],
          propertyName,
        });
      }
    }
  }

  return selectors;
}

function extractLocatorsFromBody(bodyText: string): ParsedLocator[] {
  const locators: ParsedLocator[] = [];
  const seen = new Set<string>();

  const methods = [
    'locator',
    'getByTestId',
    'getByRole',
    'getByText',
    'getByLabel',
    'getByPlaceholder',
    'getByAltText',
    'getByTitle',
    'frameLocator',
  ];

  for (const method of methods) {
    const regex = new RegExp(`\\.${method}\\(\\s*(['"\`])(.*?)\\1`, 'g');
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
