import { apiFetch } from "../api/client";

export interface DocumentSummary {
  id: string;
  filename: string;
  contentType: string;
  /** Null until the AI service finishes processing (status PROCESSING/FAILED) — upload and processing are decoupled. */
  provider: string | null;
  model: string | null;
  title: string;
  category: string | null;
  tags: string[];
  status: "PROCESSING" | "INDEXED" | "FAILED";
  sourceType: string;
  documentType: string;
  fileSize: number;
  version: number;
  parser: string | null;
  splitter: string | null;
  chunkSize: number | null;
  chunkOverlap: number | null;
  embeddingDimension: number;
  pageCount: number | null;
  totalChunks: number;
  totalTokens: number;
  createdAt: string;
  indexedAt: string | null;
  chunkCount: number;
  /** True when this exact file was already uploaded and the existing
   * document was returned instead of being reprocessed. */
  duplicate?: boolean;
}

interface DocumentChunkFields {
  id: string;
  chunkIndex: number;
  content: string;
  contentHash: string | null;
  metadata: Record<string, unknown>;
  section: string | null;
  page: number | null;
  chunkType: string;
  tokenCount: number | null;
  wordCount: number | null;
  characterCount: number | null;
  startChar: number | null;
  endChar: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  parentChunkId: string | null;
  keywords: unknown[];
  entities: unknown[];
  importance: number | null;
  embeddingModel: string | null;
  embeddingDimension: number;
  embeddingVersion: number;
}

export type DocumentChunk = DocumentChunkFields;

export interface DocumentDetail extends DocumentSummary {
  description: string | null;
  summary: string | null;
  author: string | null;
  owner: string | null;
  language: string | null;
  sourceName: string | null;
  sourcePath: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  chunks: DocumentChunk[];
}

export interface DocumentChunkMatch extends DocumentChunkFields {
  documentId: string;
  filename: string;
  title: string;
  category: string | null;
  tags: string[];
  documentType: string;
  sourceType: string;
  distance: number;
}

export interface SearchFilters {
  category?: string;
  documentType?: string;
  sourceType?: string;
  chunkType?: string;
  tags?: string[];
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
  filters?: SearchFilters,
): Promise<DocumentChunkMatch[]> {
  const params = new URLSearchParams({ q: query });
  if (filters?.category) params.set("category", filters.category);
  if (filters?.documentType) params.set("documentType", filters.documentType);
  if (filters?.sourceType) params.set("sourceType", filters.sourceType);
  if (filters?.chunkType) params.set("chunkType", filters.chunkType);
  if (filters?.tags?.length) params.set("tags", filters.tags.join(","));

  return apiFetch(`/documents/search?${params.toString()}`);
}
