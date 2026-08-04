"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { connectImap } from "@/lib/services/email-accounts.service";

const imapSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  displayName: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  imapHost: z.string().min(1, "IMAP host is required"),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  smtpHost: z.string().min(1, "SMTP host is required"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
});

type ImapFormInput = z.input<typeof imapSchema>;
type ImapFormOutput = z.output<typeof imapSchema>;

export function ConnectImapForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ImapFormInput, unknown, ImapFormOutput>({
    resolver: zodResolver(imapSchema),
    defaultValues: {
      imapPort: 993,
      imapSecure: true,
      smtpPort: 465,
      smtpSecure: true,
    },
  });

  const mutation = useMutation({
    mutationFn: connectImap,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email address" error={errors.email?.message}>
          <input {...register("email")} className="input" />
        </Field>
        <Field label="Display name (optional)">
          <input {...register("displayName")} className="input" />
        </Field>
        <Field label="Username" error={errors.username?.message}>
          <input {...register("username")} className="input" />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input type="password" {...register("password")} className="input" />
        </Field>
        <Field label="IMAP host" error={errors.imapHost?.message}>
          <input {...register("imapHost")} className="input" placeholder="imap.example.com" />
        </Field>
        <Field label="IMAP port" error={errors.imapPort?.message}>
          <input type="number" {...register("imapPort")} className="input" />
        </Field>
        <Field label="SMTP host" error={errors.smtpHost?.message}>
          <input {...register("smtpHost")} className="input" placeholder="smtp.example.com" />
        </Field>
        <Field label="SMTP port" error={errors.smtpPort?.message}>
          <input type="number" {...register("smtpPort")} className="input" />
        </Field>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" {...register("imapSecure")} defaultChecked />
          IMAP over TLS
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" {...register("smtpSecure")} defaultChecked />
          SMTP over TLS
        </label>
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-600">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Could not connect to that mailbox"}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          Connect
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
