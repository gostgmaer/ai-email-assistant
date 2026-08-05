import { apiFetch } from "../api/client";

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  provider: string;
  model: string;
  createdAt: string;
  chunkCount: number;
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  content: string;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunk[];
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
