import { apiFetch } from "../api/client";
import type { Contact } from "../api/types";

export async function listContacts(accountId: string): Promise<Contact[]> {
  return apiFetch<Contact[]>(`/email-accounts/${accountId}/contacts`);
}

export interface ContactInput {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  status?: string;
}

export async function createContact(
  accountId: string,
  data: ContactInput,
): Promise<Contact> {
  return apiFetch<Contact>(`/email-accounts/${accountId}/contacts`, {
    method: "POST",
    body: data,
  });
}

export async function updateContact(
  accountId: string,
  contactId: string,
  data: Partial<Omit<ContactInput, "email">>,
): Promise<Contact> {
  return apiFetch<Contact>(
    `/email-accounts/${accountId}/contacts/${contactId}`,
    {
      method: "PATCH",
      body: data,
    },
  );
}

export async function deleteContact(
  accountId: string,
  contactId: string,
): Promise<void> {
  await apiFetch(`/email-accounts/${accountId}/contacts/${contactId}`, {
    method: "DELETE",
  });
}
