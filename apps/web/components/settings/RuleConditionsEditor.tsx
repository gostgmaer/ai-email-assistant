import type {
  WorkflowBooleanField,
  WorkflowCondition,
  WorkflowConditionField,
  WorkflowConditionGroup,
  WorkflowConditionNode,
  WorkflowConditionOperator,
} from "@/lib/api/types";

export const CONDITION_FIELDS: { value: WorkflowConditionField; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "priority", label: "Priority" },
  { value: "sentiment", label: "Sentiment" },
  { value: "language", label: "Language" },
  { value: "sender", label: "Sender address" },
  { value: "senderDomain", label: "Sender domain" },
  { value: "to", label: "To" },
  { value: "cc", label: "Cc" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Message text" },
  { value: "containsPii", label: "Contains personal data" },
  { value: "hasAttachment", label: "Has attachments" },
  { value: "isFirstMessage", label: "First message in thread" },
  { value: "isKnownContact", label: "Sender is a known contact" },
  { value: "withinBusinessHours", label: "Received in business hours" },
];

const BOOLEAN_FIELDS = new Set<WorkflowConditionField>([
  "containsPii",
  "hasAttachment",
  "isFirstMessage",
  "isKnownContact",
  "withinBusinessHours",
]);

const TEXT_OPERATORS: { value: WorkflowConditionOperator; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "notEquals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "doesn't contain" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "in", label: "is one of" },
  { value: "notIn", label: "is none of" },
  { value: "regex", label: "matches regex" },
];

/** One editable condition row. `value` is always text in the form: a
 * comma-separated list for in/notIn, "true"/"false" for yes/no fields. */
export interface ConditionRow {
  field: WorkflowConditionField;
  op: WorkflowConditionOperator;
  value: string;
}

export interface ConditionsDraft {
  mode: "all" | "any";
  rows: ConditionRow[];
  matchAll: boolean;
}

export function emptyConditionsDraft(): ConditionsDraft {
  return {
    mode: "all",
    rows: [{ field: "category", op: "equals", value: "" }],
    matchAll: false,
  };
}

function isBooleanField(field: WorkflowConditionField): field is WorkflowBooleanField {
  return BOOLEAN_FIELDS.has(field);
}

/** The form state as the API's condition group. */
export function toConditionGroup(draft: ConditionsDraft): WorkflowConditionGroup {
  if (draft.matchAll) {
    return { all: [], matchAll: true };
  }

  const conditions: WorkflowCondition[] = draft.rows.map((row) => {
    if (isBooleanField(row.field)) {
      return { field: row.field, op: row.op, value: row.value !== "false" };
    }
    if (row.op === "in" || row.op === "notIn") {
      return {
        field: row.field,
        op: row.op,
        value: row.value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }
    return { field: row.field, op: row.op, value: row.value };
  });

  return draft.mode === "all" ? { all: conditions } : { any: conditions };
}

/** Plain-language summary of a stored condition tree. */
export function describeConditions(group: WorkflowConditionGroup): string {
  if (group.matchAll) {
    return "any message arrives";
  }
  const node: Partial<WorkflowConditionGroup> = { ...group };
  delete node.matchAll;
  return describeNode(node as WorkflowConditionNode);
}

function describeNode(node: WorkflowConditionNode): string {
  if ("field" in node) {
    const field =
      CONDITION_FIELDS.find((f) => f.value === node.field)?.label ?? node.field;
    if (typeof node.value === "boolean") {
      const yes = (node.op === "equals") === node.value;
      return `${field}: ${yes ? "yes" : "no"}`;
    }
    const op = TEXT_OPERATORS.find((o) => o.value === node.op)?.label ?? node.op;
    const value = Array.isArray(node.value)
      ? node.value.join(", ")
      : node.value;
    return `${field} ${op} "${value}"`;
  }
  if ("not" in node) {
    return `not (${describeNode(node.not)})`;
  }
  const children = "all" in node ? node.all : node.any;
  const joined = children
    .map((child) =>
      "field" in child ? describeNode(child) : `(${describeNode(child)})`,
    )
    .join("all" in node ? " and " : " or ");
  return joined;
}

export function RuleConditionsEditor({
  value,
  onChange,
}: {
  value: ConditionsDraft;
  onChange: (next: ConditionsDraft) => void;
}) {
  const updateRow = (index: number, next: Partial<ConditionRow>) =>
    onChange({
      ...value,
      rows: value.rows.map((row, i) => (i === index ? { ...row, ...next } : row)),
    });

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
        <span>When</span>
        <select
          value={value.mode}
          disabled={value.matchAll}
          onChange={(e) =>
            onChange({ ...value, mode: e.target.value as "all" | "any" })
          }
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        <span>of these match:</span>
        <label className="ml-auto flex items-center gap-1.5 font-normal">
          <input
            type="checkbox"
            checked={value.matchAll}
            onChange={(e) => onChange({ ...value, matchAll: e.target.checked })}
          />
          Match every message
        </label>
      </div>

      {value.matchAll ? (
        <p className="text-xs text-amber-700">
          This rule runs on every new message. Make sure that&apos;s what you
          want, especially with auto-reply or forwarding actions.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {value.rows.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-1.5">
                <select
                  value={row.field}
                  onChange={(e) => {
                    const field = e.target.value as WorkflowConditionField;
                    updateRow(
                      i,
                      isBooleanField(field)
                        ? { field, op: "equals", value: "true" }
                        : {
                            field,
                            op: isBooleanField(row.field) ? "equals" : row.op,
                            value: isBooleanField(row.field) ? "" : row.value,
                          },
                    );
                  }}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                >
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {isBooleanField(row.field) ? (
                  <select
                    value={row.value === "false" ? "false" : "true"}
                    onChange={(e) =>
                      updateRow(i, { op: "equals", value: e.target.value })
                    }
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                ) : (
                  <>
                    <select
                      value={row.op}
                      onChange={(e) =>
                        updateRow(i, {
                          op: e.target.value as WorkflowConditionOperator,
                        })
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    >
                      {TEXT_OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder={
                        row.op === "in" || row.op === "notIn"
                          ? "comma-separated values"
                          : row.op === "regex"
                            ? "e.g. invoice\\s*#\\d+"
                            : "value"
                      }
                      value={row.value}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    />
                  </>
                )}

                {value.rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        rows: value.rows.filter((_, j) => j !== i),
                      })
                    }
                    className="px-1 text-xs text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                rows: [...value.rows, { field: "category", op: "equals", value: "" }],
              })
            }
            className="mt-1 text-xs text-indigo-600 hover:underline"
          >
            + Add condition
          </button>
        </>
      )}
    </div>
  );
}
