"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { FullPageSpinner } from "@/components/ui/Spinner";
import { verifyEmail } from "@/lib/services/auth.service";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const attempted = useRef(false);

  const mutation = useMutation({
    mutationFn: (t: string) => verifyEmail(t),
  });

  useEffect(() => {
    if (attempted.current || !token) return;
    attempted.current = true;
    mutation.mutate(token);
    // mutation is stable across renders (from useMutation); only re-run on token change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">
          Email verification
        </h1>

        {!token && (
          <p className="text-sm text-red-600">This verification link is invalid.</p>
        )}
        {token && mutation.isPending && (
          <p className="text-sm text-zinc-500">Verifying your email…</p>
        )}
        {token && mutation.isSuccess && (
          <p className="text-sm text-green-700">
            Your email is verified.
          </p>
        )}
        {token && mutation.isError && (
          <p className="text-sm text-red-600">
            This link is invalid or has expired.
          </p>
        )}

        <Link href="/inbox" className="block text-sm text-indigo-600 hover:underline">
          Go to inbox
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
