"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EmailMessage } from "@/lib/api/types";
import { generateReply, rewrite } from "@/lib/services/ai.service";
import { replyToMessage } from "@/lib/services/email.service";

export function ReplyBox({
  threadId,
  lastMessage,
}: {
  threadId: string;
  lastMessage: EmailMessage;
}) {
  const [body, setBody] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<"reply" | "rewrite" | null>(null);
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () =>
      replyToMessage({
        messageId: lastMessage.id,
        bodyHtml: `<p>${body.replace(/\n/g, "<br />")}</p>`,
        bodyText: body,
      }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  async function handleAiReply() {
    setAiLoading("reply");
    setAiError(null);
    try {
      const context = lastMessage.bodyText || lastMessage.subject || "";
      const { reply } = await generateReply(context);
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
    <div className="border-t border-zinc-200 bg-white p-4">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        placeholder="Write a reply…"
        aria-label="Reply body"
        className="w-full resize-none rounded-md border border-zinc-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
      {replyMutation.isError && (
        <p className="mt-1 text-xs text-red-600">
          {replyMutation.error instanceof Error
            ? replyMutation.error.message
            : "Failed to send reply"}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAiReply}
            loading={aiLoading === "reply"}
          >
            AI Reply
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAiRewrite}
            loading={aiLoading === "rewrite"}
            disabled={!body.trim()}
          >
            Rewrite
          </Button>
        </div>
        <Button
          onClick={() => replyMutation.mutate()}
          loading={replyMutation.isPending}
          disabled={!body.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
