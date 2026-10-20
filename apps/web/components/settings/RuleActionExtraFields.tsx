import { useQuery } from "@tanstack/react-query";

import type { WorkflowAction } from "@/lib/api/types";
import { listAccountFolders } from "@/lib/services/email.service";

type ExtraAction = Extract<
  WorkflowAction,
  {
    type:
      | "FORWARD"
      | "ADD_LABEL"
      | "MOVE_TO_FOLDER"
      | "SNOOZE"
      | "CREATE_TASK"
      | "WEBHOOK"
      | "DELAY_SEND";
  }
>;

export function hasExtraFields(action: WorkflowAction): action is ExtraAction {
  return [
    "FORWARD",
    "ADD_LABEL",
    "MOVE_TO_FOLDER",
    "SNOOZE",
    "CREATE_TASK",
    "WEBHOOK",
    "DELAY_SEND",
  ].includes(action.type);
}

const INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-xs";

/** Inputs for the automation actions that carry settings (forward target,
 * label, folder, durations, webhook URL). */
export function RuleActionExtraFields({
  accountId,
  action,
  onChange,
}: {
  accountId: string;
  action: ExtraAction;
  onChange: (next: WorkflowAction) => void;
}) {
  const { data: folders } = useQuery({
    queryKey: ["account-folders", accountId],
    queryFn: () => listAccountFolders(accountId),
    enabled: action.type === "MOVE_TO_FOLDER",
  });

  switch (action.type) {
    case "FORWARD":
      return (
        <>
          <input
            type="email"
            required
            placeholder="forward to address"
            value={action.to}
            onChange={(e) => onChange({ ...action, to: e.target.value })}
            className={INPUT}
          />
          <input
            type="text"
            placeholder="note (optional)"
            value={action.note ?? ""}
            onChange={(e) =>
              onChange({ ...action, note: e.target.value || undefined })
            }
            className={`min-w-0 flex-1 ${INPUT}`}
          />
        </>
      );

    case "ADD_LABEL":
      return (
        <input
          type="text"
          required
          placeholder="label name"
          value={action.label}
          onChange={(e) => onChange({ ...action, label: e.target.value })}
          className={INPUT}
        />
      );

    case "MOVE_TO_FOLDER":
      return (
        <select
          required
          value={action.folderId}
          onChange={(e) => onChange({ ...action, folderId: e.target.value })}
          className={INPUT}
        >
          <option value="">Select folder</option>
          {folders?.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      );

    case "SNOOZE":
      return (
        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
          for
          <input
            type="number"
            min={1}
            max={720}
            value={Math.round(action.minutes / 60)}
            onChange={(e) =>
              onChange({ ...action, minutes: Number(e.target.value) * 60 })
            }
            className={`w-16 ${INPUT}`}
          />
          hours
        </label>
      );

    case "DELAY_SEND":
      return (
        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
          wait
          <input
            type="number"
            min={1}
            max={1440}
            value={action.minutes}
            onChange={(e) =>
              onChange({ ...action, minutes: Number(e.target.value) })
            }
            className={`w-16 ${INPUT}`}
          />
          minutes before an auto-reply sends
        </label>
      );

    case "CREATE_TASK":
      return (
        <>
          <input
            type="text"
            placeholder='task (default: "Follow up: <subject>")'
            value={action.description ?? ""}
            onChange={(e) =>
              onChange({ ...action, description: e.target.value || undefined })
            }
            className={`min-w-0 flex-1 ${INPUT}`}
          />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            due in
            <input
              type="number"
              min={0}
              max={365}
              value={action.dueInDays ?? ""}
              onChange={(e) =>
                onChange({
                  ...action,
                  dueInDays:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className={`w-14 ${INPUT}`}
            />
            days
          </label>
        </>
      );

    case "WEBHOOK":
      return (
        <input
          type="url"
          required
          placeholder="https://… (public HTTPS only)"
          value={action.url}
          onChange={(e) => onChange({ ...action, url: e.target.value })}
          className={`min-w-0 flex-1 ${INPUT}`}
        />
      );
  }
}
