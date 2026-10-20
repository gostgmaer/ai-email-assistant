import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EmailAccount } from "@/lib/api/types";
import { updateEmailAccount } from "@/lib/services/email-accounts.service";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INPUT = "rounded-md border border-zinc-300 px-2 py-1 text-xs";

/**
 * Per-account limits on autonomous sending, and the identity added to AI
 * replies: on/off, hourly/daily caps, confidence threshold, undo window,
 * quiet hours, business hours (for the rule condition) and signature.
 */
export function AutomationSettingsPanel({ account }: { account: EmailAccount }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({
    autoSendEnabled: account.autoSendEnabled,
    autoSendHourlyCap: account.autoSendHourlyCap,
    autoSendDailyCap: account.autoSendDailyCap,
    autoSendConfidenceThreshold: account.autoSendConfidenceThreshold,
    undoSendSeconds: account.undoSendSeconds,
    quietHoursStart: account.quietHoursStart ?? "",
    quietHoursEnd: account.quietHoursEnd ?? "",
    businessHoursStart: account.businessHoursStart,
    businessHoursEnd: account.businessHoursEnd,
    businessDays: account.businessDays,
    signatureText: account.signatureText ?? "",
    signatureHtml: account.signatureHtml ?? "",
  }));

  const saveMutation = useMutation({
    mutationFn: () =>
      updateEmailAccount(account.id, {
        ...form,
        quietHoursStart: form.quietHoursStart || null,
        quietHoursEnd: form.quietHoursEnd || null,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["email-accounts"] }),
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const number = (key: keyof typeof form, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={form[key] as number}
      onChange={(e) => set(key, Number(e.target.value))}
      className={`w-20 ${INPUT}`}
    />
  );

  return (
    <form
      className="mt-4 space-y-4 border-t border-zinc-100 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-700">Auto-send</h3>
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={form.autoSendEnabled}
            onChange={(e) => set("autoSendEnabled", e.target.checked)}
          />
          Allow rules to send AI replies without review. Off holds every reply
          as a draft.
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-600">
          <label className="flex items-center gap-1.5">
            At most {number("autoSendHourlyCap", 0, 1000)} per hour
          </label>
          <label className="flex items-center gap-1.5">
            and {number("autoSendDailyCap", 0, 10000)} per day
          </label>
          <label className="flex items-center gap-1.5">
            Minimum confidence {number("autoSendConfidenceThreshold", 0, 100)}
          </label>
          <label className="flex items-center gap-1.5">
            Undo window {number("undoSendSeconds", 0, 300)} seconds
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Over a limit, replies are held as drafts and you get one
          notification. During the undo window a reply waits in Drafts with a
          &quot;Cancel send&quot; button.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-700">Hours</h3>
        <p className="text-xs text-zinc-500">
          In your timezone — set it on your{" "}
          <Link href="/settings/profile" className="underline">
            profile
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span>Quiet hours (auto-replies wait until they end):</span>
          <input
            type="time"
            value={form.quietHoursStart}
            onChange={(e) => set("quietHoursStart", e.target.value)}
            className={INPUT}
          />
          <span>to</span>
          <input
            type="time"
            value={form.quietHoursEnd}
            onChange={(e) => set("quietHoursEnd", e.target.value)}
            className={INPUT}
          />
          {(form.quietHoursStart || form.quietHoursEnd) && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, quietHoursStart: "", quietHoursEnd: "" }))}
              className="text-zinc-400 hover:text-zinc-700"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <span>Business hours (for the rule condition):</span>
          <input
            type="time"
            required
            value={form.businessHoursStart}
            onChange={(e) => set("businessHoursStart", e.target.value)}
            className={INPUT}
          />
          <span>to</span>
          <input
            type="time"
            required
            value={form.businessHoursEnd}
            onChange={(e) => set("businessHoursEnd", e.target.value)}
            className={INPUT}
          />
          {DAYS.map((day, index) => (
            <label key={day} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.businessDays.includes(index)}
                onChange={(e) =>
                  set(
                    "businessDays",
                    e.target.checked
                      ? [...form.businessDays, index].sort()
                      : form.businessDays.filter((d) => d !== index),
                  )
                }
              />
              {day}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-700">Signature</h3>
        <p className="text-xs text-zinc-500">
          Added to the end of every AI reply; the AI is told not to sign
          itself. For Gmail accounts it&apos;s imported from Gmail until you set
          one here. Leave both empty for no signature.
        </p>
        <textarea
          rows={3}
          placeholder="Plain-text signature"
          value={form.signatureText}
          onChange={(e) => set("signatureText", e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
        />
        <textarea
          rows={3}
          placeholder="HTML signature (optional — used in the HTML part)"
          value={form.signatureHtml}
          onChange={(e) => set("signatureHtml", e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-xs"
        />
      </section>

      {saveMutation.isError && (
        <p className="text-xs text-red-600">
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : "Could not save"}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={saveMutation.isPending}>
          Save automation settings
        </Button>
        {saveMutation.isSuccess && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
      </div>
    </form>
  );
}
