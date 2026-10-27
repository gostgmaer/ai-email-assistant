import { isIP } from 'node:net';

/** How a newsletter can be unsubscribed from, parsed from its headers. */
export interface UnsubscribeOptions {
  /** RFC 8058 one-click: the app POSTs to this https URL itself. */
  oneClickUrl?: string;
  /** A web page the user opens to unsubscribe. */
  url?: string;
  /** An address to email (RFC 2369 mailto:), with its subject/body. */
  mailto?: { address: string; subject?: string; body?: string };
}

/**
 * Parses List-Unsubscribe (RFC 2369: a comma-separated list of <URI>) and
 * List-Unsubscribe-Post (RFC 8058). One-click needs both an https URI and
 * the exact "List-Unsubscribe=One-Click" POST header — anything less is
 * only a link to open.
 */
export function parseListUnsubscribe(
  header?: string | null,
  postHeader?: string | null,
): UnsubscribeOptions {
  const options: UnsubscribeOptions = {};
  if (!header) {
    return options;
  }

  const uris = [...header.matchAll(/<([^>]+)>/g)].map((match) =>
    match[1].trim(),
  );
  const oneClick = /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i.test(
    postHeader ?? '',
  );

  for (const uri of uris) {
    if (/^https:\/\//i.test(uri) && isSafeUrl(uri)) {
      if (oneClick && !options.oneClickUrl) {
        options.oneClickUrl = uri;
      }
      options.url ??= uri;
    } else if (/^http:\/\//i.test(uri) && isSafeUrl(uri)) {
      options.url ??= uri;
    } else if (/^mailto:/i.test(uri) && !options.mailto) {
      options.mailto = parseMailto(uri);
    }
  }
  if (!options.mailto) {
    delete options.mailto;
  }
  return options;
}

function parseMailto(uri: string): UnsubscribeOptions['mailto'] {
  const [target, query = ''] = uri.slice('mailto:'.length).split('?', 2);
  let address: string;
  try {
    address = decodeURIComponent(target).trim();
  } catch {
    return undefined;
  }
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address)) {
    return undefined;
  }
  const params = new URLSearchParams(query);
  return {
    address,
    subject: params.get('subject')?.slice(0, 200) || undefined,
    body: params.get('body')?.slice(0, 1000) || undefined,
  };
}

/** A URL a sender put in a header: parseable, no credentials, and not an
 * IP-literal host (a real newsletter platform has a hostname). */
function isSafeUrl(uri: string): boolean {
  try {
    const url = new URL(uri);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return !url.username && !url.password && isIP(host) === 0;
  } catch {
    return false;
  }
}

/**
 * True for addresses the server must never send a request to on a
 * sender's say-so: loopback, private, link-local (cloud metadata),
 * carrier-grade NAT, unique-local and unspecified ranges.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) {
      return isPrivateAddress(mapped[1]);
    }
    return (
      lower === '::' ||
      lower === '::1' ||
      /^f[cd]/.test(lower) ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('ff')
    );
  }
  return true;
}
