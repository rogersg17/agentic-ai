import mammoth from 'mammoth';
import type { ParsedRequirement } from './parser.types.js';
import { parseRequirementMarkdown } from './requirement.parser.js';

/**
 * Parse a DOCX requirements document.
 * Converts DOCX to Markdown via mammoth, then delegates to the Markdown parser.
 */
export async function parseRequirementDocx(buffer: Buffer): Promise<ParsedRequirement[]> {
  const result = await mammoth.convertToMarkdown({ buffer });
  const markdown = result.value;

  // Delegate to the existing Markdown parser
  return parseRequirementMarkdown(markdown);
}
