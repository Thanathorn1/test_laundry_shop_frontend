"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { apiFetch } from "@/lib/api";

export default function CustomerProfileSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-blue-900">
          <main className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white bg-white p-8 shadow-2xl shadow-blue-100/50">
            <p className="text-sm font-semibold text-blue-600">Loading profile...</p>
          </main>
        </div>
      }
    >
      <CustomerProfileSetupContent />
    </Suspense>
  );
}

function CustomerProfileSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/customer/create-order";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setIsLoading(true);
      await apiFetch("/customers/register", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: phoneNumber.trim(),
          address: address.trim() || undefined,
        }),
      });
      router.push(returnTo);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Create profile failed";
      if (message.toLowerCase().includes("unauthorized")) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user_role");
        localStorage.removeItem("auth_role");
        router.push("/");
        return;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-blue-900">
      <main className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white bg-white p-8 shadow-2xl shadow-blue-100/50">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight">Create Customer Profile</h1>
          <Link href="/customer" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-slate-50">
            Back
          </Link>
        </div>

        <p className="mb-6 text-sm font-medium text-blue-700/70">
          Complete this profile once. Then you can create orders and save addresses.
        </p>

        <form className="space-y-4" onSubmit={onSubmit} suppressHydrationWarning>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold">First Name</label>
              <input
                required
                suppressHydrationWarning
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">Last Name</label>
              <input
                required
                suppressHydrationWarning
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Telephone Number</label>
            <input
              required
              suppressHydrationWarning
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="08xxxxxxxx"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Address (optional)</label>
            <input
              suppressHydrationWarning
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Saving..." : "Save Profile"}
          </button>
        </form>

        {error && <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      </main>
    </div>
  );
}
