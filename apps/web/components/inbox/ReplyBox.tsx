"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SendIcon, SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { AttachmentInput, EmailMessage } from "@/lib/api/types";
import { generateReply, rewrite, toAiThreadMessage } from "@/lib/services/ai.service";
import { replyToMessage } from "@/lib/services/email.service";
import { textToSafeHtml } from "@/lib/utils/html";

import { AttachmentPicker, RemindSelect } from "./AttachmentPicker";

export function ReplyBox({
  threadId,
  subject,
  messages,
  lastMessage,
}: {
  threadId: string;
  subject: string;
  messages: EmailMessage[];
  lastMessage: EmailMessage;
}) {
  const [body, setBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [remindDays, setRemindDays] = useState<number | undefined>();
  // Reply-all only matters when someone besides the user was on it.
  const hasOtherRecipients =
    (lastMessage.to?.length ?? 0) + (lastMessage.cc?.length ?? 0) > 1;
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<"reply" | "rewrite" | null>(null);
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () =>
      replyToMessage({
        messageId: lastMessage.id,
        bodyHtml: textToSafeHtml(body),
        bodyText: body,
        replyAll: hasOtherRecipients && replyAll,
        attachments: attachments.length > 0 ? attachments : undefined,
        remindIfNoReplyDays: remindDays,
      }),
    onSuccess: () => {
      setBody("");
      setAttachments([]);
      setRemindDays(undefined);
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  async function handleAiReply() {
    setAiLoading("reply");
    setAiError(null);
    try {
      const { reply } = await generateReply(
        subject,
        messages.map(toAiThreadMessage),
      );
      setBody(reply);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI reply failed");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleAiRewrite() {
    if (!body.trim()) return;
    setAiLoading("rewrite");
    setAiError(null);
    try {
      const { text } = await rewrite(body);
      setBody(text);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI rewrite failed");
    } finally {
      setAiLoading(null);
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white p-4">
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder="Write a reply…"
          aria-label="Reply body"
          className="w-full resize-none rounded-t-xl p-3 text-sm focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
          <AttachmentPicker value={attachments} onChange={setAttachments} />
          <RemindSelect value={remindDays} onChange={setRemindDays} />
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAiReply}
              loading={aiLoading === "reply"}
            >
              <SparklesIcon className="h-4 w-4" />
              AI Reply
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAiRewrite}
              loading={aiLoading === "rewrite"}
              disabled={!body.trim()}
            >
              Rewrite
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {hasOtherRecipients && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={replyAll}
                  onChange={(event) => setReplyAll(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300"
                />
                Reply all
              </label>
            )}
            <Button
              onClick={() => replyMutation.mutate()}
              loading={replyMutation.isPending}
              disabled={!body.trim()}
            >
              <SendIcon className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>

      {aiError && <p className="mt-1.5 text-xs text-red-600">{aiError}</p>}
      {replyMutation.isError && (
        <p className="mt-1.5 text-xs text-red-600">
          {replyMutation.error instanceof Error
            ? replyMutation.error.message
            : "Failed to send reply"}
        </p>
      )}
    </div>
  );
}
