export const REWRITE_STYLES = [
  'shorter',
  'formal',
  'friendly',
  'grammar',
] as const;

export type RewriteStyle = (typeof REWRITE_STYLES)[number];

/**
 * The one-click rewrite options in the reply box and compose page. Kept
 * here rather than in the web app so the wording sent to the model is
 * reviewed (and tested) with the rest of the AI prompts. No tone means the
 * AI service keeps the draft's own.
 */
const PRESETS: Record<RewriteStyle, { tone?: string; instruction: string }> = {
  shorter: {
    instruction:
      'Make it noticeably shorter. Keep every request, question, name, number and date; cut everything else.',
  },
  formal: {
    tone: 'formal',
    instruction: 'Make it more formal.',
  },
  friendly: {
    tone: 'friendly',
    instruction: 'Make it warmer and friendlier.',
  },
  grammar: {
    instruction:
      'Only fix spelling, grammar and punctuation. Change nothing else: keep the wording, tone, length, structure and opening.',
  },
};

/** A preset's tone and instruction, with any free-text instruction from
 * the user added after the preset's own. */
export function resolveRewriteStyle(
  style: RewriteStyle | undefined,
  instruction: string | undefined,
): { tone?: string; instruction?: string } {
  if (!style) {
    return { instruction };
  }

  const preset = PRESETS[style];
  return {
    tone: preset.tone,
    instruction: instruction
      ? `${preset.instruction} ${instruction}`
      : preset.instruction,
  };
}
