import { apiFetch } from "../api/client";

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  provider: string;
  model: string;
  createdAt: string;
  chunkCount: number;
  /** True when this exact file was already uploaded and the existing
   * document was returned instead of being reprocessed. */
  duplicate?: boolean;
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunk[];
}

export interface DocumentChunkMatch {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  distance: number;
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/documents", {
    method: "POST",
    body: formData,
  });
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return apiFetch("/documents");
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  return apiFetch(`/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  return apiFetch(`/documents/${id}`, { method: "DELETE" });
}

export async function searchDocuments(
  query: string,
): Promise<DocumentChunkMatch[]> {
  return apiFetch(`/documents/search?q=${encodeURIComponent(query)}`);
}
