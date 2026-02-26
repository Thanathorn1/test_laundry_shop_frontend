"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type LoginRole = "user" | "rider" | "admin" | "employee";
type SelectableRole = "user" | "rider" | "employee";
type AuthMode = "signin" | "signup";

type SignInResponse = {
  access_token: string;
  refresh_token: string;
};

function getRoleFromAccessToken(token: string): LoginRole | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { role?: string };

    if (parsed.role === "admin" || parsed.role === "rider" || parsed.role === "user" || parsed.role === "employee") {
      return parsed.role;
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveAuthRole(accessToken: string, apiBaseUrl: string): Promise<LoginRole | null> {
  const tokenRole = getRoleFromAccessToken(accessToken);
  if (tokenRole) return tokenRole;

  try {
    const response = await fetch(`${apiBaseUrl}/customers/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { role?: string };
    if (data.role === "admin" || data.role === "rider" || data.role === "user" || data.role === "employee") {
      return data.role;
    }
    return null;
  } catch {
    return null;
  }
}

type LeafletLib = {
  map: (container: HTMLElement, options: any) => { remove: () => void };
  tileLayer: (url: string, options: any) => { addTo: (map: any) => void };
};

async function loadLeaflet(): Promise<LeafletLib | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { L?: LeafletLib };
  if (w.L) return w.L;

  if (!document.querySelector('link[data-leaflet="true"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.setAttribute('data-leaflet', 'true');
    document.head.appendChild(css);
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-leaflet="true"]') as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).L) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load leaflet')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.setAttribute('data-leaflet', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load leaflet'));
    document.body.appendChild(script);
  });

  return (window as unknown as { L?: LeafletLib }).L ?? null;
}

export default function Home() {
  const router = useRouter();
  const mapBgRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<SelectableRole>("user");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => API_BASE_URL, []);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const L = await loadLeaflet();
      if (!mounted || !L || !mapBgRef.current || mapInstanceRef.current) return;

      try {
        const map = L.map(mapBgRef.current, {
          center: [13.7563, 100.5018],
          zoom: 12,
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false,
          touchZoom: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map as any);
        mapInstanceRef.current = map;
      } catch {
        // ignore background map errors
      }
    };

    setup();

    return () => {
      mounted = false;
      try {
        mapInstanceRef.current?.remove?.();
      } catch {
        // ignore
      }
      mapInstanceRef.current = null;
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      if (mode === "signup" && password !== confirmPassword) {
        throw new Error("Password confirmation does not match");
      }

      const endpoint = mode === "signup" ? "signup" : "signin";
      const payload =
        mode === "signup"
          ? {
            firstName,
            lastName,
            phoneNumber,
            email,
            password,
            confirmPassword,
            role,
          }
          : { email, password, role };

      const response = await fetch(`${apiBaseUrl}/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const failedData = (await response.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        const backendMessage = Array.isArray(failedData.message)
          ? failedData.message[0]
          : failedData.message;

        throw new Error(backendMessage ?? "Login failed");
      }

      const data = (await response.json()) as SignInResponse;
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      const authRole = await resolveAuthRole(data.access_token, apiBaseUrl);
      if (authRole) {
        localStorage.setItem("user_role", authRole);
        localStorage.setItem("auth_role", authRole);
      } else {
        localStorage.removeItem("user_role");
        localStorage.removeItem("auth_role");
      }
      setMessage(mode === "signup" ? "Signup successful" : "Login successful");

      const finalRole = authRole ?? role;

      if (finalRole === "admin") {
        if (role === "rider") {
          router.push("/rider");
        } else if (role === "employee") {
          router.push("/employee");
        } else if (role === "user") {
          router.push("/customer");
        } else {
          router.push("/customer");
        }
      } else if (finalRole === "rider") {
        router.push("/rider");
      } else if (finalRole === "employee") {
        router.push("/employee");
      } else {
        router.push("/customer");
      }
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Login failed";
      setError(submitMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotPassword = async () => {
    setError(null);
    setMessage(null);
    setForgotMessage(null);

    if (!email.trim()) {
      setError("Please enter your email first");
      return;
    }

    setIsForgotLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const failedData = (await response.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        const backendMessage = Array.isArray(failedData.message)
          ? failedData.message[0]
          : failedData.message;
        throw new Error(backendMessage ?? "Failed to send reset email");
      }

      const data = (await response.json()) as { message?: string };
      setForgotMessage(data.message ?? "If this email exists, a reset link has been sent.");
    } catch (forgotError) {
      const forgotMessage =
        forgotError instanceof Error ? forgotError.message : "Failed to send reset email";
      setError(forgotMessage);
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sans text-blue-900">
      <div ref={mapBgRef} className="absolute inset-0 z-0" />
      <div className="absolute inset-0 z-10 bg-slate-900/40" />

      <div className="relative z-20 flex min-h-screen items-center justify-center px-4">
        <main className="w-full max-w-md rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-blue-100/50 border border-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
        <h1 className="mb-2 text-4xl font-black text-blue-900 text-center tracking-tight">
          Laundry{mode === "signup" ? "+" : ""}
        </h1>
        <p className="text-slate-400 text-sm font-bold text-center mb-8 uppercase tracking-widest">
          {mode === "signup" ? "Create Account" : "Welcome Back"}
        </p>

        <div className="mb-8 grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-xl px-3 py-3 text-xs font-black uppercase tracking-widest transition-all ${mode === "signin"
              ? "bg-white text-blue-600 shadow-lg shadow-slate-200"
              : "text-slate-400 hover:text-slate-600"
              }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-xl px-3 py-3 text-xs font-black uppercase tracking-widest transition-all ${mode === "signup"
              ? "bg-white text-blue-600 shadow-lg shadow-slate-200"
              : "text-slate-400 hover:text-slate-600"
              }`}
          >
            Join Now
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} suppressHydrationWarning>
          {mode === "signup" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  suppressHydrationWarning
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  suppressHydrationWarning
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label
                htmlFor="phoneNumber"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Phone Number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                required
                suppressHydrationWarning
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              suppressHydrationWarning
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                suppressHydrationWarning
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 pr-11 text-zinc-900 outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
            {mode === "signin" && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={isForgotLoading}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  {isForgotLoading ? "Sending..." : "Forgot password?"}
                </button>
              </div>
            )}
          </div>

          {mode === "signup" && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  suppressHydrationWarning
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 pr-11 text-zinc-900 outline-none focus:border-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-[10px] font-black text-blue-300 uppercase tracking-widest leading-none text-center">Identity Role</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRole("user")}
                className={`rounded-xl border-2 px-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${role === "user"
                  ? "border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-200"
                  : "border-slate-100 bg-slate-50 text-blue-400 hover:border-slate-200 hover:bg-white"
                  }`}
              >
                User
              </button>
              <button
                type="button"
                onClick={() => setRole("rider")}
                className={`rounded-xl border-2 px-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${role === "rider"
                  ? "border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-200"
                  : "border-slate-100 bg-slate-50 text-blue-400 hover:border-slate-200 hover:bg-white"
                  }`}
              >
                Rider
              </button>
              <button
                type="button"
                onClick={() => setRole("employee")}
                className={`rounded-xl border-2 px-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${role === "employee"
                  ? "border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-200"
                  : "border-slate-100 bg-slate-50 text-blue-400 hover:border-slate-200 hover:bg-white"
                  }`}
              >
                Employee
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            suppressHydrationWarning
            className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-black text-white shadow-2xl shadow-blue-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3 group mt-4"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <span className="group-hover:translate-x-1 transition-transform">🚀</span>
            )}
            <span className="uppercase tracking-widest">
              {isLoading
                ? "Processing..."
                : mode === "signup"
                  ? "Start Journey"
                  : "Secure Login"}
            </span>
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {message}
          </p>
        )}
        {forgotMessage && (
          <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {forgotMessage}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            {error}
          </p>
        )}
        </main>
      </div>
    </div>
  );
}
