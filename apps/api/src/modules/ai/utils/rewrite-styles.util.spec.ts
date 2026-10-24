import { resolveRewriteStyle } from './rewrite-styles.util';

describe('resolveRewriteStyle', () => {
  it('passes a plain instruction through with no tone', () => {
    expect(resolveRewriteStyle(undefined, 'Mention Friday')).toEqual({
      instruction: 'Mention Friday',
    });
  });

  it('sets the tone for a tone preset', () => {
    expect(resolveRewriteStyle('friendly', undefined)).toEqual({
      tone: 'friendly',
      instruction: 'Make it warmer and friendlier.',
    });
  });

  it("keeps the draft's own tone for grammar fixes", () => {
    const resolved = resolveRewriteStyle('grammar', undefined);

    expect(resolved.tone).toBeUndefined();
    expect(resolved.instruction).toContain('Change nothing else');
  });

  it("adds the user's own instruction after the preset's", () => {
    expect(resolveRewriteStyle('shorter', 'Keep the bullet list.')).toEqual({
      instruction:
        'Make it noticeably shorter. Keep every request, question, name, number and date; cut everything else. Keep the bullet list.',
    });
  });
});
