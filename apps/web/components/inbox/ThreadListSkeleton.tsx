export function ThreadListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="h-3 animate-pulse rounded bg-zinc-200"
              style={{ width: `${55 + ((i * 13) % 30)}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-zinc-100"
              style={{ width: `${70 + ((i * 7) % 20)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
