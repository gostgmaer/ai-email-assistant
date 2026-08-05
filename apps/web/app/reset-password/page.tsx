"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { resetPassword } from "@/lib/services/auth.service";

const schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!token) throw new Error("Missing reset token");
      return resetPassword(token, values.newPassword);
    },
    onSuccess: () => {
      router.replace("/login");
    },
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Set a new password
          </h1>
        </div>

        {!token ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            This reset link is invalid. Request a new one from the{" "}
            <Link href="/forgot-password" className="underline">
              forgot password
            </Link>{" "}
            page.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                New password
              </label>
              <input
                type="password"
                {...register("newPassword")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.newPassword.message}
                </p>
              )}
            </div>

            {mutation.isError && (
              <p className="text-xs text-red-600">
                {mutation.error instanceof ApiError
                  ? mutation.error.message
                  : "This link may have expired. Request a new one."}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={mutation.isPending}
            >
              Reset password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
