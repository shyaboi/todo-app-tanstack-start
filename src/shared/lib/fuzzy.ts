/**
 * Subsequence matching with a small, explainable score. Higher is better;
 * null is no match.
 *
 * Kept deliberately simple -- this ranks a few dozen commands and task titles,
 * not a corpus. What it rewards: the query appearing whole, characters that
 * follow each other, and characters that start a word. What it penalises:
 * distance between matched characters, so "fdl" prefers "Focus the Delete"
 * over a match scattered across a long title.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (q === '') return 0

  // A contiguous hit is what people mean most of the time; rank it first.
  const at = t.indexOf(q)
  if (at !== -1) {
    const wordStart = at === 0 || /\s/.test(t[at - 1] ?? '')
    return 1000 + (wordStart ? 100 : 0) - at
  }

  let score = 0
  let ti = 0
  let previous = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null

    if (found === previous + 1) score += 8 // consecutive
    if (found === 0 || /\s/.test(t[found - 1] ?? '')) score += 6 // word start
    score -= Math.min(found - ti, 10) // gap penalty, capped

    previous = found
    ti = found + 1
  }
  return score
}

/** Keeps and sorts the matches, best first; ties keep their input order. */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  text: (item: T) => string,
): T[] {
  const scored: { item: T; score: number; index: number }[] = []
  items.forEach((item, index) => {
    const score = fuzzyScore(query, text(item))
    if (score !== null) scored.push({ item, score, index })
  })
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.item)
}
