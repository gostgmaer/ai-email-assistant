import type { Participant } from "../api/types";

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMin = (now.getTime() - date.getTime()) / 60_000;

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const diffDay = diffMin / 60 / 24;
  if (diffDay < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function participantLabel(participant: Participant): string {
  return participant.name?.trim() || participant.address;
}

export function participantListLabel(list: Participant[]): string {
  return list.map(participantLabel).join(", ");
}
