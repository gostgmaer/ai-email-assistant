import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<Map<string, unknown>>();

  run<T>(callback: () => T): T {
    return this.storage.run(new Map(), callback);
  }

  set<T>(key: string, value: T): void {
    this.storage.getStore()?.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.storage.getStore()?.get(key) as T | undefined;
  }
}
