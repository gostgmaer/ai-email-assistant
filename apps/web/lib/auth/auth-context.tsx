"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { User } from "../api/types";
import { logout as logoutRequest } from "../services/auth.service";
import { getMe } from "../services/users.service";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  subscribeTokens,
  type TokenPair,
} from "./token-storage";

interface AuthContextValue {
  user: User | null | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tokens: TokenPair) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getServerSnapshot(): string | null {
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accessToken = useSyncExternalStore(
    subscribeTokens,
    getAccessToken,
    getServerSnapshot,
  );

  // useSyncExternalStore's server snapshot is always null (localStorage
  // doesn't exist on the server) and React reuses that same value for the
  // first client render too, to avoid a hydration mismatch. Without this
  // flag, a hard page load of an already-logged-in user briefly evaluates
  // as logged out, and the route guards below would bounce them through
  // /login before the real token value syncs in on the next tick.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // The standard "has hydration completed" flag: there is no way to derive
    // this during render, since it is by definition about reconciling with
    // the browser environment rather than React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  const hasToken = hydrated && accessToken !== null;

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    if (isError) {
      clearTokens();
    }
  }, [isError]);

  const login = useCallback(
    (tokens: TokenPair) => {
      setTokens(tokens);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    clearTokens();
    queryClient.clear();

    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // best effort — tokens are already cleared locally
      }
    }
  }, [queryClient]);

  const value: AuthContextValue = {
    user: hasToken ? user : null,
    isAuthenticated: hasToken && Boolean(user),
    isLoading: !hydrated || (hasToken && isLoading),
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
