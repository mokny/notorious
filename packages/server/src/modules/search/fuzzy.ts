/** Classic Levenshtein edit distance, used as the fuzzy-match fallback for typo tolerance. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) dp[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[rows - 1]![cols - 1]!;
}

function wordScore(query: string, word: string): number {
  const distance = levenshtein(query, word);
  const maxLen = Math.max(query.length, word.length, 1);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Returns a 0-1 similarity score (1 = exact match) for fuzzy/typo-tolerant
 * search. Scored per-word (not just the whole string) so a typo'd query still
 * matches one mistyped word inside a longer title.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (!q) return 0;
  if (c.includes(q)) return 1;

  const words = c.split(/\s+/).filter(Boolean);
  const bestWordScore = words.reduce((best, word) => Math.max(best, wordScore(q, word)), 0);
  return Math.max(bestWordScore, wordScore(q, c));
}
