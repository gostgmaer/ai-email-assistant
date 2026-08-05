"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/compose", label: "Compose" },
  { href: "/documents", label: "Documents" },
  { href: "/settings/email-accounts", label: "Accounts" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 sm:block">
      <p className="mb-4 px-3 text-lg font-semibold text-zinc-900">
        AI Email Assistant
      </p>
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-zinc-600 hover:bg-zinc-100",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
