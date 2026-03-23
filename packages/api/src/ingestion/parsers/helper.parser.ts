import * as ts from 'typescript';
import type { ParsedHelper } from './parser.types.js';

/**
 * Parse a helper/utility file using the TypeScript Compiler API.
 * Extracts all exported functions with their signatures.
 */
export function parseHelper(
  filePath: string,
  sourceContent: string,
): ParsedHelper {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const exportedFunctions: ParsedHelper['exportedFunctions'] = [];

  function visit(node: ts.Node): void {
    // export function foo(...)
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      exportedFunctions.push({
        name: node.name.text,
        params: node.parameters.map((p) => p.getText(sourceFile)),
        returnType: node.type?.getText(sourceFile),
      });
    }

    // export const foo = (...) => ...
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          if (
            ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer)
          ) {
            exportedFunctions.push({
              name: decl.name.text,
              params: decl.initializer.parameters.map((p) => p.getText(sourceFile)),
              returnType: decl.initializer.type?.getText(sourceFile),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { filePath, sourceContent, exportedFunctions };
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
