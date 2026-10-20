const ACCESS_TOKEN_KEY = "ai-email-assistant:accessToken";
// Pre-migration key. Refresh tokens used to live in localStorage; they're
// now issued as an httpOnly cookie by the API, so this key is only kept
// around for clearTokens() to scrub any leftover value from before the
// migration (a stale plaintext refresh token sitting in localStorage
// indefinitely would be a needless credential-exposure risk).
const LEGACY_REFRESH_TOKEN_KEY = "ai-email-assistant:refreshToken";

export interface TokenPair {
  accessToken: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: subscribe to in-tab token changes. */
export function subscribeTokens(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setTokens(tokens: TokenPair): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  notify();
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  notify();
}
