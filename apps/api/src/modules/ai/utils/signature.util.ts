import { textToSafeHtml } from '../../email/utils/text-to-html.util';

/**
 * Appends the account's signature to an AI-generated reply — after
 * generation, deterministically; the model is told one will be added and
 * never writes it (docs/email-automation-implementation-plan.md §5.5).
 * The HTML signature is used as-is when set (it's the owner's own, e.g.
 * imported from Gmail); otherwise the text one is escaped.
 */
export function withSignature(
  replyText: string,
  signature: { signatureText: string | null; signatureHtml: string | null },
): { text: string; html: string } {
  const html = textToSafeHtml(replyText);
  const sigText =
    signature.signatureText?.trim() ||
    (signature.signatureHtml ? htmlToPlainText(signature.signatureHtml) : '');

  if (!sigText) {
    return { text: replyText, html };
  }

  const sigHtml = signature.signatureHtml?.trim() || textToSafeHtml(sigText);
  return {
    text: `${replyText.trimEnd()}\n\n${sigText}`,
    html: `${html}<br><br><div class="signature">${sigHtml}</div>`,
  };
}

export function hasSignature(signature: {
  signatureText: string | null;
  signatureHtml: string | null;
}): boolean {
  return !!(signature.signatureText?.trim() || signature.signatureHtml?.trim());
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Plain-text version of a (signature-sized) HTML fragment: line breaks
 * kept, tags dropped, common entities decoded. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
