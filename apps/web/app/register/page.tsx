"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/lib/auth/auth-context";
import { register as registerRequest } from "@/lib/services/auth.service";

const registerSchema = z.object({
  displayName: z.string().max(120).optional(),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/inbox");
  }, [isLoading, isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (result) => {
      login(result);
      router.replace("/inbox");
    },
  });

  const onSubmit = (values: RegisterFormValues) =>
    registerMutation.mutate(values);

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign up with email and password
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Name (optional)
            </label>
            <input
              {...register("displayName")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>

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
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Password
            </label>
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

          {registerMutation.isError && (
            <p className="text-xs text-red-600">
              {registerMutation.error instanceof ApiError
                ? registerMutation.error.message
                : "Registration failed"}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={registerMutation.isPending}
          >
            Create account
          </Button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
