import {
  decodeAttachments,
  describeAttachments,
} from '../utils/attachments.util';
import { GmailClient } from './gmail.client';
import { MicrosoftGraphClient } from './microsoft-graph.client';

/** Attachment metadata from each provider's message shape, and fetching
 * the bytes back — recorded response shapes, fetch mocked. */
describe('attachments', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function respondWith(body: unknown) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode('file-bytes').buffer),
    });
    global.fetch = fetchMock;
    return fetchMock;
  }

  const firstUrl = (fetchMock: jest.Mock) =>
    (fetchMock.mock.calls as [[string]])[0][0];

  describe('GmailClient', () => {
    it('lists attachments and inline images, and keeps a text attachment out of the body', async () => {
      respondWith({
        id: 'msg-1',
        threadId: 'thread-1',
        payload: {
          mimeType: 'multipart/mixed',
          headers: [],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Body text').toString('base64url') },
            },
            {
              mimeType: 'text/plain',
              filename: 'notes.txt',
              headers: [{ name: 'Content-Disposition', value: 'attachment' }],
              body: { attachmentId: 'att-txt', size: 120 },
            },
            {
              mimeType: 'image/png',
              filename: 'logo.png',
              headers: [{ name: 'Content-ID', value: '<logo@x>' }],
              body: { attachmentId: 'att-img', size: 900 },
            },
          ],
        },
      });

      const message = await new GmailClient('token').getMessage('msg-1');

      expect(message.bodyText).toBe('Body text');
      expect(message.attachments).toEqual([
        {
          providerAttachmentId: 'att-txt',
          filename: 'notes.txt',
          mimeType: 'text/plain',
          size: 120,
          contentId: undefined,
          isInline: false,
        },
        {
          providerAttachmentId: 'att-img',
          filename: 'logo.png',
          mimeType: 'image/png',
          size: 900,
          contentId: 'logo@x',
          isInline: true,
        },
      ]);
    });

    it('decodes a downloaded attachment', async () => {
      const fetchMock = respondWith({
        data: Buffer.from('%PDF').toString('base64url'),
      });

      const content = await new GmailClient('token').getAttachment(
        'msg-1',
        'att-1',
      );

      expect(content.toString()).toBe('%PDF');
      expect(firstUrl(fetchMock)).toContain(
        '/messages/msg-1/attachments/att-1',
      );
    });
  });

  describe('MicrosoftGraphClient', () => {
    it('asks for attachment metadata only, and maps it', async () => {
      const fetchMock = respondWith({
        id: 'm1',
        conversationId: 'c1',
        attachments: [
          {
            id: 'a1',
            name: 'quote.pdf',
            contentType: 'application/pdf',
            size: 2048,
            isInline: false,
          },
        ],
      });

      const message = await new MicrosoftGraphClient('token').getMessage('m1');

      expect(decodeURIComponent(firstUrl(fetchMock))).toContain(
        '$expand=attachments($select=id,name,contentType,size,isInline)',
      );
      expect(message.attachments).toEqual([
        {
          providerAttachmentId: 'a1',
          filename: 'quote.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          isInline: false,
        },
      ]);
    });

    it('downloads the raw bytes', async () => {
      const fetchMock = respondWith({});

      const content = await new MicrosoftGraphClient('token').getAttachment(
        'm1',
        'a1',
      );

      expect(content.toString()).toBe('file-bytes');
      expect(firstUrl(fetchMock)).toMatch(
        /\/messages\/m1\/attachments\/a1\/\$value$/,
      );
    });
  });

  describe('attachments.util', () => {
    it('decodes uploads and enforces the 3 MB total', () => {
      const small = Buffer.from('hello').toString('base64');
      expect(
        decodeAttachments([
          {
            filename: 'a.txt',
            contentType: 'text/plain',
            contentBase64: small,
          },
        ])?.[0].content.toString(),
      ).toBe('hello');

      const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
      expect(() =>
        decodeAttachments([
          { filename: 'b.bin', contentType: 'x', contentBase64: big },
        ]),
      ).toThrow(/3 MB/);
    });

    it('describes attachments for the AI by name, type and size only', () => {
      expect(
        describeAttachments([
          {
            filename: 'invoice.pdf',
            mimeType: 'application/pdf',
            size: 122880,
          },
        ]),
      ).toBe('invoice.pdf (application/pdf, 120 KB)');
    });
  });
});
