import { GmailClient } from './gmail.client';
import {
  MailAuthError,
  MailRateLimitError,
  SyncCursorExpiredError,
  parseRetryAfter,
} from './mail-errors';
import { MicrosoftGraphClient } from './microsoft-graph.client';

function jsonResponse(body: unknown, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('provider change tracking', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  describe('GmailClient.listChanges', () => {
    it('folds history records into the final state per message, across pages', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            history: [
              {
                messagesAdded: [
                  { message: { id: 'new', labelIds: ['INBOX', 'UNREAD'] } },
                ],
              },
              {
                messagesAdded: [
                  { message: { id: 'gone', labelIds: ['INBOX'] } },
                ],
              },
              // Read elsewhere: UNREAD removed.
              {
                labelsRemoved: [
                  { message: { id: 'read-later' }, labelIds: ['UNREAD'] },
                ],
              },
            ],
            nextPageToken: 'page-2',
            historyId: '150',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            history: [
              { messagesDeleted: [{ message: { id: 'gone' } }] },
              // Archived out of INBOX: not mirrored.
              {
                labelsRemoved: [
                  { message: { id: 'archived' }, labelIds: ['INBOX'] },
                ],
              },
            ],
            historyId: '200',
          }),
        );
      global.fetch = fetchMock;

      const changes = await new GmailClient('token').listChanges(
        'INBOX',
        '100',
      );

      expect(changes).toEqual({
        upserted: [
          { providerMessageId: 'new', isRead: false },
          { providerMessageId: 'read-later', isRead: true },
        ],
        removed: ['gone'],
        nextCursor: '200',
      });
      const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
      expect(firstUrl.pathname).toMatch(/\/history$/);
      expect(firstUrl.searchParams.get('startHistoryId')).toBe('100');
      expect(firstUrl.searchParams.get('labelId')).toBe('INBOX');
      expect(
        new URL(fetchMock.mock.calls[1][0] as string).searchParams.get(
          'pageToken',
        ),
      ).toBe('page-2');
    });

    it('turns a 404 (history too old) into SyncCursorExpiredError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 404));

      await expect(
        new GmailClient('token').listChanges('INBOX', '1'),
      ).rejects.toBeInstanceOf(SyncCursorExpiredError);
    });

    it('types 401 as an auth failure and 429 as a rate limit with Retry-After', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
      await expect(
        new GmailClient('token').getChangeCursor(),
      ).rejects.toBeInstanceOf(MailAuthError);

      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({}, 429, { 'retry-after': '120' }));
      const error = (await new GmailClient('token')
        .getChangeCursor()
        .catch((e: unknown) => e)) as MailRateLimitError;
      expect(error).toBeInstanceOf(MailRateLimitError);
      expect(error.retryAfterMs).toBe(120_000);
    });
  });

  describe('MicrosoftGraphClient delta', () => {
    it('follows nextLink pages to the deltaLink and ignores @removed entries', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            value: [{ id: 'a', isRead: false }],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$skiptoken=x',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            value: [
              { id: 'b', isRead: true },
              { id: 'moved', '@removed': { reason: 'deleted' } },
            ],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$deltatoken=y',
          }),
        );
      global.fetch = fetchMock;

      const changes = await new MicrosoftGraphClient('token').listChanges(
        'f',
        'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$deltatoken=old',
      );

      expect(changes).toEqual({
        upserted: [
          { providerMessageId: 'a', isRead: false },
          { providerMessageId: 'b', isRead: true },
        ],
        removed: [],
        nextCursor:
          'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$deltatoken=y',
      });
    });

    it('never sends the bearer token to a non-Graph URL stored as a cursor', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock;

      await expect(
        new MicrosoftGraphClient('token').listChanges(
          'f',
          'https://attacker.example/collect',
        ),
      ).rejects.toBeInstanceOf(SyncCursorExpiredError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('turns 410 Gone (expired delta token) into SyncCursorExpiredError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 410));

      await expect(
        new MicrosoftGraphClient('token').listChanges(
          'f',
          'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$deltatoken=old',
        ),
      ).rejects.toBeInstanceOf(SyncCursorExpiredError);
    });

    it('baselines with a delta round filtered to mail received from now on', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse({
          value: [],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/me/mailFolders/f/messages/delta?$deltatoken=z',
        }),
      );
      global.fetch = fetchMock;

      const cursor = await new MicrosoftGraphClient('token').getChangeCursor(
        'f',
      );

      expect(cursor).toContain('$deltatoken=z');
      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/v1.0/me/mailFolders/f/messages/delta');
      expect(url.searchParams.get('$filter')).toMatch(/^receivedDateTime ge /);
    });
  });

  describe('parseRetryAfter', () => {
    it('reads delay-seconds and HTTP dates', () => {
      expect(parseRetryAfter('30')).toBe(30_000);
      expect(parseRetryAfter(null)).toBeUndefined();
      const inOneMinute = new Date(Date.now() + 60_000).toUTCString();
      expect(parseRetryAfter(inOneMinute)).toBeGreaterThan(55_000);
    });
  });
});
