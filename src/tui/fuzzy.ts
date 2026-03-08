import type { FuzzyResult } from "../core/types.ts";

const WORD_SEPARATORS = new Set(["/", ".", "_", "-", " "]);

function isUpperCase(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

function isWordBoundary(str: string, index: number): boolean {
  if (index === 0) return true;
  const prev = str.charAt(index - 1);
  const curr = str.charAt(index);
  if (WORD_SEPARATORS.has(prev)) return true;
  if (!isUpperCase(prev) && isUpperCase(curr)) return true;
  return false;
}

export function fuzzyMatch(pattern: string, text: string): FuzzyResult {
  if (pattern.length === 0) return { matches: true, score: 0, positions: [] };

  const patLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  let patIdx = 0;
  let score = 0;
  const positions: number[] = [];
  let lastMatchIdx = -1;

  for (let i = 0; i < textLower.length && patIdx < patLower.length; i++) {
    if (textLower[i] === patLower[patIdx]) {
      positions.push(i);

      // Start-of-string bonus
      if (i === 0) score += 15;
      // Word boundary bonus
      else if (isWordBoundary(text, i)) score += 10;

      // Consecutive bonus
      if (lastMatchIdx === i - 1) score += 5;
      // Gap penalty
      else if (lastMatchIdx >= 0) score -= i - lastMatchIdx - 1;

      lastMatchIdx = i;
      patIdx++;
    }
  }

  if (patIdx < patLower.length) {
    return { matches: false, score: 0, positions: [] };
  }

  // Penalize unmatched leading characters
  const firstPosition = positions[0];
  if (firstPosition !== undefined) {
    score -= firstPosition * 3;
  }

  return { matches: true, score, positions };
}

export function highlightMatch(
  text: string,
  positions: number[],
  highlightStart: string,
  highlightEnd: string,
): string {
  if (positions.length === 0) return text;

  const posSet = new Set(positions);
  let result = "";
  let inHighlight = false;

  for (let i = 0; i < text.length; i++) {
    if (posSet.has(i) && !inHighlight) {
      result += highlightStart;
      inHighlight = true;
    } else if (!posSet.has(i) && inHighlight) {
      result += highlightEnd;
      inHighlight = false;
    }
    result += text[i];
  }
  if (inHighlight) result += highlightEnd;

  return result;
}
