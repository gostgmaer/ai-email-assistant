"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { GoogleIcon, MicrosoftIcon } from "@/components/icons";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth/auth-context";
import {
  googleLoginUrl,
  microsoftLoginUrl,
} from "@/lib/services/auth.service";

function LoginContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/inbox");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            AI Email Assistant
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to manage your inbox
          </p>
        </div>

        {oauthFailed && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Sign-in failed. Please try again.
          </p>
        )}

        <div className="space-y-3">
          <a
            href={googleLoginUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <a
            href={microsoftLoginUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <MicrosoftIcon />
            Continue with Microsoft
          </a>
        </div>

        <p className="text-center text-xs text-zinc-400">
          No email/password login — sign in with an existing account.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginContent />
    </Suspense>
  );
}
