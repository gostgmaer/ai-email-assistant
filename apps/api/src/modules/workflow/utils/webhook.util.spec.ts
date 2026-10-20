import { LookupOptions } from 'dns';

import {
  assertWebhookUrl,
  guardedLookup,
  isPrivateAddress,
} from './webhook.util';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'not-an-ip',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe('assertWebhookUrl', () => {
  it('accepts a public https URL', () => {
    expect(assertWebhookUrl('https://hooks.example.com/abc').hostname).toBe(
      'hooks.example.com',
    );
  });

  it.each([
    ['http://hooks.example.com', /https/],
    ['https://user:pw@hooks.example.com', /credentials/],
    ['https://localhost:8080', /public host/],
    ['https://api.localhost', /public host/],
    ['https://10.0.0.5/hook', /public host/],
    ['https://[::1]/hook', /public host/],
    ['not a url', /valid URL/],
  ])('rejects %s', (url, message) => {
    expect(() => assertWebhookUrl(url)).toThrow(message);
  });
});

describe('guardedLookup', () => {
  const lookupOnce = (hostname: string, options: LookupOptions = {}) =>
    new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>(
      (resolve) =>
        guardedLookup(hostname, options, (error, address) =>
          resolve({ error, address }),
        ),
    );

  it('refuses a hostname that resolves to a private address at connect time', async () => {
    const { error } = await lookupOnce('localhost');

    expect(error?.code).toBe('EPRIVATEADDR');
  });
});
