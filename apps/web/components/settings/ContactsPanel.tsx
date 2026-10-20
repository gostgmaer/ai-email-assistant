import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { Contact } from "@/lib/api/types";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/lib/services/contacts.service";
import { formatRelativeDate } from "@/lib/utils/format";

export function ContactsPanel({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", accountId],
    queryFn: () => listContacts(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: ["contacts", accountId],
    });
  }

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setName("");
    setCompany("");
    setPhone("");
    setStatus("");
    setNotes("");
    setTagsInput("");
    setShowForm(false);
  }

  function tagsFromInput(): string[] {
    return tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createContact(accountId, {
        email,
        name: name || undefined,
        company: company || undefined,
        phone: phone || undefined,
        status: status || undefined,
        notes: notes || undefined,
        tags: tagsFromInput(),
      }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateContact(accountId, editingId!, {
        name: name || undefined,
        company: company || undefined,
        phone: phone || undefined,
        status: status || undefined,
        notes: notes || undefined,
        tags: tagsFromInput(),
      }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => deleteContact(accountId, contactId),
    onSuccess: () => void invalidate(),
  });

  function startEdit(contact: Contact) {
    setEditingId(contact.id);
    setEmail(contact.email);
    setName(contact.name ?? "");
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setStatus(contact.status ?? "");
    setNotes(contact.notes ?? "");
    setTagsInput(contact.tags.join(", "));
    setShowForm(true);
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        Contacts are created explicitly here — they&apos;re never
        auto-populated from incoming email. Once created,{" "}
        <span className="font-medium">last contacted</span> updates
        automatically whenever this account processes a message from that
        address.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading contacts…</p>}

      <ul className="mb-3 space-y-2">
        {contacts?.map((contact) => (
          <li
            key={contact.id}
            className="rounded-md border border-zinc-200 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {contact.name || contact.email}
                  {contact.status && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                      {contact.status}
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {contact.email}
                  {contact.company && ` · ${contact.company}`}
                  {contact.phone && ` · ${contact.phone}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => startEdit(contact)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(contact.id)}
                  loading={
                    deleteMutation.isPending &&
                    deleteMutation.variables === contact.id
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
            {contact.notes && (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                {contact.notes}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                >
                  {tag}
                </span>
              ))}
              {contact.lastContactedAt && (
                <span className="text-[10px] text-zinc-400">
                  Last contacted {formatRelativeDate(contact.lastContactedAt)}
                </span>
              )}
            </div>
          </li>
        ))}
        {contacts?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No contacts yet.</li>
        )}
      </ul>

      {!showForm && (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add contact
        </Button>
      )}

      {showForm && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          <input
            type="email"
            required
            disabled={!!editingId}
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder='Status, e.g. "Lead"'
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Tags, comma-separated"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />

          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-xs text-red-600">
              {(createMutation.error ?? updateMutation.error) instanceof Error
                ? ((createMutation.error ?? updateMutation.error) as Error)
                    .message
                : "Could not save that contact"}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save changes" : "Create contact"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
