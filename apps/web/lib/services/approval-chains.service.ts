import { apiFetch } from "../api/client";
import type { ApprovalChain } from "../api/types";

export async function listMyPendingApprovals(): Promise<ApprovalChain[]> {
  return apiFetch<ApprovalChain[]>("/approval-chains/mine");
}

export async function getApprovalChainForDraft(
  draftMessageId: string,
): Promise<ApprovalChain | null> {
  return apiFetch<ApprovalChain | null>(
    `/approval-chains/by-draft/${draftMessageId}`,
  );
}

export async function approveChainStep(
  chainId: string,
  comment?: string,
): Promise<ApprovalChain> {
  return apiFetch<ApprovalChain>(`/approval-chains/${chainId}/approve`, {
    method: "POST",
    body: { comment },
  });
}

export async function rejectChainStep(
  chainId: string,
  comment?: string,
): Promise<ApprovalChain> {
  return apiFetch<ApprovalChain>(`/approval-chains/${chainId}/reject`, {
    method: "POST",
    body: { comment },
  });
}
