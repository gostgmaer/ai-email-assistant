import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  inviteAccountMember,
  listAccountMembers,
  removeAccountMember,
} from "@/lib/services/email-accounts.service";

export function MembersPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ["account-members", accountId],
    queryFn: () => listAccountMembers(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["account-members", accountId],
    });
  }

  const inviteMutation = useMutation({
    mutationFn: (inviteeEmail: string) =>
      inviteAccountMember(accountId, inviteeEmail),
    onSuccess: () => {
      setEmail("");
      void invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeAccountMember(accountId, userId),
    onSuccess: () => void invalidate(),
  });

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Everyone listed here can view and reply from this account&apos;s
        shared inbox.
        {isOwner
          ? " Invite an existing user by the email they signed up with."
          : " Only the owner can invite or remove people."}
      </p>

      {isOwner && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) inviteMutation.mutate(email.trim());
          }}
        >
          <input
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <Button type="submit" size="sm" loading={inviteMutation.isPending}>
            Invite
          </Button>
        </form>
      )}

      {inviteMutation.isError && (
        <p className="mb-2 text-xs text-red-600">
          {inviteMutation.error instanceof Error
            ? inviteMutation.error.message
            : "Could not invite that user"}
        </p>
      )}

      {isLoading && <p className="text-xs text-zinc-400">Loading members…</p>}

      <ul className="divide-y divide-zinc-100">
        {members?.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-900">
                {member.user.displayName ?? member.user.email}
              </p>
              <p className="text-xs text-zinc-500">
                {member.user.email} ·{" "}
                {member.role === "OWNER" ? "Owner" : "Member"}
              </p>
            </div>
            {isOwner && member.role !== "OWNER" && (
              <Button
                variant="ghost"
                size="sm"
                loading={
                  removeMutation.isPending &&
                  removeMutation.variables === member.userId
                }
                onClick={() => removeMutation.mutate(member.userId)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
