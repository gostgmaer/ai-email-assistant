"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/lib/auth/auth-context";

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    router.push(`/inbox?q=${encodeURIComponent(search)}`);
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const initial = (user?.displayName ?? user?.email ?? "?")
    .slice(0, 1)
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
      <form onSubmit={handleSearchSubmit} className="max-w-md flex-1">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search email…"
          aria-label="Search email"
          className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </form>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full text-sm"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">
              {initial}
            </span>
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                <div className="border-b border-zinc-100 px-3 py-2">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {user?.displayName ?? "Account"}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {user?.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
