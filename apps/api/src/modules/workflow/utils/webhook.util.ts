import { createHmac, randomBytes } from 'crypto';
import { LookupAddress, LookupOptions, lookup } from 'dns';
import { request } from 'https';
import { isIP } from 'net';

const WEBHOOK_TIMEOUT_MS = 5_000;

/** A fresh signing secret for a WEBHOOK action (shown to the rule owner so
 * the receiver can verify X-Signature). */
export function generateWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Loopback, private, link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT, multicast, reserved and unspecified addresses — anything that
 * isn't a public internet host. A rule's webhook must never be able to
 * reach the API's own network.
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped/compatible forms, dotted (::ffff:127.0.0.1) or as the URL
    // parser normalizes them (::ffff:7f00:1).
    const dotted = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(
        `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
      );
    }
    return (
      lower === '::' ||
      lower === '::1' ||
      /^f[cd]/.test(lower) || // fc00::/7 unique local
      /^fe[89ab]/.test(lower) || // fe80::/10 link-local
      lower.startsWith('ff') || // multicast
      lower.startsWith('64:ff9b:') || // NAT64 — may front a private v4
      lower.startsWith('2001:db8:')
    );
  }
  return true;
}

/** Throws with a user-facing reason if the URL can't be a webhook target.
 * Hostnames are checked again at connect time (see guardedLookup). */
export function assertWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Webhook URL is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use https');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not contain credentials');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Webhook URL must be a public host');
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error('Webhook URL must be a public host');
  }
  return url;
}

/**
 * dns.lookup that refuses private addresses — passed to https.request so the
 * check applies to the address actually connected to (a hostname that
 * resolves to a public IP at save time and 127.0.0.1 later is refused).
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '');
      return;
    }
    const list = addresses;
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      callback(
        Object.assign(new Error(`${hostname} resolves to a private address`), {
          code: 'EPRIVATEADDR',
        }),
        '',
      );
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

/**
 * POSTs `payload` as JSON. The receiver verifies it with
 * HMAC-SHA256(secret, `${X-Signature-Timestamp}.${rawBody}`), hex, sent as
 * `X-Signature: sha256=<hex>`. Redirects are not followed; any non-2xx
 * response is an error.
 */
export async function postWebhook(
  rawUrl: string,
  secret: string,
  payload: unknown,
): Promise<void> {
  const url = assertWebhookUrl(rawUrl);
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  await new Promise<void>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'ai-email-assistant-webhook/1',
          'X-Signature': `sha256=${signature}`,
          'X-Signature-Timestamp': timestamp,
        },
        lookup: guardedLookup,
        timeout: WEBHOOK_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook responded ${status}`));
        }
      },
    );
    req.on('timeout', () => req.destroy(new Error('Webhook timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
