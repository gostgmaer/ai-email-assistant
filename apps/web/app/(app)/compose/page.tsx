"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { AttachmentPicker, RemindSelect } from "@/components/inbox/AttachmentPicker";
import { RewriteMenu } from "@/components/inbox/RewriteMenu";
import { Button } from "@/components/ui/Button";
import type { AttachmentInput } from "@/lib/api/types";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { getApprovalChainForDraft } from "@/lib/services/approval-chains.service";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import {
  deleteDraft,
  getMessage,
  saveDraft,
  sendDraft,
  sendEmail,
  updateDraft,
} from "@/lib/services/email.service";
import { formatDateTime, participantListLabel } from "@/lib/utils/format";
import { textToSafeHtml } from "@/lib/utils/html";
import { parseRecipients, recipientsToInputValue } from "@/lib/utils/recipients";

const composeSchema = z.object({
  accountId: z.string().min(1, "Select an account to send from"),
  to: z.string().min(1, "At least one recipient is required"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message body is required"),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

function ComposeContent() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [remindDays, setRemindDays] = useState<number | undefined>();

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });

  const { data: draftMessage, isLoading: draftLoading } = useQuery({
    queryKey: ["message", draftId],
    queryFn: () => getMessage(draftId!),
    enabled: Boolean(draftId),
  });

  // A draft answering a synced message (every AI-held reply) is shown
  // with that message, so the reviewer edits it against what it replies to.
  const inReplyToMessageId = draftMessage?.inReplyToMessageId ?? null;
  const { data: originalMessage } = useQuery({
    queryKey: ["message", inReplyToMessageId],
    queryFn: () => getMessage(inReplyToMessageId!),
    enabled: Boolean(inReplyToMessageId),
  });

  // True multi-step Approval Chains (v3.0) — null for a draft that isn't
  // gated by one, which is the common case.
  const { data: approvalChain } = useQuery({
    queryKey: ["approval-chain", draftId],
    queryFn: () => getApprovalChainForDraft(draftId!),
    enabled: Boolean(draftId),
  });

  // REJECTED does not block sending — see ComposeService.sendDraft's
  // comment: rejection just returns manual control, same as today's
  // default hold-for-review outcome, not a permanent lock.
  const sendBlockedByChain = approvalChain?.status === "PENDING";

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: { accountId: "", to: "", cc: "", bcc: "", subject: "", body: "" },
  });
  const body = useWatch({ control, name: "body" });

  useEffect(() => {
    if (!draftMessage) return;
    reset({
      accountId: draftMessage.thread.folder.accountId,
      to: recipientsToInputValue(draftMessage.to),
      cc: recipientsToInputValue(draftMessage.cc),
      bcc: recipientsToInputValue(draftMessage.bcc),
      subject: draftMessage.subject ?? "",
      body: draftMessage.bodyText ?? "",
    });
  }, [draftMessage, reset]);

  useEffect(() => {
    if (!draftId && accounts && accounts.length > 0 && !getValues("accountId")) {
      const primary = accounts.find((account) => account.isPrimary) ?? accounts[0];
      setValue("accountId", primary.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, draftId]);

  const sendMutation = useMutation({
    mutationFn: async (values: ComposeFormValues) => {
      const bodyHtml = textToSafeHtml(values.body);

      if (draftId) {
        return sendDraft(draftId);
      }

      return sendEmail({
        accountId: values.accountId,
        to: parseRecipients(values.to),
        cc: values.cc ? parseRecipients(values.cc) : undefined,
        bcc: values.bcc ? parseRecipients(values.bcc) : undefined,
        subject: values.subject,
        bodyHtml,
        bodyText: values.body,
        attachments: attachments.length > 0 ? attachments : undefined,
        remindIfNoReplyDays: remindDays,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push("/inbox");
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (values: ComposeFormValues) => {
      const bodyHtml = values.body ? textToSafeHtml(values.body) : undefined;
      const payload = {
        to: values.to ? parseRecipients(values.to) : undefined,
        cc: values.cc ? parseRecipients(values.cc) : undefined,
        bcc: values.bcc ? parseRecipients(values.bcc) : undefined,
        subject: values.subject || undefined,
        bodyHtml,
        bodyText: values.body || undefined,
      };

      if (draftId) {
        return updateDraft(draftId, payload);
      }

      return saveDraft({ accountId: values.accountId, ...payload });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push("/inbox?folderType=DRAFTS");
    },
  });

  const discardDraftMutation = useMutation({
    mutationFn: () => deleteDraft(draftId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push("/inbox?folderType=DRAFTS");
    },
  });

  if (accountsLoading || (draftId && draftLoading)) return <FullPageSpinner />;

  if (!accounts?.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-zinc-500">
          Connect an email account before composing a message.
        </p>
      </div>
    );
  }

  const onSubmit = (values: ComposeFormValues) => sendMutation.mutate(values);

  return (
    <div className="mx-auto w-full  flex-1 p-4">
      <h1 className="mb-4 text-lg font-semibold text-zinc-900">
        {draftId ? "Edit draft" : "New message"}
      </h1>

      {approvalChain && approvalChain.status !== "APPROVED" && (
        <p
          className={
            "mb-4 rounded-md px-3 py-2 text-sm " +
            (approvalChain.status === "REJECTED"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700")
          }
        >
          {approvalChain.status === "REJECTED"
            ? "This draft was rejected by an approval chain — edit it below, then it can be sent directly."
            : approvalChain.status === "EXPIRED"
            ? "This draft's approval chain expired before everyone signed off — review it and send it yourself if it's ready."
            : approvalChain.status === "CANCELLED"
            ? "This draft's approval chain was cancelled."
            : `Awaiting approval (step ${
                approvalChain.steps.findIndex((s) => s.status === "PENDING") + 1
              } of ${approvalChain.steps.length}: ${
                approvalChain.steps.find((s) => s.status === "PENDING")?.approver
                  .displayName ??
                approvalChain.steps.find((s) => s.status === "PENDING")?.approver
                  .email
              }) — it can't be sent until every step approves. See the Approvals page.`}
        </p>
      )}

      {originalMessage && (
        <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              Replying to{" "}
              <span className="font-medium text-zinc-700">
                {participantListLabel(originalMessage.from)}
              </span>{" "}
              · {formatDateTime(originalMessage.receivedAt)}
            </span>
            <Link
              href={`/inbox/${originalMessage.threadId}`}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Open conversation
            </Link>
          </div>
          <p className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap text-zinc-700">
            {originalMessage.bodyText ?? "(no text content)"}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            From
          </label>
          <select
            {...register("accountId")}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            disabled={Boolean(draftId)}
          >
            <option value="" disabled>
              Select an account
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p className="mt-1 text-xs text-red-600">{errors.accountId.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">To</label>
          <input
            {...register("to")}
            placeholder="name@example.com, another@example.com"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.to && <p className="mt-1 text-xs text-red-600">{errors.to.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Cc</label>
            <input
              {...register("cc")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Bcc</label>
            <input
              {...register("bcc")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Subject
          </label>
          <input
            {...register("subject")}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.subject && (
            <p className="mt-1 text-xs text-red-600">{errors.subject.message}</p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-zinc-600">
              Message
            </label>
            <RewriteMenu
              text={body}
              onChange={(text) =>
                setValue("body", text, { shouldDirty: true, shouldValidate: true })
              }
              onError={setRewriteError}
            />
          </div>
          <textarea
            {...register("body")}
            rows={10}
            className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.body && (
            <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>
          )}
          {rewriteError && (
            <p className="mt-1 text-xs text-red-600">{rewriteError}</p>
          )}
        </div>

        {/* Saved drafts can't hold files yet, so attachments and the
            reminder are only offered when sending a new message. */}
        {!draftId && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AttachmentPicker value={attachments} onChange={setAttachments} />
            <RemindSelect value={remindDays} onChange={setRemindDays} />
          </div>
        )}

        {sendMutation.isError && (
          <p className="text-sm text-red-600">
            {sendMutation.error instanceof Error
              ? sendMutation.error.message
              : "Failed to send"}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            {draftId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => discardDraftMutation.mutate()}
                loading={discardDraftMutation.isPending}
              >
                Discard draft
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSubmit((values) => saveDraftMutation.mutate(values))}
              loading={saveDraftMutation.isPending}
            >
              Save draft
            </Button>
            <Button
              type="submit"
              loading={isSubmitting || sendMutation.isPending}
              disabled={sendBlockedByChain}
            >
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ComposeContent />
    </Suspense>
  );
}
