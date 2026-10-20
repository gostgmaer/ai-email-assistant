import type { Request } from 'express';

import { OAuthStateStore } from './oauth-state.store';
import type { RedisService } from '../../../infrastructure/redis';

describe('OAuthStateStore', () => {
  function buildDeps() {
    const redisService = {
      set: jest.fn().mockResolvedValue('OK'),
      exists: jest.fn().mockResolvedValue(false),
      del: jest.fn().mockResolvedValue(1),
    } as unknown as RedisService;

    const store = new OAuthStateStore(redisService);

    return { store, redisService };
  }

  const req = {} as Request;

  describe('store', () => {
    it('generates a random state, persists it in redis with a TTL, and returns it via the callback', async () => {
      const { store, redisService } = buildDeps();

      const state = await new Promise<string | undefined>(
        (resolve, reject) => {
          store.store(req, (err, s) => (err ? reject(err) : resolve(s)));
        },
      );

      expect(state).toMatch(/^[0-9a-f]{48}$/);
      expect(redisService.set).toHaveBeenCalledWith(
        `oauth:state:${state}`,
        '1',
        300,
      );
    });

    it('supports the 3-argument overload used by passport-oauth2, ignoring the metadata', async () => {
      const { store, redisService } = buildDeps();

      const state = await new Promise<string | undefined>(
        (resolve, reject) => {
          store.store(
            req,
            { authorizationURL: 'x', tokenURL: 'y', clientID: 'z' },
            (err, s) => (err ? reject(err) : resolve(s)),
          );
        },
      );

      expect(state).toBeDefined();
      expect(redisService.set).toHaveBeenCalledTimes(1);
    });

    it('propagates a redis failure to the callback instead of throwing', async () => {
      const { store, redisService } = buildDeps();
      (redisService.set as jest.Mock).mockRejectedValue(
        new Error('redis down'),
      );

      const error = await new Promise<Error | null>((resolve) => {
        store.store(req, (err) => resolve(err));
      });

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('verify', () => {
    it('accepts a state that exists and deletes it (single use)', async () => {
      const { store, redisService } = buildDeps();
      (redisService.exists as jest.Mock).mockResolvedValue(true);

      const result = await new Promise<{ ok: boolean; message?: string }>(
        (resolve, reject) => {
          store.verify(req, 'some-state', (err, ok, message) =>
            err ? reject(err) : resolve({ ok, message }),
          );
        },
      );

      expect(result.ok).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith('oauth:state:some-state');
    });

    it('rejects a state that has expired or was never issued, without deleting anything', async () => {
      const { store, redisService } = buildDeps();
      (redisService.exists as jest.Mock).mockResolvedValue(false);

      const result = await new Promise<{ ok: boolean; message?: string }>(
        (resolve, reject) => {
          store.verify(req, 'missing-state', (err, ok, message) =>
            err ? reject(err) : resolve({ ok, message }),
          );
        },
      );

      expect(result.ok).toBe(false);
      expect(result.message).toBe('OAuth state expired or invalid');
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('supports the 4-argument overload used by passport-oauth2', async () => {
      const { store, redisService } = buildDeps();
      (redisService.exists as jest.Mock).mockResolvedValue(true);

      const result = await new Promise<{ ok: boolean }>((resolve, reject) => {
        store.verify(
          req,
          'some-state',
          { authorizationURL: 'x', tokenURL: 'y', clientID: 'z' },
          (err, ok) => (err ? reject(err) : resolve({ ok })),
        );
      });

      expect(result.ok).toBe(true);
    });

    it('propagates a redis failure to the callback instead of throwing', async () => {
      const redisService = {
        set: jest.fn(),
        exists: jest.fn().mockRejectedValue(new Error('redis down')),
        del: jest.fn(),
      } as unknown as RedisService;
      const store = new OAuthStateStore(redisService);

      const error = await new Promise<unknown>((resolve) => {
        store.verify(req, 'some-state', (err) => resolve(err));
      });

      expect(error).toBeInstanceOf(Error);
    });
  });
});
