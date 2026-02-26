"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type AdminEmployee = {
  _id: string;
  email: string;
  createdAt?: string;
  role: "user" | "rider" | "admin" | "employee";
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  address?: string;
  isBanned?: boolean;
  banStartAt?: string | null;
  banEndAt?: string | null;
  assignedShopId?: string | null;
  joinRequestShopId?: string | null;
  joinRequestStatus?: "none" | "pending" | "rejected";
};

type JoinRequestItem = AdminEmployee & {
  requestedShop?: { _id: string; shopName?: string; label?: string } | null;
};

type ShopWithEmployees = {
  _id: string;
  shopName?: string;
  label?: string;
  phoneNumber?: string;
  employees: AdminEmployee[];
};

type EmployeesByShopResponse = {
  shops: ShopWithEmployees[];
  unassignedEmployees: AdminEmployee[];
  employees: AdminEmployee[];
};

export default function AdminEmployeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [listMode, setListMode] = useState<"all" | "whitelist" | "blacklist">("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"alpha-asc" | "alpha-desc" | "newest" | "oldest">("alpha-asc");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shops, setShops] = useState<ShopWithEmployees[]>([]);
  const [unassignedEmployees, setUnassignedEmployees] = useState<AdminEmployee[]>([]);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [backHref, setBackHref] = useState("/admin");
  const [backLabel, setBackLabel] = useState("← Back to Admin");

  const shopNameById = useMemo(() => {
    const entries = shops.map((shop) => [shop._id, shop.shopName || shop.label || "Unnamed Shop"]);
    return Object.fromEntries(entries);
  }, [shops]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = (await apiFetch("/customers/admin/employees/by-shop")) as EmployeesByShopResponse;
      const nextShops = Array.isArray(data?.shops) ? data.shops : [];
      const nextEmployees = Array.isArray(data?.employees) ? data.employees : [];
      const nextUnassigned = Array.isArray(data?.unassignedEmployees) ? data.unassignedEmployees : [];
      const joinData = (await apiFetch("/customers/admin/employees/join-requests")) as JoinRequestItem[];

      setShops(nextShops);
      setEmployees(nextEmployees);
      setUnassignedEmployees(nextUnassigned);
      setJoinRequests(Array.isArray(joinData) ? joinData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "customer") {
      setBackHref("/customer");
      setBackLabel("← Back to Customer");
    } else if (from === "employee") {
      setBackHref("/employee");
      setBackLabel("← Back to Employee");
    }

    const authRole = localStorage.getItem("auth_role");
    if (authRole !== "admin") {
      router.replace("/");
      return;
    }
    load();
  }, [router]);

  const resolveJoinRequest = async (employeeId: string, action: "approve" | "reject") => {
    try {
      setResolvingId(employeeId);
      setError(null);
      setMessage(null);
      await apiFetch(`/customers/admin/employees/${employeeId}/join-request`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setMessage(`Join request ${action}d`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve join request");
    } finally {
      setResolvingId(null);
    }
  };

  const applyUpdatedEmployee = (updated: AdminEmployee) => {
    if (updated.role !== "employee") {
      setEmployees((prev) => prev.filter((item) => item._id !== updated._id));
      return;
    }
    setEmployees((prev) => prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)));
  };

  const handleChangeRole = async (item: AdminEmployee, role: "user" | "rider" | "admin" | "employee") => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      })) as AdminEmployee;
      applyUpdatedEmployee(updated);
      setMessage(`Updated role for ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setActionUserId(null);
    }
  };

  const handleBanPermanent = async (item: AdminEmployee) => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "permanent" }),
      })) as AdminEmployee;
      applyUpdatedEmployee(updated);
      setMessage(`Permanently banned ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleBanDays = async (item: AdminEmployee) => {
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
      })) as AdminEmployee;
      applyUpdatedEmployee(updated);
      setMessage(`Banned ${item.email} for ${Math.floor(days)} day(s)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleUnban = async (item: AdminEmployee) => {
    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      const updated = (await apiFetch(`/customers/admin/users/${item._id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "unban" }),
      })) as AdminEmployee;
      applyUpdatedEmployee(updated);
      setMessage(`Unbanned ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unban user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleChangePassword = async (item: AdminEmployee) => {
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

  const handleDeleteUser = async (item: AdminEmployee) => {
    if (!window.confirm(`Delete ${item.email}? This action cannot be undone.`)) return;

    setActionUserId(item._id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/customers/admin/users/${item._id}`, { method: "DELETE" });
      setEmployees((prev) => prev.filter((row) => row._id !== item._id));
      setMessage(`Deleted ${item.email}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setActionUserId(null);
    }
  };

  const handleCreateEmployee = async () => {
    const email = createEmail.trim().toLowerCase();
    const password = createPassword;

    if (!email) {
      setError("Email is required");
      return;
    }

    if (!password || password.trim().length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      setMessage(null);
      await apiFetch("/customers/admin/employees", {
        method: "POST",
        body: JSON.stringify({ email, password: password.trim() }),
      });
      setCreateEmail("");
      setCreatePassword("");
      setMessage("Employee account created");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create employee");
    } finally {
      setCreating(false);
    }
  };

  const filteredEmployees = employees.filter((item) => {
    const q = search.trim().toLowerCase();
    const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim().toLowerCase();
    const matchesSearch = !q || fullName.includes(q) || (item.email || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (listMode === "whitelist") return !item.isBanned;
    if (listMode === "blacklist") return Boolean(item.isBanned);
    return true;
  }).sort((a, b) => {
    const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.email || "";
    const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.email || "";

    if (sortMode === "alpha-asc") return aName.localeCompare(bName);
    if (sortMode === "alpha-desc") return bName.localeCompare(aName);

    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (sortMode === "newest") return bTime - aTime;
    return aTime - bTime;
  });

  const sortedJoinRequests = [...joinRequests].sort((a, b) => {
    const aName = `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.email || "";
    const bName = `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.email || "";

    if (sortMode === "alpha-asc") return aName.localeCompare(bName);
    if (sortMode === "alpha-desc") return bName.localeCompare(aName);

    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (sortMode === "newest") return bTime - aTime;
    return aTime - bTime;
  });

  const sortedShops = [...shops].sort((a, b) => {
    const aName = a.shopName || a.label || "";
    const bName = b.shopName || b.label || "";
    if (sortMode === "alpha-asc") return aName.localeCompare(bName);
    if (sortMode === "alpha-desc") return bName.localeCompare(aName);
    return 0;
  });

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-blue-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Employee List</h1>
            <p className="text-sm text-blue-700/60">Review employee accounts and approve shop join requests.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name/email"
                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-900"
              />
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as "alpha-asc" | "alpha-desc" | "newest" | "oldest")}
                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-900"
              >
                <option value="alpha-asc">A-Z</option>
                <option value="alpha-desc">Z-A</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>
          <Link href={backHref} className="rounded-xl border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
            {backLabel}
          </Link>
        </div>

        {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}
        {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</div>}

        <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-100/40">
          <h2 className="mb-4 text-lg font-black text-blue-900">Quick Create Employee</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              placeholder="employee@email.com"
              className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-medium text-blue-900 outline-none focus:border-blue-300"
            />
            <div className="relative">
              <input
                type={showCreatePassword ? "text" : "password"}
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="Password (min 8)"
                className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2 pr-10 text-sm font-medium text-blue-900 outline-none focus:border-blue-300"
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-sm text-blue-700/70 hover:bg-blue-50 hover:text-blue-700"
                aria-label={showCreatePassword ? "Hide password" : "Show password"}
                title={showCreatePassword ? "Hide password" : "Show password"}
              >
                {showCreatePassword ? "🙈" : "👁️"}
              </button>
            </div>
            <button
              onClick={handleCreateEmployee}
              disabled={creating}
              className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Employee"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white bg-white p-6 shadow-xl shadow-blue-100/40">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">Unassigned Employees</p>
            <p className="mt-2 text-3xl font-black text-blue-900">{unassignedEmployees.length}</p>
          </div>
          <div className="rounded-3xl border border-white bg-white p-6 shadow-xl shadow-blue-100/40">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">Pending Join Requests</p>
            <p className="mt-2 text-3xl font-black text-blue-900">{joinRequests.length}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-2xl shadow-blue-100/40">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-black text-blue-900">Pending Join Requests</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm font-semibold text-blue-500">Loading requests...</div>
          ) : joinRequests.length === 0 ? (
            <div className="p-6 text-sm font-semibold text-blue-500">No pending join requests.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-widest text-blue-400">
                <tr>
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Requested Shop</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedJoinRequests.map((item) => {
                  const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim() || "-";
                  const busy = resolvingId === item._id;
                  return (
                    <tr key={item._id} className="border-t border-slate-100">
                      <td className="px-5 py-4 font-semibold">{fullName}</td>
                      <td className="px-5 py-4">{item.email}</td>
                      <td className="px-5 py-4">{item.requestedShop?.shopName || item.requestedShop?.label || "-"}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => resolveJoinRequest(item._id, "approve")}
                            disabled={busy}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => resolveJoinRequest(item._id, "reject")}
                            disabled={busy}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Reject
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

        <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-100/40">
          <h2 className="mb-4 text-lg font-black">Employees grouped by shop</h2>
          {loading ? (
            <p className="text-sm font-semibold text-blue-500">Loading...</p>
          ) : shops.length === 0 ? (
            <p className="text-sm font-semibold text-blue-500">No shops found.</p>
          ) : (
            <div className="space-y-3">
              {sortedShops.map((shop) => {
                const shopName = shop.shopName || shop.label || "Unnamed Shop";
                return (
                  <div key={shop._id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-blue-900">{shopName}</p>
                        <p className="text-xs font-semibold text-blue-500">{shop.phoneNumber || "No phone"}</p>
                      </div>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                        {shop.employees.length} employee(s)
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-blue-700/80">
                      {shop.employees.length === 0
                        ? "No employees assigned"
                        : shop.employees
                            .map((employee) => `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.email)
                            .join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-2xl shadow-blue-100/40">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-black text-blue-900">Employee Accounts</h2>
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
          {loading ? (
            <div className="p-6 text-sm font-semibold text-blue-500">Loading employee list...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-6 text-sm font-semibold text-blue-500">No employee accounts found.</div>
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
                {filteredEmployees.map((employee) => {
                  const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || "-";
                  const busy = actionUserId === employee._id;

                  return (
                    <tr key={employee._id} className="border-t border-slate-100">
                      <td className="px-5 py-4 font-semibold">{fullName}</td>
                      <td className="px-5 py-4">{employee.email}</td>
                      <td className="px-5 py-4">{employee.phoneNumber || "-"}</td>
                      <td className="px-5 py-4">{employee.address || "-"}</td>
                      <td className="px-5 py-4">
                        <select
                          value={employee.role}
                          disabled={busy}
                          onChange={(event) => handleChangeRole(employee, event.target.value as "user" | "rider" | "admin" | "employee")}
                          className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-semibold text-blue-900"
                        >
                          <option value="user">user</option>
                          <option value="rider">rider</option>
                          <option value="employee">employee</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${employee.isBanned ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                          {employee.isBanned ? "Banned" : "Active"}
                        </span>
                        {employee.isBanned && (
                          <div className="mt-1 text-[11px] font-semibold text-rose-500">
                            {employee.banEndAt ? `Until ${formatDate(employee.banEndAt)}` : "Permanent"}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-blue-700/80">
                        {employee.isBanned ? formatDate(employee.banStartAt) : "-"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {employee.isBanned ? (
                            <button
                              disabled={busy}
                              onClick={() => handleUnban(employee)}
                              className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Unban
                            </button>
                          ) : (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => handleBanPermanent(employee)}
                                className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                Ban Permanent
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => handleBanDays(employee)}
                                className="rounded-lg border border-orange-200 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                              >
                                Ban Days
                              </button>
                            </>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => handleChangePassword(employee)}
                            className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            Password
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => handleDeleteUser(employee)}
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
    </div>
  );
}
