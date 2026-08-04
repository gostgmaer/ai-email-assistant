import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "../auth/token-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip attaching the Authorization header (e.g. for /auth/refresh itself). */
  skipAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    clearTokens();
    return false;
  }

  const tokens = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  setTokens(tokens);
  return true;
}

async function parseErrorMessage(response: Response): Promise<{
  message: string;
  details?: unknown;
}> {
  try {
    const json = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(json.message)
      ? json.message.join(", ")
      : (json.message ?? response.statusText);
    return { message, details: json };
  } catch {
    return { message: response.statusText || "Request failed" };
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const accessToken = getAccessToken();

    return fetch(`${API_URL}${path}`, {
      ...rest,
      // The API's ETags would otherwise make the browser send conditional
      // GETs; a 304 has no body and response.ok is false for it, which broke
      // auth checks on repeat navigations. TanStack Query is our cache layer.
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && !skipAuth
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await doFetch();

  if (response.status === 401 && !skipAuth && getRefreshToken()) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });

    const refreshed = await refreshPromise;

    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const { message, details } = await parseErrorMessage(response);
    throw new ApiError(response.status, message, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
