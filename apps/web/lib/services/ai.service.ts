import { apiFetch } from "../api/client";
import type { EmailMessage } from "../api/types";

export interface AiThreadMessage {
  name: string;
  email: string;
  content: string;
}

export function toAiThreadMessage(message: EmailMessage): AiThreadMessage {
  const from = message.from[0];
  return {
    name: from?.name?.trim() || from?.address || "Unknown",
    email: from?.address ?? "unknown@example.com",
    content: message.bodyText ?? "",
  };
}

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  provider: string;
  model: string;
  usage: AiTokenUsage;
}

export async function summarize(
  subject: string,
  thread: AiThreadMessage[],
): Promise<SummarizeResult> {
  return apiFetch("/ai/summarize", {
    method: "POST",
    body: { subject, thread },
  });
}

export interface GenerateReplyResult {
  reply: string;
  provider: string;
  model: string;
  usage: AiTokenUsage;
}

export async function generateReply(
  subject: string,
  thread: AiThreadMessage[],
  instruction?: string,
): Promise<GenerateReplyResult> {
  return apiFetch("/ai/reply", {
    method: "POST",
    body: { subject, thread, instruction },
  });
}

export interface RewriteResult {
  text: string;
  provider: string;
  model: string;
  usage: AiTokenUsage;
}

export async function rewrite(
  draft: string,
  instruction?: string,
): Promise<RewriteResult> {
  return apiFetch("/ai/rewrite", {
    method: "POST",
    body: { draft, instruction },
  });
}

export interface ClassificationResult {
  category: string;
  priority: string;
  sentiment: string;
  spam: boolean;
}

export interface ClassifyResult {
  classification: ClassificationResult;
  provider: string;
  model: string;
  usage: AiTokenUsage;
}

export async function classify(
  subject: string,
  thread: AiThreadMessage[],
): Promise<ClassifyResult> {
  return apiFetch("/ai/classify", {
    method: "POST",
    body: { subject, thread },
  });
}
