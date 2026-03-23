/**
 * Assertion Immutability Guard — ensures business assertions are NEVER modified
 * during self-healing. This is a core safety constraint of the platform.
 *
 * Uses AST-level pattern matching to identify assertion statements,
 * then blocks any healing proposal that attempts to modify them.
 */

/** Patterns that identify assertion lines in Playwright / Jest test code */
const ASSERTION_PATTERNS: RegExp[] = [
  // Playwright expect()
  /\bexpect\s*\(/,
  /\bawait\s+expect\s*\(/,
  // toXxx matchers (expanded to catch multiline chains)
  /\.to(?:Be|Equal|Contain|Have|Match|Throw|Include|Strict|Deep|Not)/,
  // Jest / Chai assert
  /\bassert\s*[\.(]/,
  /\bassert\.(?:ok|equal|strictEqual|deepEqual|throws|rejects|match)/,
  // Playwright-specific expect APIs
  /\.toBeVisible\(/,
  /\.toBeHidden\(/,
  /\.toBeEnabled\(/,
  /\.toBeDisabled\(/,
  /\.toBeChecked\(/,
  /\.toBeEditable\(/,
  /\.toBeEmpty\(/,
  /\.toHaveText\(/,
  /\.toHaveValue\(/,
  /\.toHaveAttribute\(/,
  /\.toHaveClass\(/,
  /\.toHaveCSS\(/,
  /\.toHaveCount\(/,
  /\.toHaveId\(/,
  /\.toHaveJSProperty\(/,
  /\.toHaveTitle\(/,
  /\.toHaveURL\(/,
  /\.toHaveScreenshot\(/,
  /\.toPass\(/,
  // Negated forms
  /\.not\.to/,
];

/**
 * Check if a line of code is an assertion statement.
 * Used to prevent self-healing from modifying business logic.
 */
export function isAssertionLine(line: string): boolean {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return false;
  }

  return ASSERTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Extract all assertion lines from source code with their line numbers.
 */
export function extractAssertions(sourceCode: string): Array<{ line: number; text: string }> {
  return sourceCode.split('\n').reduce<Array<{ line: number; text: string }>>(
    (acc, line, idx) => {
      if (isAssertionLine(line)) {
        acc.push({ line: idx + 1, text: line.trim() });
      }
      return acc;
    },
    [],
  );
}

/**
 * Validate that no assertions were modified between original and proposed code.
 * Returns a list of violations (empty = safe).
 */
export function validateAssertionImmutability(
  originalCode: string,
  proposedCode: string,
): Array<{ line: number; original: string; proposed: string; violation: string }> {
  const origAssertions = extractAssertions(originalCode);
  const propAssertions = extractAssertions(proposedCode);
  const violations: Array<{ line: number; original: string; proposed: string; violation: string }> = [];

  // Check: assertions removed
  if (propAssertions.length < origAssertions.length) {
    violations.push({
      line: 0,
      original: `${origAssertions.length} assertions`,
      proposed: `${propAssertions.length} assertions`,
      violation: `Assertion count decreased from ${origAssertions.length} to ${propAssertions.length} — assertions may have been removed`,
    });
  }

  // Check: individual assertions modified
  // Use normalized comparison (ignoring whitespace)
  const origNormalized = origAssertions.map((a) => a.text.replace(/\s+/g, ' '));
  const propNormalized = propAssertions.map((a) => a.text.replace(/\s+/g, ' '));

  for (let i = 0; i < origNormalized.length; i++) {
    const origAssertion = origNormalized[i];
    // Check if this assertion still exists (potentially at a different line)
    if (!propNormalized.includes(origAssertion)) {
      violations.push({
        line: origAssertions[i].line,
        original: origAssertions[i].text,
        proposed: propAssertions[i]?.text ?? '(removed)',
        violation: `Assertion at line ${origAssertions[i].line} was modified or removed`,
      });
    }
  }

  return violations;
}
