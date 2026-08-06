"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import {
  deleteDocument,
  listDocuments,
  searchDocuments,
  uploadDocument,
} from "@/lib/services/documents.service";

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("");

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

  const searchMutation = useMutation({
    mutationFn: (vars: { query: string; category?: string; documentType?: string }) =>
      searchDocuments(vars.query, {
        category: vars.category || undefined,
        documentType: vars.documentType || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  return (
    <div className="mx-auto w-full  flex-1 space-y-8 p-4">
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
          {uploadMutation.isSuccess && uploadMutation.data.duplicate && (
            <p className="text-xs text-amber-600">
              This file was already uploaded — showing the existing document.
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

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Search</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              searchMutation.mutate({
                query: searchQuery.trim(),
                category: categoryFilter.trim(),
                documentType: documentTypeFilter.trim(),
              });
            }
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask something covered by your documents…"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <Button
              type="submit"
              disabled={!searchQuery.trim()}
              loading={searchMutation.isPending}
            >
              Search
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Filter by category (optional)"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
            />
            <input
              value={documentTypeFilter}
              onChange={(e) => setDocumentTypeFilter(e.target.value)}
              placeholder="Filter by file type, e.g. pdf (optional)"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs"
            />
          </div>
        </form>
        {searchMutation.isError && (
          <p className="text-xs text-red-600">
            {searchMutation.error instanceof ApiError
              ? searchMutation.error.message
              : "Could not search documents"}
          </p>
        )}
        {searchMutation.isSuccess && searchMutation.data.length === 0 && (
          <p className="text-sm text-zinc-500">No matching chunks found.</p>
        )}
        {searchMutation.isSuccess && searchMutation.data.length > 0 && (
          <ul className="space-y-2">
            {searchMutation.data.map((match) => (
              <li
                key={match.id}
                className="rounded-md border border-zinc-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/documents/${match.documentId}`}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    {match.filename}
                  </Link>
                  <span className="text-xs text-zinc-400">
                    chunk {match.chunkIndex + 1} · distance{" "}
                    {match.distance.toFixed(3)}
                  </span>
                  {match.section && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {match.section}
                    </span>
                  )}
                  {match.page != null && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      page {match.page}
                    </span>
                  )}
                  {match.category && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                      {match.category}
                    </span>
                  )}
                  {match.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-700">
                  {match.content}
                </p>
              </li>
            ))}
          </ul>
        )}
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
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50"
            >
              <Link href={`/documents/${doc.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {doc.filename}
                  </p>
                  {doc.status !== "INDEXED" && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        doc.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {doc.status.toLowerCase()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"} ·{" "}
                  {doc.documentType.toUpperCase()} ·{" "}
                  {doc.provider}/{doc.model} ·{" "}
                  {new Date(doc.createdAt).toLocaleString()}
                </p>
              </Link>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={
                  deleteMutation.isPending &&
                  deleteMutation.variables === doc.id
                }
                onClick={() => {
                  if (window.confirm(`Delete "${doc.filename}"?`)) {
                    deleteMutation.mutate(doc.id);
                  }
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
