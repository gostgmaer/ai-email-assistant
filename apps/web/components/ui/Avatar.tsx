import { clsx } from "clsx";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

// A small, fixed palette keeps avatars visually distinct per-sender without
// looking random — the same name always maps to the same color.
const PALETTE = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-600",
  "bg-fuchsia-500",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  label,
  size = "md",
  className,
}: {
  label: string;
  size?: Size;
  className?: string;
}) {
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        sizeClasses[size],
        colorFor(label || "?"),
        className,
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
