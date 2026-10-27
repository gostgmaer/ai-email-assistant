import { fuseRankings, keywordQuery } from './hybrid-search.util';

describe('keywordQuery', () => {
  it('keeps the meaningful words of a question, OR-ed together', () => {
    expect(keywordQuery('What did Sam say about the budget?')).toBe(
      'sam | budget:*',
    );
  });

  it('matches longer words as prefixes, short ones exactly', () => {
    expect(keywordQuery('flight AI 805 invoices')).toBe(
      'flight:* | ai | 805 | invoices:*',
    );
  });

  it('keeps single digits but drops single letters', () => {
    expect(keywordQuery('a 7 b x9')).toBe('7 | x9');
  });

  it('strips anything that is tsquery syntax', () => {
    expect(keywordQuery("budget' & !(drop) | <-> :*")).toBe(
      'budget:* | drop:*',
    );
  });

  it('keeps non-English words whole, including combining marks', () => {
    expect(keywordQuery('मीटिंग कब है')).toBe('मीटिंग:* | कब | है');
  });

  it('de-duplicates and caps the number of terms', () => {
    const query = keywordQuery(
      Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ') + ' word0',
    );

    expect(query.split(' | ')).toHaveLength(12);
  });

  it('returns null when only stop words are left', () => {
    expect(keywordQuery('what is this?')).toBeNull();
    expect(keywordQuery('   ')).toBeNull();
  });
});

describe('fuseRankings', () => {
  it('ranks an id found by both methods above one found by only one', () => {
    const fused = fuseRankings([
      ['a', 'b', 'c'],
      ['c', 'd'],
    ]);

    expect(fused[0].id).toBe('c');
    expect(fused.map((entry) => entry.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a single ranking in order', () => {
    expect(fuseRankings([['x', 'y', 'z']]).map((entry) => entry.id)).toEqual([
      'x',
      'y',
      'z',
    ]);
  });

  it('returns nothing for empty rankings', () => {
    expect(fuseRankings([[], []])).toEqual([]);
  });
});
