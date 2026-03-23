/**
 * Unified diff generation for healing proposals.
 * Simple line-based diff without external dependencies.
 */

/**
 * Generate a unified diff string from two versions of a file.
 */
export function createUnifiedDiff(
  filePath: string,
  originalCode: string,
  proposedCode: string,
): string {
  const origLines = originalCode.split('\n');
  const propLines = proposedCode.split('\n');

  const hunks = computeHunks(origLines, propLines);
  if (hunks.length === 0) return '';

  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  const diffLines: string[] = [...header];

  for (const hunk of hunks) {
    diffLines.push(
      `@@ -${hunk.origStart + 1},${hunk.origCount} +${hunk.propStart + 1},${hunk.propCount} @@`,
    );
    for (const line of hunk.lines) {
      diffLines.push(line);
    }
  }

  return diffLines.join('\n');
}

// ─── Private: LCS-based diff ────────────────────────────────────────────────────

interface DiffHunk {
  origStart: number;
  origCount: number;
  propStart: number;
  propCount: number;
  lines: string[];
}

function computeHunks(origLines: string[], propLines: string[]): DiffHunk[] {
  // Find LCS to identify common lines
  const lcs = longestCommonSubsequence(origLines, propLines);
  const changes = buildChangeList(origLines, propLines, lcs);

  if (changes.length === 0) return [];

  // Group changes into hunks with 3 lines of context
  const CONTEXT = 3;
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (const change of changes) {
    if (!currentHunk || change.origLine > currentHunk.origStart + currentHunk.origCount + CONTEXT * 2) {
      // Start new hunk
      if (currentHunk) {
        addContext(currentHunk, origLines, propLines, CONTEXT, 'after');
        hunks.push(currentHunk);
      }
      currentHunk = {
        origStart: Math.max(0, change.origLine - CONTEXT),
        origCount: 0,
        propStart: Math.max(0, change.propLine - CONTEXT),
        propCount: 0,
        lines: [],
      };
      addContext(currentHunk, origLines, propLines, CONTEXT, 'before');
    }

    if (change.type === 'remove') {
      currentHunk.lines.push(`-${origLines[change.origLine]}`);
      currentHunk.origCount++;
    } else if (change.type === 'add') {
      currentHunk.lines.push(`+${propLines[change.propLine]}`);
      currentHunk.propCount++;
    }
  }

  if (currentHunk) {
    addContext(currentHunk, origLines, propLines, CONTEXT, 'after');
    hunks.push(currentHunk);
  }

  return hunks;
}

interface Change {
  type: 'add' | 'remove';
  origLine: number;
  propLine: number;
}

function buildChangeList(
  origLines: string[],
  propLines: string[],
  lcs: number[][],
): Change[] {
  const changes: Change[] = [];
  let oi = origLines.length;
  let pi = propLines.length;

  while (oi > 0 || pi > 0) {
    if (oi > 0 && pi > 0 && origLines[oi - 1] === propLines[pi - 1]) {
      oi--;
      pi--;
    } else if (pi > 0 && (oi === 0 || (lcs[oi] && lcs[oi][pi - 1] >= (lcs[oi - 1]?.[pi] ?? 0)))) {
      pi--;
      changes.unshift({ type: 'add', origLine: oi, propLine: pi });
    } else if (oi > 0) {
      oi--;
      changes.unshift({ type: 'remove', origLine: oi, propLine: pi });
    } else {
      break;
    }
  }

  return changes;
}

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

function addContext(
  hunk: DiffHunk,
  origLines: string[],
  _propLines: string[],
  contextSize: number,
  position: 'before' | 'after',
): void {
  if (position === 'before') {
    const startFrom = hunk.origStart;
    const beforeCount = Math.min(contextSize, startFrom);
    for (let i = startFrom - beforeCount + hunk.origCount; i < startFrom + hunk.origCount; i++) {
      if (i >= 0 && i < origLines.length) {
        hunk.lines.unshift(` ${origLines[i]}`);
        hunk.origCount++;
        hunk.propCount++;
      }
    }
  } else {
    const endAt = hunk.origStart + hunk.origCount;
    const afterCount = Math.min(contextSize, origLines.length - endAt);
    for (let i = endAt; i < endAt + afterCount; i++) {
      if (i >= 0 && i < origLines.length) {
        hunk.lines.push(` ${origLines[i]}`);
        hunk.origCount++;
        hunk.propCount++;
      }
    }
  }
}
