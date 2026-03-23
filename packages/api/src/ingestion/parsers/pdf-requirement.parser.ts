import { PDFParse } from 'pdf-parse';
import type { ParsedRequirement } from './parser.types.js';
import { parseRequirementMarkdown } from './requirement.parser.js';

/**
 * Parse a PDF requirements document.
 * Extracts text content from PDF, then delegates to the Markdown parser
 * for structured extraction of requirements, acceptance criteria, and tags.
 */
export async function parseRequirementPdf(buffer: Buffer): Promise<ParsedRequirement[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text;

    // PDF text extraction doesn't preserve Markdown headers,
    // so we heuristically re-insert header markers at likely section boundaries.
    const structured = reconstructStructure(text);

    return parseRequirementMarkdown(structured);
  } finally {
    await parser.destroy();
  }
}

/**
 * Attempt to reconstruct Markdown-like structure from raw PDF text.
 * Looks for common patterns: numbered sections, ALL CAPS lines, bold-like text.
 */
function reconstructStructure(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      output.push('');
      continue;
    }

    // Numbered section headers: "1. Title" or "1.2 Title" at start of line
    const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*)\s+([A-Z].{2,})$/);
    if (numberedMatch) {
      const depth = numberedMatch[1].split('.').length;
      const prefix = '#'.repeat(Math.min(depth + 1, 6));
      output.push(`${prefix} ${trimmed}`);
      continue;
    }

    // ALL CAPS lines (likely section headers)
    if (
      trimmed.length > 3 &&
      trimmed.length < 120 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed)
    ) {
      output.push(`## ${trimmed}`);
      continue;
    }

    // Lines starting with "AC:", acceptance criteria markers
    if (/^AC[-\s]?\d*:/i.test(trimmed)) {
      output.push(trimmed);
      continue;
    }

    // Checklist items
    if (/^[\u2610\u2611\u2612☐☑☒]\s/.test(trimmed)) {
      output.push(`- [ ] ${trimmed.slice(2)}`);
      continue;
    }

    output.push(trimmed);
  }

  return output.join('\n');
}
