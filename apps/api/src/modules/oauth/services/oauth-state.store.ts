import { randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';
import { Request } from 'express';

import { RedisService } from '../../../infrastructure/redis';

const STATE_KEY_PREFIX = 'oauth:state:';
const STATE_TTL_SECONDS = 300;

interface OAuth2Metadata {
  authorizationURL: string;
  tokenURL: string;
  clientID: string;
}

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  message?: string,
) => void;

@Injectable()
export class OAuthStateStore {
  constructor(private readonly redisService: RedisService) {}

  store(req: Request, callback: StoreCallback): void;
  store(req: Request, meta: OAuth2Metadata, callback: StoreCallback): void;
  store(
    req: Request,
    metaOrCallback: OAuth2Metadata | StoreCallback,
    maybeCallback?: StoreCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback;

    const state = randomBytes(24).toString('hex');

    this.redisService
      .set(`${STATE_KEY_PREFIX}${state}`, '1', STATE_TTL_SECONDS)
      .then(() => callback(null, state))
      .catch((error: unknown) => callback(error as Error));
  }

  verify(req: Request, state: string, callback: VerifyCallback): void;
  verify(
    req: Request,
    state: string,
    meta: OAuth2Metadata,
    callback: VerifyCallback,
  ): void;
  verify(
    req: Request,
    state: string,
    metaOrCallback: OAuth2Metadata | VerifyCallback,
    maybeCallback?: VerifyCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback;

    const key = `${STATE_KEY_PREFIX}${state}`;

    this.redisService
      .exists(key)
      .then(async (exists) => {
        if (!exists) {
          callback(null, false, 'OAuth state expired or invalid');
          return;
        }

        await this.redisService.del(key);
        callback(null, true);
      })
      .catch((error: unknown) => callback(error as Error, false));
  }
}
