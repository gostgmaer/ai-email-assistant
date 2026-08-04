"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";

export function MessageBody({
  bodyHtml,
  bodyText,
}: {
  bodyHtml: string | null;
  bodyText: string | null;
}) {
  const sanitized = useMemo(() => {
    if (!bodyHtml) return null;

    return DOMPurify.sanitize(bodyHtml, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick"],
    });
  }, [bodyHtml]);

  if (sanitized) {
    return (
      <div
        className="prose prose-sm max-w-none break-words text-zinc-800"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm text-zinc-800">
      {bodyText || "(no content)"}
    </p>
  );
}
