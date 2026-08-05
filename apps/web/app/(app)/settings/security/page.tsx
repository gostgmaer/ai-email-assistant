"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { getRefreshToken } from "@/lib/auth/token-storage";
import { getSessions, revokeAllSessions, revokeSession } from "@/lib/services/auth.service";
import { changePassword } from "@/lib/services/users.service";
import { formatDateTime } from "@/lib/utils/format";

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SecurityPage() {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => reset(),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => getSessions(getRefreshToken() ?? undefined),
  });

  function invalidateSessions() {
    return queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => void invalidateSessions(),
  });

  const revokeAllMutation = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: () => void invalidateSessions(),
  });

  return (
    <div className="mx-auto w-full  flex-1 space-y-8 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Security</h1>
        <p className="text-sm text-zinc-500">
          Manage your password and active sessions.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Password</h2>
        <form
          onSubmit={handleSubmit((values) =>
            changePasswordMutation.mutate(values),
          )}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Current password (leave blank if you don&apos;t have one yet)
            </label>
            <input
              type="password"
              {...register("currentPassword")}
              className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              New password
            </label>
            <input
              type="password"
              {...register("newPassword")}
              className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-red-600">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          {changePasswordMutation.isError && (
            <p className="text-xs text-red-600">
              {changePasswordMutation.error instanceof ApiError
                ? changePasswordMutation.error.message
                : "Could not change password"}
            </p>
          )}
          {changePasswordMutation.isSuccess && (
            <p className="text-xs text-emerald-600">Password updated.</p>
          )}

          <Button type="submit" loading={changePasswordMutation.isPending}>
            Update password
          </Button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            Active sessions
          </h2>
          <Button
            variant="ghost"
            size="sm"
            loading={revokeAllMutation.isPending}
            onClick={() => revokeAllMutation.mutate()}
          >
            Sign out everywhere
          </Button>
        </div>

        {isLoading && <FullPageSpinner />}

        <div className="divide-y divide-zinc-100">
          {sessions?.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-900">
                  {session.deviceLabel ?? session.userAgent ?? "Unknown device"}
                  {session.isCurrent && (
                    <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {session.ipAddress ?? "Unknown IP"} ·{" "}
                  {formatDateTime(session.createdAt)}
                </p>
              </div>
              {!session.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={
                    revokeMutation.isPending &&
                    revokeMutation.variables === session.id
                  }
                  onClick={() => revokeMutation.mutate(session.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
