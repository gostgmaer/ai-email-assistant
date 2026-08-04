"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { listEmailAccounts } from "@/lib/services/email-accounts.service";
import { rewrite } from "@/lib/services/ai.service";
import {
  deleteDraft,
  getMessage,
  saveDraft,
  sendDraft,
  sendEmail,
  updateDraft,
} from "@/lib/services/email.service";
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
  const [rewriteLoading, setRewriteLoading] = useState(false);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });

  const { data: draftMessage, isLoading: draftLoading } = useQuery({
    queryKey: ["message", draftId],
    queryFn: () => getMessage(draftId!),
    enabled: Boolean(draftId),
  });

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: { accountId: "", to: "", cc: "", bcc: "", subject: "", body: "" },
  });

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
      const bodyHtml = `<p>${values.body.replace(/\n/g, "<br />")}</p>`;

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
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.push("/inbox");
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (values: ComposeFormValues) => {
      const bodyHtml = values.body ? `<p>${values.body.replace(/\n/g, "<br />")}</p>` : undefined;
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

  async function handleRewrite() {
    const body = getValues("body");
    if (!body.trim()) return;
    setRewriteLoading(true);
    setRewriteError(null);
    try {
      const result = await rewrite(body);
      setValue("body", result.text);
    } catch (error) {
      setRewriteError(error instanceof Error ? error.message : "Rewrite failed");
    } finally {
      setRewriteLoading(false);
    }
  }

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
    <div className="mx-auto w-full max-w-2xl flex-1 p-4">
      <h1 className="mb-4 text-lg font-semibold text-zinc-900">
        {draftId ? "Edit draft" : "New message"}
      </h1>

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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRewrite}
              loading={rewriteLoading}
            >
              Rewrite with AI
            </Button>
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
            <Button type="submit" loading={isSubmitting || sendMutation.isPending}>
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
