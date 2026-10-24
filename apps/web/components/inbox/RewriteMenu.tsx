"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { rewrite, type RewriteStyle } from "@/lib/services/ai.service";

const OPTIONS: { value: RewriteStyle | "improve"; label: string }[] = [
  { value: "improve", label: "Improve writing" },
  { value: "shorter", label: "Make shorter" },
  { value: "formal", label: "More formal" },
  { value: "friendly", label: "Friendlier" },
  { value: "grammar", label: "Fix grammar only" },
];

/**
 * "Rewrite…" picker for a message body, shared by the reply box and the
 * compose page. Offers Undo until the rewritten text is edited, so a
 * rewrite the user doesn't like costs one click.
 */
export function RewriteMenu({
  text,
  onChange,
  onError,
}: {
  text: string;
  onChange: (text: string) => void;
  onError: (message: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  // The text before the last rewrite, and what that rewrite produced. Undo
  // is offered only while the body still holds the rewrite unchanged.
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(
    null,
  );

  async function handleSelect(value: string) {
    if (!value || !text.trim()) return;
    setLoading(true);
    onError(null);
    try {
      const style = value === "improve" ? undefined : (value as RewriteStyle);
      const result = await rewrite(text, style);
      setUndo({ before: text, after: result.text });
      onChange(result.text);
    } catch (error) {
      onError(error instanceof Error ? error.message : "AI rewrite failed");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <span className="flex items-center gap-1.5 px-2 text-xs text-zinc-500">
        <Spinner className="h-3.5 w-3.5" />
        Rewriting…
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <select
        value=""
        disabled={!text.trim()}
        onChange={(event) => void handleSelect(event.target.value)}
        aria-label="Rewrite with AI"
        className="rounded-md border border-transparent bg-transparent py-1 pr-6 pl-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">Rewrite…</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {undo && undo.after === text && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(undo.before);
            setUndo(null);
          }}
        >
          Undo
        </Button>
      )}
    </span>
  );
}
