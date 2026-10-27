import { apiFetch } from "../api/client";
import type { Participant } from "../api/types";

export interface AskSource {
  /** The [n] the answer uses for this email. */
  n: number;
  messageId: string;
  threadId: string;
  subject: string | null;
  from: Participant[] | null;
  receivedAt: string;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  found: boolean;
  /** Only the emails the answer cites. */
  sources: AskSource[];
}

export interface AskIndexStatus {
  indexed: number;
  total: number;
}

/** "Ask your inbox": an answer from your own email, citing the emails it
 * used as [n]. */
export async function askInbox(question: string): Promise<AskResult> {
  return apiFetch<AskResult>("/ask", { method: "POST", body: { question } });
}

/** How much of your mail is searchable yet. */
export async function getAskStatus(): Promise<AskIndexStatus> {
  return apiFetch<AskIndexStatus>("/ask/status");
}
