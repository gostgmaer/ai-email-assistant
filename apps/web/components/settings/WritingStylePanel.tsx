import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import type { WritingStyle, WritingStyleView } from "@/lib/api/types";
import {
  getWritingStyle,
  rebuildWritingStyle,
  updateWritingStyle,
} from "@/lib/services/email-accounts.service";
import { formatDateTime } from "@/lib/utils/format";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none";

/**
 * "Writing style": how the account's owner writes (greeting, sign-off,
 * length, formality, phrases), learned from their own sent mail. AI replies
 * and rewrites for this account follow it unless it's off or an agent
 * persona writes the reply. The owner can edit it, turn it off or rebuild
 * it; members can see it.
 */
export function WritingStylePanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["writing-style", accountId];
  const [editing, setEditing] = useState(false);

  const { data: style, isLoading } = useQuery({
    queryKey,
    queryFn: () => getWritingStyle(accountId),
  });

  const onSaved = (view: WritingStyleView) => {
    queryClient.setQueryData(queryKey, view);
    setEditing(false);
  };
  const rebuildMutation = useMutation({
    mutationFn: () => rebuildWritingStyle(accountId),
    onSuccess: onSaved,
  });
  const updateMutation = useMutation({
    mutationFn: (changes: {
      enabled?: boolean;
      profile?: Partial<WritingStyle>;
    }) => updateWritingStyle(accountId, changes),
    onSuccess: onSaved,
  });

  const error = rebuildMutation.error ?? updateMutation.error;

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
      <p>
        AI replies and rewrites for this account are written the way you write:
        learned from your own sent mail (never AI-written replies), with names,
        numbers and links left out. An agent persona, when a rule uses one,
        writes in its own voice instead.
      </p>

      {isLoading && <p className="text-zinc-400">Loading…</p>}

      {!isLoading && !style && (
        <p className="text-zinc-500">
          Not built yet. It&apos;s built automatically once a day for accounts
          with at least 5 sent emails
          {isOwner ? ", or you can build it now." : "."}
        </p>
      )}

      {style && !editing && <StyleSummary style={style} />}

      {style && editing && (
        <StyleEditor
          profile={style.profile}
          saving={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSave={(profile) => updateMutation.mutate({ profile })}
        />
      )}

      {error && (
        <p className="text-red-600">
          {error instanceof ApiError ? error.message : "Something went wrong."}
        </p>
      )}

      {isOwner && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {style && (
            <>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={style.enabled}
                  disabled={updateMutation.isPending}
                  onChange={(event) =>
                    updateMutation.mutate({ enabled: event.target.checked })
                  }
                />
                Use my writing style
              </label>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={rebuildMutation.isPending}
            onClick={() => rebuildMutation.mutate()}
          >
            {style ? "Rebuild from sent mail" : "Build from sent mail"}
          </Button>
          {style?.editedAt && (
            <span className="text-zinc-400">Rebuilding replaces your edits.</span>
          )}
        </div>
      )}
    </div>
  );
}

function StyleSummary({ style }: { style: WritingStyleView }) {
  const { profile, editStats } = style;
  const rows: [string, string | null][] = [
    ["Greeting", profile.greeting],
    ["Sign-off", profile.signOff],
    ["Formality", profile.formality],
    [
      "Length",
      profile.medianWords
        ? `${profile.length} (about ${profile.medianWords} words)`
        : profile.length,
    ],
    ["Language", profile.language],
    [
      "Phrases",
      profile.commonPhrases.length
        ? profile.commonPhrases.map((phrase) => `“${phrase}”`).join(", ")
        : null,
    ],
    ["Also", profile.notes],
  ];

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="text-zinc-800">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-zinc-400">
        {style.enabled ? "On" : "Off"} · learned from {style.sampleCount} sent
        emails, {formatDateTime(style.builtAt)}
        {style.editedAt && ` · edited ${formatDateTime(style.editedAt)}`}
      </p>
      <p className="text-zinc-500">
        How much AI drafts were changed before sending: {editLabel(editStats.before)}{" "}
        before the profile, {editLabel(editStats.after)} since.
      </p>
    </div>
  );
}

function editLabel({ median, count }: { median: number | null; count: number }) {
  if (median === null || count === 0) return "no drafts sent";
  return `${Math.round(median * 100)}% (median of ${count})`;
}

function StyleEditor({
  profile,
  saving,
  onSave,
  onCancel,
}: {
  profile: WritingStyle;
  saving: boolean;
  onSave: (profile: Partial<WritingStyle>) => void;
  onCancel: () => void;
}) {
  const [greeting, setGreeting] = useState(profile.greeting ?? "");
  const [signOff, setSignOff] = useState(profile.signOff ?? "");
  const [formality, setFormality] = useState(profile.formality);
  const [length, setLength] = useState(profile.length);
  const [phrases, setPhrases] = useState(profile.commonPhrases.join("\n"));
  const [notes, setNotes] = useState(profile.notes ?? "");

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          greeting: greeting.trim() || null,
          signOff: signOff.trim() || null,
          formality,
          length,
          commonPhrases: phrases
            .split("\n")
            .map((phrase) => phrase.trim())
            .filter(Boolean)
            .slice(0, 8),
          notes: notes.trim() || null,
        });
      }}
    >
      <label className="block">
        Greeting ({"{name}"} is the recipient)
        <input
          value={greeting}
          maxLength={60}
          onChange={(e) => setGreeting(e.target.value)}
          className={inputClass}
          placeholder="Hi {name},"
        />
      </label>
      <label className="block">
        Sign-off
        <input
          value={signOff}
          maxLength={60}
          onChange={(e) => setSignOff(e.target.value)}
          className={inputClass}
          placeholder="Thanks,"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex-1">
          Formality
          <select
            value={formality}
            onChange={(e) => setFormality(e.target.value as WritingStyle["formality"])}
            className={inputClass}
          >
            <option value="casual">casual</option>
            <option value="neutral">neutral</option>
            <option value="formal">formal</option>
          </select>
        </label>
        <label className="flex-1">
          Length
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as WritingStyle["length"])}
            className={inputClass}
          >
            <option value="short">short</option>
            <option value="medium">medium</option>
            <option value="long">long</option>
          </select>
        </label>
      </div>
      <label className="block">
        Phrases you use (one per line, up to 8)
        <textarea
          value={phrases}
          rows={3}
          onChange={(e) => setPhrases(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block">
        Anything else
        <textarea
          value={notes}
          rows={2}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>
          Save
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
