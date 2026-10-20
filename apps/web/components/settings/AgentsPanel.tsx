import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import type { Agent } from "@/lib/api/types";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
} from "@/lib/services/agents.service";

export function AgentsPanel({
  accountId,
  isOwner,
}: {
  accountId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents", accountId],
    queryFn: () => listAgents(accountId),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["agents", accountId] });
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setSystemPrompt("");
    setShowForm(false);
  }

  const createMutation = useMutation({
    mutationFn: () => createAgent(accountId, { name, systemPrompt }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAgent(accountId, editingId!, { name, systemPrompt }),
    onSuccess: () => {
      resetForm();
      void invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ agentId, enabled }: { agentId: string; enabled: boolean }) =>
      updateAgent(accountId, agentId, { enabled }),
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => deleteAgent(accountId, agentId),
    onSuccess: () => void invalidate(),
  });

  function startEdit(agent: Agent) {
    setEditingId(agent.id);
    setName(agent.name);
    setSystemPrompt(agent.systemPrompt);
    setShowForm(true);
  }

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs text-zinc-500">
        A persona&apos;s system prompt fully replaces the default reply
        prompt when used — attach one to a workflow rule&apos;s
        &quot;Auto-send the AI reply&quot; action.
      </p>

      {isLoading && <p className="text-xs text-zinc-400">Loading agents…</p>}

      <ul className="mb-3 space-y-2">
        {agents?.map((agent) => (
          <li key={agent.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">{agent.name}</p>
              {isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({
                        agentId: agent.id,
                        enabled: !agent.enabled,
                      })
                    }
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                      agent.enabled
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-500 ring-zinc-200",
                    )}
                  >
                    {agent.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(agent)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    loading={
                      deleteMutation.isPending &&
                      deleteMutation.variables === agent.id
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {agent.systemPrompt}
            </p>
          </li>
        ))}
        {agents?.length === 0 && !isLoading && (
          <li className="text-xs text-zinc-400">No agent personas yet.</li>
        )}
      </ul>

      {isOwner && !showForm && (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + Add agent
        </Button>
      )}

      {isOwner && showForm && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          {!editingId && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600">
                Start from a template (optional):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    onClick={() => {
                      setName(template.name);
                      setSystemPrompt(template.systemPrompt);
                    }}
                    className="rounded-full px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            type="text"
            required
            placeholder='Persona name, e.g. "Customer Support Agent"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
          <textarea
            required
            rows={5}
            placeholder="Write the complete system prompt for how this persona should reply — this replaces the default prompt entirely, not appended to it."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />

          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-xs text-red-600">
              {(createMutation.error ?? updateMutation.error) instanceof Error
                ? ((createMutation.error ?? updateMutation.error) as Error)
                    .message
                : "Could not save that agent"}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Save changes" : "Create agent"}
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
