"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { resendVerification } from "@/lib/services/auth.service";
import {
  confirmEmailChange,
  deleteMe,
  requestEmailChange,
  updateMe,
} from "@/lib/services/users.service";

const profileSchema = z.object({
  displayName: z.string().max(120).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const emailSchema = z.object({
  newEmail: z.string().min(1, "Email is required").email("Enter a valid email"),
  currentPassword: z.string().optional(),
});

type EmailFormValues = z.infer<typeof emailSchema>;

function ProfileContent() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmToken = searchParams.get("confirmEmailToken");
  const confirmAttempted = useRef(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRequestSent, setEmailRequestSent] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user?.displayName ?? "" },
  });

  useEffect(() => {
    profileForm.reset({ displayName: user?.displayName ?? "" });
    // Only re-sync defaults when the loaded user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const updateProfileMutation = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: "", currentPassword: "" },
  });

  const requestEmailMutation = useMutation({
    mutationFn: requestEmailChange,
    onSuccess: () => setEmailRequestSent(true),
  });

  const confirmEmailMutation = useMutation({
    mutationFn: confirmEmailChange,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      router.replace("/settings/profile");
    },
  });

  useEffect(() => {
    if (confirmAttempted.current || !confirmToken) return;
    confirmAttempted.current = true;
    confirmEmailMutation.mutate(confirmToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmToken]);

  const resendMutation = useMutation({ mutationFn: resendVerification });

  const deleteMutation = useMutation({
    mutationFn: deleteMe,
    onSuccess: () => {
      void logout();
      router.replace("/login");
    },
  });

  return (
    <div className="mx-auto w-full  flex-1 space-y-8 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Profile</h1>
        <p className="text-sm text-zinc-500">
          Manage your name, avatar, and email address.
        </p>
      </div>

      {confirmToken && confirmEmailMutation.isPending && (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Confirming your new email address…
        </p>
      )}
      {confirmToken && confirmEmailMutation.isSuccess && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your email address has been updated.
        </p>
      )}
      {confirmToken && confirmEmailMutation.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          This confirmation link is invalid or has expired.
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Name</h2>
        <form
          onSubmit={profileForm.handleSubmit((values) =>
            updateProfileMutation.mutate(values),
          )}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Display name
            </label>
            <input
              {...profileForm.register("displayName")}
              className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" loading={updateProfileMutation.isPending}>
            Save
          </Button>
          {updateProfileMutation.isSuccess && (
            <span className="ml-3 text-xs text-emerald-600">Saved</span>
          )}
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Email</h2>
        <p className="text-sm text-zinc-700">{user?.email}</p>

        {!user?.emailVerifiedAt && (
          <div className="flex items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>Your email isn&apos;t verified yet.</span>
            <button
              type="button"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="font-medium underline disabled:opacity-50"
            >
              {resendMutation.isSuccess ? "Sent" : "Resend verification"}
            </button>
          </div>
        )}

        {!showEmailForm ? (
          <Button variant="secondary" onClick={() => setShowEmailForm(true)}>
            Change email
          </Button>
        ) : emailRequestSent ? (
          <p className="text-sm text-emerald-600">
            Check the new address for a confirmation link.
          </p>
        ) : (
          <form
            onSubmit={emailForm.handleSubmit((values) =>
              requestEmailMutation.mutate(values),
            )}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                New email
              </label>
              <input
                type="email"
                {...emailForm.register("newEmail")}
                className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              {emailForm.formState.errors.newEmail && (
                <p className="mt-1 text-xs text-red-600">
                  {emailForm.formState.errors.newEmail.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Current password
              </label>
              <input
                type="password"
                {...emailForm.register("currentPassword")}
                className="w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            {requestEmailMutation.isError && (
              <p className="text-xs text-red-600">
                {requestEmailMutation.error instanceof ApiError
                  ? requestEmailMutation.error.message
                  : "Could not start the email change"}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" loading={requestEmailMutation.isPending}>
                Send confirmation
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowEmailForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-red-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        <p className="text-sm text-zinc-500">
          Deleting your account disconnects all mailboxes and signs you out
          everywhere. This cannot be undone.
        </p>
        <Button
          variant="danger"
          loading={deleteMutation.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Delete your account? This cannot be undone.",
              )
            ) {
              deleteMutation.mutate();
            }
          }}
        >
          Delete account
        </Button>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ProfileContent />
    </Suspense>
  );
}
