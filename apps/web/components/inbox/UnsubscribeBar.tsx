"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import {
  getUnsubscribeOptions,
  unsubscribeOneClick,
} from "@/lib/services/email.service";

/**
 * Unsubscribe on a newsletter thread. Every route needs a click the user
 * makes knowingly: one-click asks first (the server then tells the sender
 * on the user's behalf), a link opens the sender's page, and an email
 * request opens compose for the user to send.
 */
export function UnsubscribeBar({
  threadId,
  accountId,
}: {
  threadId: string;
  accountId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: options, isLoading } = useQuery({
    queryKey: ["unsubscribe-options", threadId],
    queryFn: () => getUnsubscribeOptions(threadId),
    enabled: open,
  });

  const oneClickMutation = useMutation({
    mutationFn: () => unsubscribeOneClick(threadId),
    onSuccess: () => setConfirming(false),
  });

  function emailRequest() {
    if (!options?.mailto) return;
    const params = new URLSearchParams({
      accountId,
      to: options.mailto.address,
      subject: options.mailto.subject ?? "Unsubscribe",
      body: options.mailto.body ?? "Please unsubscribe me from this list.",
    });
    router.push(`/compose?${params.toString()}`);
  }

  const hasAny = options?.oneClickUrl || options?.url || options?.mailto;

  return (
    <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600">
      <div className="flex flex-wrap items-center gap-2">
        <span>This looks like a newsletter.</span>
        {!open && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Unsubscribe…
          </Button>
        )}
        {open && isLoading && <span className="text-zinc-400">Checking…</span>}
        {open && options && !hasAny && (
          <span>
            The sender didn&apos;t include a way to unsubscribe. Look for a
            link at the bottom of the email.
          </span>
        )}
        {open &&
          options?.oneClickUrl &&
          !oneClickMutation.isSuccess &&
          (confirming ? (
            <>
              <span>Tell the sender to stop sending this?</span>
              <Button
                size="sm"
                loading={oneClickMutation.isPending}
                onClick={() => oneClickMutation.mutate()}
              >
                Yes, unsubscribe
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={oneClickMutation.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setConfirming(true)}>
              Unsubscribe in one click
            </Button>
          ))}
        {open && options?.url && !oneClickMutation.isSuccess && (
          <a
            href={options.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Open the sender&apos;s unsubscribe page
          </a>
        )}
        {open && options?.mailto && !oneClickMutation.isSuccess && (
          <button
            type="button"
            onClick={emailRequest}
            className="text-indigo-600 hover:underline"
          >
            Email an unsubscribe request
          </button>
        )}
        {oneClickMutation.isSuccess && (
          <span className="text-emerald-700">
            Unsubscribed. The sender may take a few days to stop.
          </span>
        )}
      </div>
      {oneClickMutation.isError && (
        <p className="mt-1 text-red-600">
          {oneClickMutation.error instanceof ApiError
            ? oneClickMutation.error.message
            : "Couldn't unsubscribe. Try the link instead."}
        </p>
      )}
    </div>
  );
}
