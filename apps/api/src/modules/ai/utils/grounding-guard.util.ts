/**
 * Prompt-injection containment for autonomous replies (docs/email-
 * automation-gaps.md G-07). The reply is grounded in the user's private
 * documents, and the email being answered can try to steer the model into
 * quoting them back. Delimiting in the AI service lowers that risk; these
 * deterministic checks decide whether a reply may still go out WITHOUT a
 * human looking at it.
 */

export type SenderTrust = 'INTERNAL' | 'KNOWN' | 'UNKNOWN';

// Consumer mailbox domains: sharing one says nothing about being in the
// same organisation, so they never make a sender INTERNAL.
const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
]);

function domainOf(address: string): string {
  return address.split('@')[1]?.toLowerCase() ?? '';
}

/**
 * INTERNAL: same organisation domain as one of the account's own
 * addresses. KNOWN: a CRM contact, or someone the account has written to
 * before. Everyone else is UNKNOWN.
 */
export function classifySenderTrust(
  senderAddress: string,
  ownAddresses: string[],
  isKnownCorrespondent: boolean,
): SenderTrust {
  const senderDomain = domainOf(senderAddress);
  const orgDomains = new Set(
    ownAddresses
      .map(domainOf)
      .filter((domain) => domain && !FREEMAIL_DOMAINS.has(domain)),
  );

  if (senderDomain && orgDomains.has(senderDomain)) {
    return 'INTERNAL';
  }
  return isKnownCorrespondent ? 'KNOWN' : 'UNKNOWN';
}

// A run of this many characters copied from a document is a quote, not a
// paraphrase — the shape of "include the pricing sheet" exfiltration.
const VERBATIM_RUN_CHARS = 120;
const WINDOW = VERBATIM_RUN_CHARS / 2;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Whether `reply` contains a run of >= 120 characters copied verbatim
 * (whitespace/case-insensitive) from any of `sources`. Checks the
 * source's 60-char windows at 60-char steps: any shared run of 120+
 * characters must fully contain one of those aligned windows.
 */
export function findVerbatimQuote(
  reply: string,
  sources: { content: string; filename: string }[],
): string | null {
  const haystack = normalize(reply);

  for (const source of sources) {
    const text = normalize(source.content);
    for (let start = 0; start + WINDOW <= text.length; start += WINDOW) {
      if (haystack.includes(text.slice(start, start + WINDOW))) {
        return source.filename;
      }
    }
  }

  return null;
}
