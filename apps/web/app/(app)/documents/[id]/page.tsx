"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import { deleteDocument, getDocument } from "@/lib/services/documents.service";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: document,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["document", params.id],
    queryFn: () => getDocument(params.id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(params.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push("/documents");
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isError) {
    return (
      <ErrorState
        message={
          error instanceof ApiError ? error.message : "Could not load document"
        }
      />
    );
  }
  if (!document) return null;

  return (
    
    <div className="mx-auto w-full  flex-1 space-y-6 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/documents" className="text-sm text-indigo-600 hover:underline">
            &larr; Documents
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-zinc-900">
            {document.filename}
          </h1>
          <p className="text-sm text-zinc-500">
            {document.contentType} · {document.provider}/{document.model} ·{" "}
            {new Date(document.createdAt).toLocaleString()}
          </p>
        </div>
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={deleteMutation.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${document.filename}"?`)) {
              deleteMutation.mutate();
            }
          }}
        >
          Delete
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Chunks ({document.chunks.length})
        </h2>
        {document.chunks.map((chunk) => {
          const badgeEntries = Object.entries(chunk.metadata).filter(
            ([key, value]) => key !== "source" && value,
          );

          return (
            <div
              key={chunk.id}
              className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-zinc-500">
                  Chunk {chunk.chunkIndex + 1}
                </p>
                {badgeEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                  >
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">
                {chunk.content}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
