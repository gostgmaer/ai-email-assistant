// Longer texts are compared on their first this-many characters: the metric
// is about how much a reviewer changed, and O(n·m) on two whole long emails
// isn't worth it.
const MAX_COMPARED_CHARS = 4000;

/**
 * Levenshtein distance between two texts (whitespace-normalized) divided
 * by the longer length: 0 = identical, 1 = nothing in common.
 */
export function normalizedEditDistance(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) {
    return 0;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, j) => j);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return Math.round((previous[right.length] / longest) * 1000) / 1000;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_COMPARED_CHARS);
}
