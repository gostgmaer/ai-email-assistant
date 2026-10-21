"use client";

import { useRef, useState } from "react";

import type { AttachmentInput } from "@/lib/api/types";

/** The API's per-message limit (MAX_ATTACHMENT_BYTES). */
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<type>;base64," prefix.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

function decodedSize(attachment: AttachmentInput): number {
  return Math.floor((attachment.contentBase64.length * 3) / 4);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Pick files to send with a message (3 MB in total). */
export function AttachmentPicker({
  value,
  onChange,
}: {
  value: AttachmentInput[];
  onChange: (next: AttachmentInput[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added: AttachmentInput[] = [];
    for (const file of Array.from(files)) {
      added.push({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64: await readAsBase64(file),
      });
    }
    const next = [...value, ...added];
    const total = next.reduce((sum, a) => sum + decodedSize(a), 0);
    if (total > MAX_TOTAL_BYTES) {
      setError("Attachments can total at most 3 MB per message.");
      return;
    }
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((attachment, i) => (
          <span
            key={`${attachment.filename}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
          >
            {attachment.filename} · {formatFileSize(decodedSize(attachment))}
            <button
              type="button"
              aria-label={`Remove ${attachment.filename}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-zinc-400 hover:text-red-600"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-indigo-600 hover:underline"
        >
          + Attach files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** "Remind me if nobody replies" — a follow-up task and notification. */
export function RemindSelect({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (days: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
      Remind me if no reply in
      <select
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : undefined)
        }
        className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs"
      >
        <option value="">—</option>
        {[1, 2, 3, 5, 7, 14].map((days) => (
          <option key={days} value={days}>
            {days} day{days === 1 ? "" : "s"}
          </option>
        ))}
      </select>
    </label>
  );
}
