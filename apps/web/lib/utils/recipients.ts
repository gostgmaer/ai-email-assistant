import type { RecipientInput } from "@/lib/services/email.service";
import type { Participant } from "@/lib/api/types";

/** Parses a comma-separated list of addresses into recipient objects. */
export function parseRecipients(value: string): RecipientInput[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

export function recipientsToInputValue(list: Participant[]): string {
  return list.map((participant) => participant.address).join(", ");
}
