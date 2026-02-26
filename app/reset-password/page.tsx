"use client";

import { Suspense } from "react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const apiBaseUrl = useMemo(() => API_BASE_URL, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Invalid reset link");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        const failedData = (await response.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        const backendMessage = Array.isArray(failedData.message)
          ? failedData.message[0]
          : failedData.message;

        throw new Error(backendMessage ?? "Reset password failed");
      }

      setMessage("Password reset successful. Redirecting to login...");
      setTimeout(() => {
        router.push("/");
      }, 1200);
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Reset password failed";
      setError(submitMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 font-sans text-blue-900">
      <main className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl border border-white">
        <h1 className="text-2xl font-black text-blue-900 text-center tracking-tight">Reset Password</h1>
        <p className="text-slate-500 text-sm text-center mt-2 mb-6">Enter your new password</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-zinc-700">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-zinc-700">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        {message && <p className="mt-4 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-blue-900">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
