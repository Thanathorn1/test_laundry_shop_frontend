"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getWeightCategoryLabel } from '@/lib/pricing';

type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'at_shop'
  | 'washing'
  | 'drying'
  | 'laundry_done'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

interface Order {
  _id: string;
  productName: string;
  status: OrderStatus;
  totalPrice: number;
  createdAt: string;
  pickupType?: 'now' | 'schedule';
  pickupAt?: string | null;
  laundryType?: 'wash' | 'dry';
  weightCategory?: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';
  serviceTimeMinutes?: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '⏳' },
  assigned: { label: 'Assigned', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '🚴' },
  picked_up: { label: 'Picked Up', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: '📦' },
  at_shop: { label: 'At Shop', color: 'text-fuchsia-700', bg: 'bg-fuchsia-50 border-fuchsia-200', icon: '🏪' },
  washing: { label: 'Washing', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', icon: '🧺' },
  drying: { label: 'Drying', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: '💨' },
  laundry_done: { label: 'Laundry Done', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '✨' },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', icon: '🛵' },
  completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '✅' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '❌' },
};

function getRoleFromAccessToken(token: string | null): 'user' | 'rider' | 'admin' | null {
  if (!token) return null;
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;

    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { role?: string };

    if (parsed.role === 'admin' || parsed.role === 'rider' || parsed.role === 'user') {
      return parsed.role;
    }
    return null;
  } catch {
    return null;
  }
}

export default function CustomerHistoryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminSession, setIsAdminSession] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const tokenRole = getRoleFromAccessToken(token);
    const authRole = localStorage.getItem('auth_role') || tokenRole;
    if (tokenRole && localStorage.getItem('auth_role') !== tokenRole) {
      localStorage.setItem('auth_role', tokenRole);
    }
    setIsAdminSession(authRole === 'admin');

    async function loadData() {
      try {
        const [ordersData, profileData] = await Promise.all([
          apiFetch('/customers/orders'),
          apiFetch('/customers/me'),
        ]);
        setOrders(Array.isArray(ordersData) ? (ordersData as Order[]) : []);
        if ((profileData as { role?: string })?.role === 'admin') {
          setIsAdminSession(true);
          localStorage.setItem('auth_role', 'admin');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('unauthorized')) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_role');
          localStorage.removeItem('auth_role');
          router.replace('/');
          return;
        }
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  const historyOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders]);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-blue-900">
      <aside className="hidden md:block w-72 border-r border-slate-200 bg-white p-8 shadow-sm h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-white font-black text-xl">C</span>
          </div>
          <h2 className="text-xl font-black text-blue-900 tracking-tight uppercase">Laundry Client</h2>
        </div>
        <nav className="space-y-1.5">
          <Link href="/customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
            <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🏠</span>
            Dashboard
          </Link>
          <Link href="/customer/create-order" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
            <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">➕</span>
            New Order
          </Link>
          <Link href="/customer/history" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold bg-blue-50 text-blue-700 shadow-sm transition-all border border-blue-100">
            <span className="mr-3 text-lg">🗒️</span>
            History
          </Link>

          {isAdminSession && (
            <>
              <div className="px-4 pt-4 text-[10px] font-black text-blue-300 uppercase tracking-widest">Admin</div>
              <Link href="/admin/customers?from=customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/70 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                <span className="mr-3 text-lg opacity-60 group-hover:opacity-100">👤</span>
                Customer List
              </Link>
              <Link href="/admin/riders?from=customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/70 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                <span className="mr-3 text-lg opacity-60 group-hover:opacity-100">🛵</span>
                Rider List
              </Link>
              <Link href="/admin/admins?from=customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/70 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                <span className="mr-3 text-lg opacity-60 group-hover:opacity-100">🛡️</span>
                Admin List
              </Link>
              <Link href="/admin/employees?from=customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/70 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                <span className="mr-3 text-lg opacity-60 group-hover:opacity-100">🧑‍🔧</span>
                Employee List
              </Link>
              <Link href="/admin/pin-shop?from=customer" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/70 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                <span className="mr-3 text-lg opacity-60 group-hover:opacity-100">📍</span>
                Pin Shop
              </Link>
            </>
          )}

          <div className="pt-6 mt-6 border-t border-slate-100">
            <button
              onClick={() => {
                localStorage.clear();
                window.location.href = '/';
              }}
              className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 transition-all group"
            >
              <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🚪</span>
              Logout
            </button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-8 pb-24 md:p-12 md:pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-blue-900">Order History</h1>
          <p className="text-blue-700/60 text-lg font-medium mt-2">View all your laundry orders and statuses.</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-blue-100 bg-white p-10 shadow-sm">
            <p className="text-sm font-semibold text-blue-500">Loading history...</p>
          </div>
        ) : historyOrders.length === 0 ? (
          <div className="rounded-3xl border border-blue-100 bg-white p-14 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl">✨</div>
            <h3 className="text-2xl font-black tracking-tight text-blue-900">No order history yet</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">Create your first order to start tracking laundry history.</p>
            <Link href="/customer/create-order" className="mt-6 inline-flex items-center rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 hover:bg-blue-700">
              Create Order
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {historyOrders.map((order) => {
              const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              const pickupAtText = order.pickupAt ? new Date(order.pickupAt).toLocaleString() : '-';
              const createdAtText = order.createdAt ? new Date(order.createdAt).toLocaleString() : '-';

              return (
                <article key={order._id} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-blue-900">{order.productName || 'Laundry Order'}</h3>
                      <p className="text-xs font-semibold text-slate-500 mt-1">Order ID: {order._id}</p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${status.bg} ${status.color}`}>
                      <span>{status.icon}</span>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Created</p>
                      <p className="mt-1 text-slate-700">{createdAtText}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Pickup</p>
                      <p className="mt-1 text-slate-700">{order.pickupType === 'schedule' ? pickupAtText : 'Now'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Service</p>
                      <p className="mt-1 text-slate-700">
                        {(order.laundryType || 'wash').toUpperCase()} • {getWeightCategoryLabel(order.weightCategory || 's')}
                        {order.laundryType === 'dry' && order.serviceTimeMinutes ? ` • ${order.serviceTimeMinutes} min` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Total</p>
                      <p className="mt-1 text-emerald-700 font-black">฿{Number(order.totalPrice || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-2">
          <Link href="/customer" className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70">
            <span className="text-base">🏠</span>
            Dashboard
          </Link>
          <Link href="/customer/create-order" className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70">
            <span className="text-base">➕</span>
            New Order
          </Link>
          <Link href="/customer/history" className="flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-black text-blue-700">
            <span className="text-base">🗒️</span>
            History
          </Link>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/';
            }}
            className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-rose-500"
          >
            <span className="text-base">🚪</span>
            Logout
          </button>
        </div>
      </footer>
    </div>
  );
}
