/** Reciprocal-rank-fusion constant from the original paper (Cormack et al.
 * 2009): large enough that being 1st vs 2nd in one list matters less than
 * appearing in both lists. */
const RRF_K = 60;

// Most terms a keyword query keeps — a long question would otherwise turn
// into a tsquery that matches almost every chunk on some common word.
const MAX_TERMS = 12;

// Question and filler words that would match nearly every email. English
// only: the 'simple' text-search config has no stop-word list of its own,
// and other languages' function words are rare enough in mail not to
// dominate the ranking.
const STOP_WORDS = new Set(
  (
    'a an the and or but if of to in on at by for from with about into over ' +
    'is are was were be been being am do does did done have has had ' +
    'i me my mine we us our you your he him his she her they them their it its ' +
    'this that these those there here what which who whom whose when where why how ' +
    'can could should would will shall may might must not no yes ' +
    'any some all every each tell say said says ask asked please email emails mail ' +
    'message messages sent send get got know find show give'
  ).split(' '),
);

/**
 * A Postgres `to_tsquery('simple', …)` string for a natural-language
 * question: its meaningful words OR-ed together, so a chunk matching more
 * of them ranks higher (plain AND would require "what" and "did" to appear
 * too). Words of four or more letters also match as prefixes ("invoice"
 * finds "invoices"). Tokens are letters, combining marks and digits only,
 * so nothing user-typed can inject tsquery syntax.
 *
 * Returns null when nothing searchable is left.
 */
export function keywordQuery(text: string): string | null {
  const tokens = text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

  const terms = [
    ...new Set(
      tokens.filter(
        (token) =>
          !STOP_WORDS.has(token) && (token.length >= 2 || /\d/.test(token)),
      ),
    ),
  ].slice(0, MAX_TERMS);

  if (terms.length === 0) {
    return null;
  }
  return terms
    .map((term) => (term.length >= 4 ? `${term}:*` : term))
    .join(' | ');
}

/**
 * Merges several best-first rankings of ids into one (reciprocal-rank
 * fusion): each id scores 1/(k + rank) in every list it appears in, summed.
 * Rank-based, so a cosine distance and a ts_rank never need to be put on
 * the same scale.
 */
export function fuseRankings(
  rankings: string[][],
  k = RRF_K,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
