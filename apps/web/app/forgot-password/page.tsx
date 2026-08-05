"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { forgotPassword } from "@/lib/services/auth.service";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => forgotPassword(values.email),
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            We&apos;ll email you a link to reset it.
          </p>
        </div>

        {mutation.isSuccess ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-center text-sm text-green-700">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Email
              </label>
              <input
                type="email"
                {...register("email")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={mutation.isPending}
            >
              Send reset link
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-zinc-500">
          <Link href="/login" className="text-indigo-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
