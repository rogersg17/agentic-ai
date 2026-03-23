import type { ParsedRequirement } from './parser.types.js';

/**
 * Parse a Markdown requirements document.
 * Extracts titles, body text, acceptance criteria, and tags.
 *
 * Supported formats:
 * - Standard Markdown headers with body text
 * - Gherkin-style Feature/Scenario blocks
 * - Acceptance criteria lists (lines starting with "AC:", "- [ ]", or numbered)
 */
export function parseRequirementMarkdown(
  content: string,
): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];

  // Try Gherkin format first
  if (isGherkinContent(content)) {
    return parseGherkin(content);
  }

  // Parse as structured Markdown
  return parseStructuredMarkdown(content);
}

function isGherkinContent(content: string): boolean {
  return /^(Feature|Scenario|Given|When|Then):/m.test(content);
}

function parseGherkin(content: string): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];

  // Extract Feature as epic/story
  const featureMatch = content.match(/^Feature:\s*(.+)$/m);
  const featureTitle = featureMatch ? featureMatch[1].trim() : 'Untitled Feature';
  const tags = extractGherkinTags(content);

  // Extract Scenarios
  const scenarioRegex = /(?:Scenario(?:\s+Outline)?:\s*)(.+)\n([\s\S]*?)(?=\n\s*(?:Scenario|$))/gm;
  let match: RegExpExecArray | null;

  while ((match = scenarioRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();
    const steps = extractGherkinSteps(body);
    const scenarioTags = extractGherkinTags(body);

    requirements.push({
      title,
      body,
      type: 'story',
      acceptanceCriteria: steps,
      tags: [...tags, ...scenarioTags],
    });
  }

  // If no scenarios found, treat the whole feature as one requirement
  if (requirements.length === 0) {
    const body = content.replace(/^Feature:.*$/m, '').trim();
    requirements.push({
      title: featureTitle,
      body,
      type: 'story',
      acceptanceCriteria: extractGherkinSteps(body),
      tags,
    });
  }

  return requirements;
}

function extractGherkinTags(text: string): string[] {
  const tags: string[] = [];
  const regex = /@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

function extractGherkinSteps(body: string): string[] {
  const steps: string[] = [];
  const regex = /^\s*(Given|When|Then|And|But)\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    steps.push(`${match[1]} ${match[2].trim()}`);
  }
  return steps;
}

function parseStructuredMarkdown(content: string): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];
  const lines = content.split('\n');

  let currentTitle = '';
  let currentBody: string[] = [];
  let currentAC: string[] = [];
  let currentTags: string[] = [];
  let currentLevel = 0;
  let inACSection = false;

  function flush(): void {
    if (currentTitle) {
      requirements.push({
        title: currentTitle,
        body: currentBody.join('\n').trim(),
        type: inferType(currentLevel, currentTitle),
        acceptanceCriteria: currentAC,
        tags: currentTags,
      });
    }
    currentTitle = '';
    currentBody = [];
    currentAC = [];
    currentTags = [];
    inACSection = false;
  }

  for (const line of lines) {
    // Check for headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flush();
      currentLevel = headerMatch[1].length;
      currentTitle = headerMatch[2].trim();

      // Extract inline tags like [tag1] [tag2]
      const tagRegex = /\[(\w+)\]/g;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(currentTitle)) !== null) {
        currentTags.push(tagMatch[1]);
      }
      continue;
    }

    // Check for acceptance criteria section
    if (/^#+\s*acceptance\s+criteria/i.test(line) || /^acceptance\s+criteria/i.test(line)) {
      inACSection = true;
      continue;
    }

    // Extract acceptance criteria lines
    if (inACSection || isACLine(line)) {
      const acText = extractACText(line);
      if (acText) {
        currentAC.push(acText);
        continue;
      }
    }

    // Regular body text
    if (currentTitle) {
      currentBody.push(line);
    }
  }

  flush();
  return requirements;
}

function isACLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('AC:') ||
    trimmed.startsWith('- [ ]') ||
    trimmed.startsWith('- [x]') ||
    /^\d+\.\s+AC/.test(trimmed)
  );
}

function extractACText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // "AC: some text" or "AC-1: some text"
  const acMatch = trimmed.match(/^AC[-\s]?\d*:?\s*(.+)$/i);
  if (acMatch) return acMatch[1].trim();

  // "- [ ] some text" (checklist)
  const checkMatch = trimmed.match(/^-\s*\[[ x]\]\s*(.+)$/);
  if (checkMatch) return checkMatch[1].trim();

  // "1. AC: some text"
  const numberedMatch = trimmed.match(/^\d+\.\s+(?:AC:?\s*)?(.+)$/);
  if (numberedMatch) return numberedMatch[1].trim();

  // Bullet items under AC section
  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) return bulletMatch[1].trim();

  return null;
}

function inferType(
  level: number,
  title: string,
): ParsedRequirement['type'] {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('epic') || level === 1) return 'epic';
  if (lowerTitle.includes('story') || lowerTitle.includes('feature') || level === 2) return 'story';
  if (lowerTitle.includes('task') || level >= 4) return 'task';
  return 'story';
}
