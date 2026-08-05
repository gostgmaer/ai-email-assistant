"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { GoogleIcon, MicrosoftIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth/auth-context";
import {
  googleLoginUrl,
  loginWithPassword,
  microsoftLoginUrl,
} from "@/lib/services/auth.service";
import { ApiError } from "@/lib/api/client";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginContent() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/inbox");
  }, [isLoading, isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
    onSuccess: (result) => {
      login(result);
      router.replace("/inbox");
    },
  });

  const onSubmit = (values: LoginFormValues) => loginMutation.mutate(values);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            AI Email Assistant
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to manage your inbox
          </p>
        </div>

        {oauthFailed && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Sign-in failed. Please try again.
          </p>
        )}

        <div className="space-y-3">
          <a
            href={googleLoginUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <a
            href={microsoftLoginUrl()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <MicrosoftIcon />
            Continue with Microsoft
          </a>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs text-zinc-400">or continue with email</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

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
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-600">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-indigo-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              {...register("password")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {loginMutation.isError && (
            <p className="text-xs text-red-600">
              {loginMutation.error instanceof ApiError
                ? loginMutation.error.message
                : "Sign-in failed"}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={loginMutation.isPending}
          >
            Sign in
          </Button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-indigo-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginContent />
    </Suspense>
  );
}
