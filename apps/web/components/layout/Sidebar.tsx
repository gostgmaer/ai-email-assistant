"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ApprovalIcon,
  DocumentIcon,
  HelpIcon,
  InboxIcon,
  PlusIcon,
  TaskIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/tasks", label: "Tasks", icon: TaskIcon },
  { href: "/approvals", label: "Approvals", icon: ApprovalIcon },
  { href: "/documents", label: "Documents", icon: DocumentIcon },
  { href: "/help", label: "Help", icon: HelpIcon },
];

const SETTINGS_ITEMS = [
  { href: "/settings/email-accounts", label: "Accounts" },
  { href: "/settings/calendar-accounts", label: "Calendars" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white sm:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          A
        </span>
        <span className="truncate text-sm font-semibold text-zinc-900">
          AI Email Assistant
        </span>
      </div>

      <div className="p-3">
        <Link
          href="/compose"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <PlusIcon className="h-4 w-4" />
          Compose
        </Link>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}

        <li className="pt-4">
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Settings
          </p>
          <ul className="space-y-0.5">
            {SETTINGS_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
