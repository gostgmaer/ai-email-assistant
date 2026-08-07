"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { GoogleIcon, MicrosoftIcon } from "@/components/icons";
import { ConnectImapForm } from "@/components/settings/ConnectImapForm";
import { EmailAccountCard } from "@/components/settings/EmailAccountCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  connectGoogleUrl,
  connectMicrosoftUrl,
  disconnectEmailAccount,
  listEmailAccounts,
  triggerSync,
  updateEmailAccount,
} from "@/lib/services/email-accounts.service";

function EmailAccountsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const queryClient = useQueryClient();
  const [showImapForm, setShowImapForm] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["email-accounts"],
    queryFn: listEmailAccounts,
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateEmailAccount>[1] }) =>
      updateEmailAccount(id, data),
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => {
      setPendingId(null);
      void invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectEmailAccount,
    onMutate: (id) => setPendingId(id),
    onSettled: () => {
      setPendingId(null);
      void invalidate();
    },
  });

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onMutate: (id) => setPendingId(id),
    onSettled: () => {
      setPendingId(null);
      void invalidate();
    },
  });

  return (
    <div className="mx-auto w-full  flex-1 space-y-6 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">
          Connected email accounts
        </h1>
        <p className="text-sm text-zinc-500">
          Connect Gmail, Outlook, or any IMAP mailbox to sync it into your unified inbox.
        </p>
      </div>

      {connected && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Connected {connected} — the initial sync is running in the background.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={connectGoogleUrl()}
          className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <GoogleIcon /> Connect Gmail
        </a>
        <a
          href={connectMicrosoftUrl()}
          className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          <MicrosoftIcon /> Connect Outlook
        </a>
        <Button variant="secondary" onClick={() => setShowImapForm((v) => !v)}>
          Connect IMAP
        </Button>
      </div>

      {showImapForm && <ConnectImapForm onDone={() => setShowImapForm(false)} />}

      {isLoading && <FullPageSpinner />}

      {!isLoading && accounts?.length === 0 && (
        <EmptyState
          title="No accounts connected yet"
          description="Connect a mailbox above to start syncing email."
        />
      )}

      <div className="space-y-3">
        {accounts?.map((account) => (
          <EmailAccountCard
            key={account.id}
            account={account}
            busy={pendingId === account.id}
            onMakePrimary={() =>
              updateMutation.mutate({ id: account.id, data: { isPrimary: true } })
            }
            onToggleSync={() =>
              updateMutation.mutate({
                id: account.id,
                data: { syncEnabled: !account.syncEnabled },
              })
            }
            onUpdateFilters={(filters) =>
              updateMutation.mutate({
                id: account.id,
                data: filters,
              })
            }
            onUpdateAutoScheduleMeetings={(autoScheduleMeetings) =>
              updateMutation.mutate({
                id: account.id,
                data: { autoScheduleMeetings },
              })
            }
            onSyncNow={() => syncMutation.mutate(account.id)}
            onDisconnect={() => {
              if (window.confirm(`Disconnect ${account.email}?`)) {
                disconnectMutation.mutate(account.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function EmailAccountsPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <EmailAccountsContent />
    </Suspense>
  );
}
