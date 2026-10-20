import { GatewayTimeoutException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AiClientService } from './ai-client.service';

describe('AiClientService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function buildService(env: Record<string, string>) {
    const configService = {
      get: jest.fn((key: string) => env[key]),
      getOrThrow: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new AiClientService(configService);
  }

  /** A fetch that never answers — only the abort signal can end it. */
  function hangingFetch() {
    return jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
  }

  it('times out a hung AI call instead of waiting forever', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;
    const service = buildService({
      AI_SERVICE_URL: 'http://ai:8000',
      AI_REQUEST_TIMEOUT_MS: '20',
    });

    await expect(service.classify('Hi', [])).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('gives reply generation a longer timeout than a single call', async () => {
    const fetchMock = hangingFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = buildService({
      AI_SERVICE_URL: 'http://ai:8000',
      AI_REQUEST_TIMEOUT_MS: '20',
    });

    const started = Date.now();
    await expect(service.generateReply('Hi', [])).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );

    // 2x the base timeout.
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });
});
