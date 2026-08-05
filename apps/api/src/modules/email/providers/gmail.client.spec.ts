import { GmailClient } from './gmail.client';

describe('GmailClient', () => {
  it('caps concurrent message detail fetches instead of firing them all at once', async () => {
    const messageCount = 20;
    const messageRefs = Array.from({ length: messageCount }, (_, i) => ({
      id: `msg-${i}`,
      threadId: `thread-${i}`,
    }));

    let inFlight = 0;
    let peakInFlight = 0;

    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/messages?')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ messages: messageRefs }),
        };
      }

      // A GET /messages/:id detail fetch.
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);

      await new Promise((resolve) => setTimeout(resolve, 10));

      inFlight -= 1;

      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'msg-x',
            threadId: 'thread-x',
            payload: { mimeType: 'text/plain', headers: [] },
          }),
      };
    });

    global.fetch = fetchMock;

    const client = new GmailClient('fake-access-token');

    await client.listMessages('INBOX');

    expect(peakInFlight).toBeLessThanOrEqual(5);
    expect(peakInFlight).toBeGreaterThan(1);
    expect(fetchMock).toHaveBeenCalledTimes(messageCount + 1);
  });
});
