/**
 * DOM Snapshot Diffing — compares before/after DOM snapshots to identify
 * structural changes that may have caused test failures.
 *
 * Parses simplified HTML snapshots and identifies:
 * - Removed elements (selector no longer exists)
 * - Modified attributes (id, class, data-testid changes)
 * - Moved elements (element exists but in different position)
 * - Added elements (new elements that might be alternatives)
 *
 * Suggests alternative selectors for broken locators.
 */

import type { DomDiff } from './types.js';

// ─── Simplified DOM element representation ──────────────────────────────────────

interface DomElement {
  tag: string;
  id: string | null;
  classNames: string[];
  testId: string | null;
  attributes: Record<string, string>;
  text: string;
  /** CSS-like path from root */
  path: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compare two DOM snapshots (HTML strings) and return a structured diff
 * with suggested alternative selectors.
 */
export function diffDomSnapshots(
  beforeHtml: string,
  afterHtml: string,
  brokenSelectors: string[] = [],
): DomDiff {
  const beforeElements = parseElements(beforeHtml);
  const afterElements = parseElements(afterHtml);

  const changedElements: DomDiff['changedElements'] = [];

  // Build lookup maps by various keys
  const beforeById = new Map<string, DomElement>();
  const afterById = new Map<string, DomElement>();
  const beforeByTestId = new Map<string, DomElement>();
  const afterByTestId = new Map<string, DomElement>();
  const afterByText = new Map<string, DomElement[]>();

  for (const el of beforeElements) {
    if (el.id) beforeById.set(el.id, el);
    if (el.testId) beforeByTestId.set(el.testId, el);
  }

  for (const el of afterElements) {
    if (el.id) afterById.set(el.id, el);
    if (el.testId) afterByTestId.set(el.testId, el);
    const textKey = el.text.trim().toLowerCase();
    if (textKey) {
      const list = afterByText.get(textKey) ?? [];
      list.push(el);
      afterByText.set(textKey, list);
    }
  }

  // Detect removed elements (present in before, absent in after)
  for (const el of beforeElements) {
    if (el.id && !afterById.has(el.id)) {
      changedElements.push({
        selector: `#${el.id}`,
        changeType: 'removed',
        oldAttributes: el.attributes,
      });
    }
    if (el.testId && !afterByTestId.has(el.testId)) {
      changedElements.push({
        selector: `[data-testid="${el.testId}"]`,
        changeType: 'removed',
        oldAttributes: el.attributes,
      });
    }
  }

  // Detect modified elements (same id/testid but different attributes)
  for (const el of beforeElements) {
    if (el.id) {
      const afterEl = afterById.get(el.id);
      if (afterEl && hasAttributeChanges(el, afterEl)) {
        changedElements.push({
          selector: `#${el.id}`,
          changeType: 'modified',
          oldAttributes: el.attributes,
          newAttributes: afterEl.attributes,
        });
      }
    }
    if (el.testId) {
      const afterEl = afterByTestId.get(el.testId);
      if (afterEl && hasAttributeChanges(el, afterEl)) {
        changedElements.push({
          selector: `[data-testid="${el.testId}"]`,
          changeType: 'modified',
          oldAttributes: el.attributes,
          newAttributes: afterEl.attributes,
        });
      }
    }
  }

  // Detect new elements in the after snapshot
  for (const el of afterElements) {
    if (el.id && !beforeById.has(el.id)) {
      changedElements.push({
        selector: `#${el.id}`,
        changeType: 'added',
        newAttributes: el.attributes,
      });
    }
  }

  // Suggest alternative selectors for broken locators
  const suggestedSelectors: DomDiff['suggestedSelectors'] = [];

  for (const brokenSelector of brokenSelectors) {
    const alternatives = findAlternatives(brokenSelector, beforeElements, afterElements, afterByText);
    if (alternatives.length > 0) {
      suggestedSelectors.push({
        original: brokenSelector,
        alternatives: alternatives.slice(0, 3), // Top 3
      });
    }
  }

  return { changedElements, suggestedSelectors };
}

// ─── Private: element parsing ───────────────────────────────────────────────────

/**
 * Parse simplified HTML into a flat element list.
 * Not a full HTML parser — extracts key attributes for diffing.
 */
function parseElements(html: string): DomElement[] {
  const elements: DomElement[] = [];
  // Match opening tags with their attributes
  const tagRegex = /<(\w+)\s*([^>]*)>/g;
  const pathStack: string[] = [];
  let match: RegExpExecArray | null;

  // Also track text content between tags
  let lastIndex = 0;

  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, tag, attrString] = match;
    const isSelfClose = attrString.endsWith('/') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag.toLowerCase());

    // Extract text before this tag
    const betweenText = html.slice(lastIndex, match.index).replace(/<\/\w+>/g, '').trim();
    lastIndex = match.index + fullMatch.length;

    const attrs = parseAttributes(attrString);
    const id = attrs.id ?? null;
    const testId = attrs['data-testid'] ?? attrs['data-test'] ?? attrs['data-cy'] ?? null;
    const classNames = (attrs.class ?? '').split(/\s+/).filter(Boolean);

    pathStack.push(tag.toLowerCase());
    const path = pathStack.join(' > ');

    elements.push({
      tag: tag.toLowerCase(),
      id,
      classNames,
      testId,
      attributes: attrs,
      text: betweenText,
      path,
    });

    if (isSelfClose) {
      pathStack.pop();
    }
  }

  return elements;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrString)) !== null) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (name && name !== '/') {
      attrs[name] = value;
    }
  }

  return attrs;
}

function hasAttributeChanges(before: DomElement, after: DomElement): boolean {
  // Check class changes
  if (before.classNames.sort().join(' ') !== after.classNames.sort().join(' ')) return true;
  // Check data-testid changes
  if (before.testId !== after.testId) return true;
  // Check tag change (unlikely but possible)
  if (before.tag !== after.tag) return true;
  return false;
}

// ─── Private: selector alternatives ─────────────────────────────────────────────

function findAlternatives(
  brokenSelector: string,
  beforeElements: DomElement[],
  afterElements: DomElement[],
  afterByText: Map<string, DomElement[]>,
): Array<{ selector: string; strategy: string; confidence: number }> {
  const alternatives: Array<{ selector: string; strategy: string; confidence: number }> = [];

  // Find the original element in the before snapshot
  const originalEl = findElementBySelector(brokenSelector, beforeElements);
  if (!originalEl) return alternatives;

  // Strategy 1: Find by same text content in after snapshot
  if (originalEl.text.trim()) {
    const textKey = originalEl.text.trim().toLowerCase();
    const matches = afterByText.get(textKey) ?? [];
    for (const match of matches) {
      if (match.tag === originalEl.tag) {
        const selector = buildBestSelector(match);
        if (selector && selector !== brokenSelector) {
          alternatives.push({ selector, strategy: 'text-match', confidence: 0.75 });
        }
      }
    }
  }

  // Strategy 2: Find by similar attributes in after snapshot
  for (const afterEl of afterElements) {
    if (afterEl.tag !== originalEl.tag) continue;

    // Same data-testid with different value?
    if (originalEl.testId && afterEl.testId && originalEl.testId !== afterEl.testId) {
      // Similar test IDs (e.g. "btn-submit" → "button-submit")
      if (isSimilarString(originalEl.testId, afterEl.testId)) {
        alternatives.push({
          selector: `[data-testid="${afterEl.testId}"]`,
          strategy: 'similar-testid',
          confidence: 0.85,
        });
      }
    }

    // Same role + similar name
    if (originalEl.attributes.role === afterEl.attributes.role && originalEl.attributes.role) {
      const origName = originalEl.attributes['aria-label'] ?? originalEl.text;
      const afterName = afterEl.attributes['aria-label'] ?? afterEl.text;
      if (origName && afterName && isSimilarString(origName, afterName)) {
        alternatives.push({
          selector: `role=${afterEl.attributes.role}[name="${afterName}"]`,
          strategy: 'role-match',
          confidence: 0.80,
        });
      }
    }
  }

  // Strategy 3: If original was a class selector, find similar class in after
  const classMatch = brokenSelector.match(/\.([a-zA-Z][\w-]*)/);
  if (classMatch) {
    const origClass = classMatch[1];
    for (const afterEl of afterElements) {
      for (const cls of afterEl.classNames) {
        if (cls !== origClass && isSimilarString(cls, origClass)) {
          const selector = buildBestSelector(afterEl);
          if (selector && selector !== brokenSelector) {
            alternatives.push({ selector, strategy: 'similar-class', confidence: 0.65 });
          }
        }
      }
    }
  }

  // Sort by confidence descending
  return alternatives.sort((a, b) => b.confidence - a.confidence);
}

function findElementBySelector(selector: string, elements: DomElement[]): DomElement | null {
  // ID selector: #foo
  const idMatch = selector.match(/^#([\w-]+)$/);
  if (idMatch) return elements.find((e) => e.id === idMatch[1]) ?? null;

  // data-testid selector
  const testIdMatch = selector.match(/\[data-testid="([^"]+)"\]/);
  if (testIdMatch) return elements.find((e) => e.testId === testIdMatch[1]) ?? null;

  // Class selector: .foo
  const classMatch = selector.match(/^\.([\w-]+)$/);
  if (classMatch) return elements.find((e) => e.classNames.includes(classMatch[1])) ?? null;

  // Text selector (Playwright-style): text="..."
  const textMatch = selector.match(/text="([^"]+)"/);
  if (textMatch) {
    const needle = textMatch[1].toLowerCase();
    return elements.find((e) => e.text.toLowerCase().includes(needle)) ?? null;
  }

  return null;
}

function buildBestSelector(el: DomElement): string | null {
  if (el.testId) return `[data-testid="${el.testId}"]`;
  if (el.id) return `#${el.id}`;
  if (el.attributes.role && el.attributes['aria-label']) {
    return `role=${el.attributes.role}[name="${el.attributes['aria-label']}"]`;
  }
  if (el.classNames.length > 0) return `.${el.classNames[0]}`;
  return null;
}

/** Rough string similarity (Jaccard on character bigrams) */
function isSimilarString(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();

  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2).toLowerCase());
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2).toLowerCase());

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size - intersection;
  return union > 0 && intersection / union >= 0.4;
}
