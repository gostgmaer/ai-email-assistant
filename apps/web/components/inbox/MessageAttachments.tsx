"use client";

import { useMutation } from "@tanstack/react-query";

import type { AttachmentSummary } from "@/lib/api/types";
import { downloadAttachment } from "@/lib/services/email.service";

import { formatFileSize } from "./AttachmentPicker";

/** A message's files; each downloads straight from the mailbox. */
export function MessageAttachments({
  attachments,
}: {
  attachments: AttachmentSummary[];
}) {
  const download = useMutation({
    mutationFn: (attachment: AttachmentSummary) =>
      downloadAttachment(attachment.id, attachment.filename),
  });

  if (attachments.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            type="button"
            onClick={() => download.mutate(attachment)}
            disabled={download.isPending && download.variables?.id === attachment.id}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 hover:bg-white disabled:opacity-50"
          >
            <span aria-hidden>📎</span>
            {attachment.filename}
            <span className="text-zinc-400">{formatFileSize(attachment.size)}</span>
          </button>
        ))}
      </div>
      {download.isError && (
        <p className="mt-1 text-xs text-red-600">
          {download.error instanceof Error
            ? download.error.message
            : "Couldn't download the file"}
        </p>
      )}
    </div>
  );
}
