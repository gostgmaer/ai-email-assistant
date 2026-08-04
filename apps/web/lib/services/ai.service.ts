import { apiFetch } from "../api/client";

export async function summarize(text: string): Promise<{ summary: string }> {
  return apiFetch("/ai/summarize", { method: "POST", body: { text } });
}

export async function generateReply(
  threadContext: string,
  instructions?: string,
): Promise<{ reply: string }> {
  return apiFetch("/ai/reply", {
    method: "POST",
    body: { threadContext, instructions },
  });
}

export async function rewrite(
  text: string,
  instructions?: string,
): Promise<{ text: string }> {
  return apiFetch("/ai/rewrite", {
    method: "POST",
    body: { text, instructions },
  });
}

export async function classify(
  text: string,
): Promise<{ category: string; confidence?: number }> {
  return apiFetch("/ai/classify", { method: "POST", body: { text } });
}
