"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type AdminUser = {
  _id: string;
  email: string;
  role: "user" | "rider" | "admin" | "employee";
  isBanned?: boolean;
  banStartAt?: string | null;
  banEndAt?: string | null;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  address?: string;
};

export default function EmployeeUsersPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [listMode, setListMode] = useState<"all" | "whitelist" | "blacklist">("all");

  const load = async () => {
    try {
      const data = (await apiFetch("/customers/admin/customers")) as AdminUser[];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const authRole = localStorage.getItem("auth_role");
    if (authRole !== "admin") {
      router.replace("/");
      return;
    }

    load();
  }, [router]);

  const applyUpdatedUser = (updated: AdminUser) => {
    if (updated.role !== "user") {
      setItems((prev) => prev.filter((item) => item._id !== updated._id));
      return;
    }
    setItems((prev) => prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)));
  };

  const handleChangeRole = async (item: AdminUser, role: "user" | "rider" | "admin" | "employee") => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      setMessage(`Updated role for ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setActionUserId(null);
    }
  };

  const handleBanPermanent = async (item: AdminUser) => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "permanent" }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      setMessage(`Permanently banned ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleBanDays = async (item: AdminUser) => {
    const dayValue = window.prompt(`Ban ${item.email} for how many days?`, "7");
    if (dayValue === null) return;

    const days = Number(dayValue);
    if (!Number.isFinite(days) || days <= 0) {
      setError("Please enter a valid number of days");
      return;
    }

    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "days", days }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      setMessage(`Banned ${item.email} for ${Math.floor(days)} day(s)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleUnban = async (item: AdminUser) => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "unban" }),
      })) as AdminUser;
      applyUpdatedUser(updated);
      setMessage(`Unbanned ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleChangePassword = async (item: AdminUser) => {
    const newPassword = window.prompt(`Set new password for ${item.email} (minimum 8 characters):`, "");
    if (newPassword === null) return;

    const trimmed = newPassword.trim();
    if (trimmed.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/customers/admin/users/${item._id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: trimmed }),
      });
      setMessage(`Password changed for ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setActionUserId(null);
    }
  };

  const handleDeleteUser = async (item: AdminUser) => {
    if (!window.confirm(`Delete ${item.email}? This action cannot be undone.`)) return;

    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/customers/admin/users/${item._id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((row) => row._id !== item._id));
      setMessage(`Deleted ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setActionUserId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (listMode === "whitelist") return !item.isBanned;
    if (listMode === "blacklist") return Boolean(item.isBanned);
    return true;
  });

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">User Management</h1>
          <p className="text-sm text-blue-700/60">Manage customer white list and black list.</p>
          <div className="mt-3 inline-flex rounded-xl border border-blue-100 bg-white p-1">
            <button
              onClick={() => setListMode("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-widest ${listMode === "all" ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-50"}`}
            >
              All
            </button>
            <button
              onClick={() => setListMode("whitelist")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-widest ${listMode === "whitelist" ? "bg-emerald-600 text-white" : "text-blue-700 hover:bg-blue-50"}`}
            >
              White List
            </button>
            <button
              onClick={() => setListMode("blacklist")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-widest ${listMode === "blacklist" ? "bg-rose-600 text-white" : "text-blue-700 hover:bg-blue-50"}`}
            >
              Black List
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-2xl shadow-blue-100/40">
        {message && <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">{message}</div>}
        {loading ? (
          <div className="p-8 text-sm font-semibold text-blue-500">Loading users...</div>
        ) : error ? (
          <div className="p-8 text-sm font-semibold text-rose-500">{error}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-sm font-semibold text-blue-500">No users found for this list.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-blue-400">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Address</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Ban Start</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim() || "-";
                const busy = actionUserId === item._id;
                return (
                  <tr key={item._id} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-semibold">{fullName}</td>
                    <td className="px-5 py-4">{item.email}</td>
                    <td className="px-5 py-4">{item.phoneNumber || "-"}</td>
                    <td className="px-5 py-4">{item.address || "-"}</td>
                    <td className="px-5 py-4">
                      <select
                        value={item.role}
                        disabled={busy}
                        onChange={(event) => handleChangeRole(item, event.target.value as "user" | "rider" | "admin" | "employee")}
                        className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-semibold text-blue-900"
                      >
                        <option value="user">user</option>
                        <option value="rider">rider</option>
                        <option value="employee">employee</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${item.isBanned ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                        {item.isBanned ? "Banned" : "Active"}
                      </span>
                      {item.isBanned && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-500">
                          {item.banEndAt ? `Until ${formatDate(item.banEndAt)}` : "Permanent"}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-blue-700/80">
                      {item.isBanned ? formatDate(item.banStartAt) : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {item.isBanned ? (
                          <button
                            disabled={busy}
                            onClick={() => handleUnban(item)}
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            Unban
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => handleBanPermanent(item)}
                              className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              Ban Permanent
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => handleBanDays(item)}
                              className="rounded-lg border border-orange-200 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                            >
                              Ban Days
                            </button>
                          </>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => handleChangePassword(item)}
                          className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          Password
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => handleDeleteUser(item)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
