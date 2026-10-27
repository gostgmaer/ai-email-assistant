import {
  buildEmailChunks,
  CHUNK_CHARS,
  MAX_CHUNKS_PER_MESSAGE,
  splitText,
} from './email-chunks.util';

const base = {
  subject: 'Budget for Q4',
  from: [{ name: 'Sam Lee', address: 'sam@client.io' }],
  to: [{ address: 'me@acme.io' }],
  receivedAt: new Date('2026-10-20T09:30:00Z'),
  bodyHtml: null,
};

describe('buildEmailChunks', () => {
  it('prefixes the body with subject, sender, recipients and date', () => {
    const [chunk] = buildEmailChunks({
      ...base,
      bodyText: 'We can go up to 40k.',
    });

    expect(chunk).toBe(
      [
        'Subject: Budget for Q4',
        'From: Sam Lee <sam@client.io>',
        'To: me@acme.io',
        'Date: 2026-10-20',
        '',
        'We can go up to 40k.',
      ].join('\n'),
    );
  });

  it('leaves out quoted history — earlier messages are indexed on their own', () => {
    const [chunk] = buildEmailChunks({
      ...base,
      bodyText:
        'Sounds good, Friday works.\n\nOn Mon, 19 Oct 2026 at 10:00, Me <me@acme.io> wrote:\n> Can we meet Friday?',
    });

    expect(chunk).toContain('Sounds good, Friday works.');
    expect(chunk).not.toContain('Can we meet Friday?');
  });

  it('falls back to the HTML body when there is no text body', () => {
    const [chunk] = buildEmailChunks({
      ...base,
      bodyText: null,
      bodyHtml: '<p>Your flight <b>AI 805</b> departs at 6:10.</p>',
    });

    expect(chunk).toContain('Your flight AI 805 departs at 6:10.');
    expect(chunk).not.toContain('<b>');
  });

  it('indexes a subject-only message as just its header', () => {
    expect(buildEmailChunks({ ...base, bodyText: '' })).toEqual([
      expect.stringContaining('Subject: Budget for Q4'),
    ]);
  });

  it('returns nothing for a message with neither subject nor body', () => {
    expect(
      buildEmailChunks({ ...base, subject: null, bodyText: '  ' }),
    ).toEqual([]);
  });

  it('caps a very long message at MAX_CHUNKS_PER_MESSAGE chunks', () => {
    const chunks = buildEmailChunks({
      ...base,
      bodyText: 'word '.repeat(CHUNK_CHARS * 4),
    });

    expect(chunks).toHaveLength(MAX_CHUNKS_PER_MESSAGE);
    chunks.forEach((chunk) =>
      expect(chunk.startsWith('Subject: Budget for Q4')).toBe(true),
    );
  });

  it('labels missing participants instead of failing', () => {
    const [chunk] = buildEmailChunks({
      ...base,
      from: null,
      to: [],
      bodyText: 'Hi',
    });

    expect(chunk).toContain('From: (unknown)');
    expect(chunk).toContain('To: (unknown)');
  });
});

describe('splitText', () => {
  it('keeps short text whole', () => {
    expect(splitText('short', 100, 10)).toEqual(['short']);
  });

  it('cuts at sentence or word boundaries, never mid-word', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const pieces = splitText(sentence.repeat(20), 200, 40);

    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(200);
      expect(piece).toMatch(/^(The|quick|brown|fox|jumps|over|the|lazy|dog)/);
      expect(piece).toMatch(
        /(\.|The|quick|brown|fox|jumps|over|the|lazy|dog)$/,
      );
    }
  });

  it('overlaps consecutive pieces so a boundary sentence appears whole once', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence ${i}.`).join(
      ' ',
    );
    const pieces = splitText(text, 120, 40);

    for (let i = 1; i < pieces.length; i++) {
      const tail = pieces[i - 1].slice(-20);
      const lastWord = tail.trim().split(' ').pop();
      expect(pieces[i]).toContain(lastWord);
    }
  });

  it('covers the whole text', () => {
    const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const joined = splitText(text, 150, 30).join(' ');

    for (let i = 0; i < 200; i++) {
      expect(joined).toContain(`w${i}`);
    }
  });
});
