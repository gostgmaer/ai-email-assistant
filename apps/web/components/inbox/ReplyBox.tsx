"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { SendIcon, SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import type { AttachmentInput, EmailMessage } from "@/lib/api/types";
import { generateReply, toAiThreadMessage } from "@/lib/services/ai.service";
import { replyToMessage } from "@/lib/services/email.service";
import { textToSafeHtml } from "@/lib/utils/html";

import { AttachmentPicker, RemindSelect } from "./AttachmentPicker";
import { RewriteMenu } from "./RewriteMenu";

// Sent with the thread when the user's own message is the newest one, so
// the AI writes a nudge instead of answering the user's own email.
const FOLLOW_UP_INSTRUCTION =
  "The last message in this thread is mine and nobody has answered it yet. " +
  "Write a short, polite follow-up to the people I wrote to: remind them in " +
  "one line what I asked and ask whether they have had a chance to look at " +
  "it. Don't repeat my whole message, don't apologise for following up, and " +
  "don't say that anything has been sent, attached or done.";

export function ReplyBox({
  threadId,
  accountId,
  subject,
  messages,
  lastMessage,
  waitingForReply = false,
  autoDraftFollowUp = false,
}: {
  threadId: string;
  /** The thread's account: AI replies and rewrites use its writing style. */
  accountId: string;
  subject: string;
  messages: EmailMessage[];
  lastMessage: EmailMessage;
  /** The newest message is the user's own: the AI button drafts a nudge. */
  waitingForReply?: boolean;
  /** Start drafting the nudge on load (the Waiting view's link). */
  autoDraftFollowUp?: boolean;
}) {
  const [body, setBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [remindDays, setRemindDays] = useState<number | undefined>();
  // Reply-all only matters when someone besides the user was on it.
  const hasOtherRecipients =
    (lastMessage.to?.length ?? 0) + (lastMessage.cc?.length ?? 0) > 1;
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiClaims, setAiClaims] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
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
      setAiClaims([]);
      setAttachments([]);
      setRemindDays(undefined);
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  async function handleAiReply() {
    setAiLoading(true);
    setAiError(null);
    setAiClaims([]);
    try {
      const { reply, unsupportedClaims } = await generateReply(
        subject,
        messages.map(toAiThreadMessage),
        waitingForReply ? FOLLOW_UP_INSTRUCTION : undefined,
        accountId,
      );
      setBody(reply);
      setAiClaims(unsupportedClaims ?? []);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI reply failed");
    } finally {
      setAiLoading(false);
    }
  }

  const startFollowUpDraft = useEffectEvent(() => void handleAiReply());
  const autoDraftStarted = useRef(false);
  useEffect(() => {
    if (!autoDraftFollowUp || !waitingForReply || autoDraftStarted.current) {
      return;
    }
    autoDraftStarted.current = true;
    // Drop ?followUp=1 so a reload doesn't redraft over the user's edits.
    window.history.replaceState(null, "", window.location.pathname);
    startFollowUpDraft();
  }, [autoDraftFollowUp, waitingForReply]);

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
              loading={aiLoading}
            >
              <SparklesIcon className="h-4 w-4" />
              {waitingForReply ? "Draft follow-up" : "AI Reply"}
            </Button>
            <RewriteMenu
              text={body}
              onChange={setBody}
              onError={setAiError}
              accountId={accountId}
            />
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

      {aiClaims.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200 ring-inset">
          <p className="font-medium">
            Check before sending — the AI can&apos;t attach files or complete
            tasks for you:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {aiClaims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
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
