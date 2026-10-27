import {
  isPrivateAddress,
  parseListUnsubscribe,
} from './list-unsubscribe.util';

describe('parseListUnsubscribe', () => {
  it('finds a one-click https URL and a mailto', () => {
    expect(
      parseListUnsubscribe(
        '<mailto:unsub@list.example.com?subject=unsubscribe>, <https://list.example.com/u/abc>',
        'List-Unsubscribe=One-Click',
      ),
    ).toEqual({
      oneClickUrl: 'https://list.example.com/u/abc',
      url: 'https://list.example.com/u/abc',
      mailto: { address: 'unsub@list.example.com', subject: 'unsubscribe' },
    });
  });

  it('is only a link without the RFC 8058 POST header', () => {
    expect(
      parseListUnsubscribe('<https://list.example.com/u/abc>', undefined),
    ).toEqual({ url: 'https://list.example.com/u/abc' });
  });

  it('never makes a plain http URL one-click', () => {
    expect(
      parseListUnsubscribe(
        '<http://list.example.com/u/abc>',
        'List-Unsubscribe=One-Click',
      ),
    ).toEqual({ url: 'http://list.example.com/u/abc' });
  });

  it('drops IP-literal and credential-carrying URLs', () => {
    expect(
      parseListUnsubscribe(
        '<https://169.254.169.254/latest>, <https://user:pw@list.example.com/u>, <https://[::1]/u>',
        'List-Unsubscribe=One-Click',
      ),
    ).toEqual({});
  });

  it('ignores a malformed mailto and other schemes', () => {
    expect(
      parseListUnsubscribe('<mailto:not-an-address>, <javascript:alert(1)>'),
    ).toEqual({});
  });

  it('returns nothing without a header', () => {
    expect(parseListUnsubscribe(null)).toEqual({});
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['93.184.216.34', '172.32.0.1', '2606:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});
