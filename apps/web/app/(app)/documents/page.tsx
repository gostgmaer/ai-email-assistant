"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import { listDocuments, uploadDocument } from "@/lib/services/documents.service";

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    data: documents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 p-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Documents</h1>
        <p className="text-sm text-zinc-500">
          Upload a PDF, DOCX, TXT, or Markdown file to extract, chunk, and
          embed its text.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (selectedFile) uploadMutation.mutate(selectedFile);
          }}
          className="space-y-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
          />
          {uploadMutation.isError && (
            <p className="text-xs text-red-600">
              {uploadMutation.error instanceof ApiError
                ? uploadMutation.error.message
                : "Could not process the document"}
            </p>
          )}
          <Button
            type="submit"
            disabled={!selectedFile}
            loading={uploadMutation.isPending}
          >
            Process document
          </Button>
        </form>
      </section>

      {isLoading && <FullPageSpinner />}
      {isError && (
        <ErrorState
          message={
            error instanceof ApiError ? error.message : "Could not load documents"
          }
        />
      )}
      {documents && documents.length === 0 && (
        <EmptyState
          title="No documents yet"
          description="Processed documents will show up here."
        />
      )}
      {documents && documents.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {doc.filename}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"} ·{" "}
                    {doc.provider}/{doc.model} ·{" "}
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
