import Link from "next/link";

/** Shown for any URL the app doesn't have (and for notFound() calls). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-indigo-600">404</p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          This page doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/inbox"
          className="mt-5 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Back to your inbox
        </Link>
      </div>
    </div>
  );
}
