"use client";

import { clsx } from "clsx";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { ThreadListPane } from "@/components/inbox/ThreadListPane";
import { ThreadListSkeleton } from "@/components/inbox/ThreadListSkeleton";

export default function InboxLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Below lg, the list and reading pane can't fit side by side — show
  // exactly one, driven by whether a thread route is active
  // (/inbox/[threadId] vs the bare /inbox placeholder).
  const threadActive = pathname !== "/inbox";

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className={clsx("h-full", threadActive ? "hidden lg:block" : "block")}>
        <Suspense
          fallback={
            <div className="flex h-full w-full flex-col border-r border-zinc-200 bg-white lg:w-95 lg:shrink-0">
              <ThreadListSkeleton />
            </div>
          }
        >
          <ThreadListPane />
        </Suspense>
      </div>
      <div
        className={clsx(
          "h-full min-h-0 flex-1 overflow-hidden",
          threadActive ? "flex" : "hidden lg:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
