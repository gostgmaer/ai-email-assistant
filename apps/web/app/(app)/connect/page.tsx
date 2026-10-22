"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { FullPageSpinner } from "@/components/ui/Spinner";
import { startConnect } from "@/lib/connect";

/** Starts a Connect (OAuth) flow: gets a short-lived ticket, then sends
 * the browser on to Google, Microsoft, Slack… (see lib/connect.ts). */
function ConnectContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startConnect(new URLSearchParams(searchParams.toString())).catch(
      (err: unknown) => {
        setError(err instanceof Error ? err.message : "Couldn't start connecting");
      },
    );
  }, [searchParams]);

  if (!error) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div>
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/settings/email-accounts" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
          Back to settings
        </Link>
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ConnectContent />
    </Suspense>
  );
}
