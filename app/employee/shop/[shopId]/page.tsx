"use client";

import { useEffect, useState } from 'react';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { calculateOrderPriceSummary, getWashUnitPrice, getWeightCategoryLabel } from '@/lib/pricing';

type EmployeeInfo = {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type CustomerInfo = {
  _id?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
};

type ShopOrder = {
  _id: string;
  productName?: string;
  status: string;
  laundryType?: 'wash' | 'dry';
  weightCategory?: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';
  serviceTimeMinutes?: number;
  pickupType?: 'now' | 'schedule';
  pickupAddress?: string;
  deliveryAddress?: string;
  totalPrice?: number;
  images?: string[];
  customerId?: CustomerInfo;
  employeeId?: EmployeeInfo;
};

type MyEmployeeProfile = {
  _id: string;
  assignedShopId?: string | null;
  assignedShopIds?: string[];
};

type JoinRequestEmployee = {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

function resolveAssetUrl(value?: string) {
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/')) {
    return value;
  }
  return `${ASSET_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

function getUserIdFromAccessToken(token: string | null) {
  if (!token) return null;
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;

    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { sub?: string };
    return typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub.trim() : null;
  } catch {
    return null;
  }
}

export default function EmployeeShopPage() {
  const params = useParams<{ shopId: string }>();
  const shopId = String(params?.shopId || '');
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [me, setMe] = useState<MyEmployeeProfile | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequestEmployee[]>([]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinActionId, setJoinActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMemberOfShop = (value: MyEmployeeProfile | null, targetShopId: string) => {
    if (!value || !targetShopId) return false;
    if (value.assignedShopId && String(value.assignedShopId) === String(targetShopId)) return true;
    return Array.isArray(value.assignedShopIds) && value.assignedShopIds.map(String).includes(String(targetShopId));
  };

  const canManageJoinRequests = isMemberOfShop(me, shopId);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    if (!shopId) {
      setOrders([]);
      if (!silent) setLoading(false);
      return;
    }
    try {
      const data = await apiFetch(`/employee/shops/${shopId}/orders`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load shop orders';
      if (!silent) setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [shopId]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userId = getUserIdFromAccessToken(token);
    if (!userId || !shopId) return;

    const socketBaseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const socket = io(socketBaseUrl, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('register', { userId, shopId });
    });

    socket.on('order:update', (order: any) => {
      const incomingShopId = order?.shopId ? String(order.shopId) : '';
      if (incomingShopId && incomingShopId === shopId) {
        fetchOrders(true);
      }
    });

    return () => {
      socket.off('order:update');
      socket.disconnect();
    };
  }, [shopId]);

  // Polling fallback: refresh orders every 5 seconds for real-time updates
  useEffect(() => {
    if (!shopId) return;
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [shopId]);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const meData = (await apiFetch('/customers/me')) as MyEmployeeProfile;
        setMe(meData);
      } catch {
        setMe(null);
      }
    };
    loadMe();
  }, []);

  useEffect(() => {
    const loadJoinRequests = async () => {
      if (!shopId || !canManageJoinRequests) {
        setJoinRequests([]);
        return;
      }

      try {
        setJoinLoading(true);
        const data = await apiFetch(`/employee/shops/${shopId}/join-requests`);
        setJoinRequests(Array.isArray(data) ? data : []);
      } catch {
        setJoinRequests([]);
      } finally {
        setJoinLoading(false);
      }
    };

    loadJoinRequests();
  }, [shopId, canManageJoinRequests]);

  const resolveJoinRequest = async (employeeId: string, action: 'approve' | 'reject') => {
    try {
      setJoinActionId(employeeId);
      await apiFetch(`/employee/join-requests/${employeeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      const data = await apiFetch(`/employee/shops/${shopId}/join-requests`);
      setJoinRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to resolve join request');
    } finally {
      setJoinActionId(null);
    }
  };

  const startWash = async (orderId: string) => {
    try {
      await apiFetch(`/employee/orders/${orderId}/start-wash`, { method: 'PATCH' });
      fetchOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to start wash');
    }
  };

  const finishWash = async (orderId: string) => {
    try {
      await apiFetch(`/employee/orders/${orderId}/finish-wash`, { method: 'PATCH' });
      fetchOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to finish wash');
    }
  };

  const finishDry = async (orderId: string) => {
    try {
      await apiFetch(`/employee/orders/${orderId}/finish-dry`, { method: 'PATCH' });
      fetchOrders();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to finish dry');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-blue-900 tracking-tight">Shop Orders</h1>
        <p className="text-blue-700/60 text-sm font-medium">Update laundry steps for each order in this shop.</p>
      </div>

      {loading && <p className="text-sm text-blue-700/70">Loading orders...</p>}
      {error && <p className="text-sm text-rose-600">Error: {error}</p>}

      {canManageJoinRequests && (
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-blue-900">Join Requests</h2>
          {joinLoading ? (
            <p className="mt-3 text-sm text-blue-600">Loading join requests...</p>
          ) : joinRequests.length === 0 ? (
            <p className="mt-3 text-sm text-blue-600">No pending requests.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {joinRequests.map((item) => {
                const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email;
                const busy = joinActionId === item._id;
                return (
                  <div key={item._id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div>
                      <p className="text-sm font-bold text-blue-900">{fullName}</p>
                      <p className="text-xs text-blue-600">{item.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveJoinRequest(item._id, 'approve')}
                        disabled={busy}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => resolveJoinRequest(item._id, 'reject')}
                        disabled={busy}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {orders.map((order) => {
          const customerName = `${order.customerId?.firstName || ''} ${order.customerId?.lastName || ''}`.trim() || 'Customer';
          const employeeName = `${order.employeeId?.firstName || ''} ${order.employeeId?.lastName || ''}`.trim() || order.employeeId?.email || '-';
          const isDryOnlyLaundry = order.laundryType === 'dry';
          const canStartWash = !isDryOnlyLaundry && order.status === 'at_shop';
          const canFinishWash = !isDryOnlyLaundry && order.status === 'washing';
          const canStartDry = isDryOnlyLaundry && order.status === 'at_shop';
          const canFinishDry = order.status === 'drying';
          const isLaundryDone = order.status === 'laundry_done';
          const statusLabel = order.status;
          const stageLabel = (() => {
            if (isLaundryDone) return isDryOnlyLaundry ? 'Stage: อบผ้าเสร็จแล้ว' : 'Stage: ซัก+อบผ้าเสร็จแล้ว';
            if (order.status === 'washing') return 'Stage: กำลังซัก';
            if (order.status === 'drying') return 'Stage: กำลังอบผ้า';
            if (order.status === 'at_shop') return isDryOnlyLaundry ? 'Stage: รอเริ่มอบผ้า' : 'Stage: รอเริ่มซัก';
            return isDryOnlyLaundry ? 'Stage: เตรียมอบผ้า' : 'Stage: เตรียมซัก';
          })();
          const dryStageLabel = (() => {
            if (isLaundryDone) return 'Dry Stage (อบผ้า): เสร็จแล้ว';
            if (order.status === 'drying') return 'Dry Stage (อบผ้า): กำลังอบผ้า';
            if (order.status === 'washing') return 'Dry Stage (อบผ้า): รอคิวหลังซัก';
            if (order.status === 'at_shop') return 'Dry Stage (อบผ้า): รอเริ่ม';
            return 'Dry Stage (อบผ้า): เตรียมงาน';
          })();
          const displayServiceTime = typeof order.serviceTimeMinutes === 'number' ? order.serviceTimeMinutes : 50;
          const unitPrice = isDryOnlyLaundry ? 20 : getWashUnitPrice(order.weightCategory);
          const priceSummary = calculateOrderPriceSummary({
            laundryType: order.laundryType,
            weightCategory: order.weightCategory,
            serviceTimeMinutes: order.serviceTimeMinutes,
            pickupType: order.pickupType,
          });
          const washPrice = priceSummary.washPrice;
          const dryPrice = priceSummary.dryPrice;
          const displayPrice = typeof order.totalPrice === 'number' && order.totalPrice > 0 ? order.totalPrice : priceSummary.totalPrice;

          return (
            <div key={order._id} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-black text-blue-900">{order.productName || 'Laundry Order'}</h3>
                  <p className="text-xs text-blue-600 mt-1">Customer: {customerName}</p>
                  <p className="text-xs text-blue-600">Employee: {employeeName}</p>
                  <p className="text-xs text-blue-600">
                    Type: {isDryOnlyLaundry ? 'Dry Only Laundry (อบผ้า)' : 'Wash + Dry Laundry'}
                    {order.weightCategory ? ` • Weight: ${getWeightCategoryLabel(order.weightCategory)}` : ''}
                    {typeof order.serviceTimeMinutes === 'number' ? ` • Drying: ${order.serviceTimeMinutes} min` : ''}
                  </p>
                  <p className="text-xs font-bold text-purple-700">Dry Step: อบผ้า</p>
                  <p className="text-xs font-bold text-indigo-700">{stageLabel}</p>
                  <p className="text-xs font-bold text-purple-700">{dryStageLabel}</p>
                </div>
                <span className="rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">{statusLabel}</span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
                <p><span className="font-black text-blue-900">Pickup:</span> {order.pickupAddress || '-'}</p>
                <p><span className="font-black text-blue-900">Delivery:</span> {order.deliveryAddress || '-'}</p>
              </div>
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-sm font-black text-emerald-800">Price: ฿{displayPrice.toLocaleString()}</p>
                <p className="text-[11px] font-semibold text-emerald-700/90">สูตรซัก: {isDryOnlyLaundry ? '0 บาท (Dry only)' : `(${displayServiceTime} ÷ 50) × ${unitPrice} บาท`}</p>
                <p className="text-[11px] font-semibold text-emerald-700/90">สูตรอบผ้า: ({displayServiceTime} ÷ 50) × 20 บาท</p>
                <p className="text-[11px] font-semibold text-emerald-700/90">รวมค่าซัก/อบ: ฿{(washPrice + dryPrice).toLocaleString()}</p>
                <p className="text-[11px] font-semibold text-emerald-700/90">+ Delivery 50 {order.pickupType === 'now' ? '+ Pickup Now 20' : '+ Pickup Schedule 0'}</p>
              </div>

              {Array.isArray(order.images) && order.images.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-blue-700">Laundry Basket Images</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {order.images.slice(0, 4).map((image, index) => (
                      <div key={`${order._id}-img-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img
                          src={resolveAssetUrl(image)}
                          alt={`Order ${order._id} basket ${index + 1}`}
                          className="h-24 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {canStartWash && (
                  <button
                    onClick={() => startWash(order._id)}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100"
                  >
                    เริ่มซัก
                  </button>
                )}
                {canFinishWash && (
                  <button
                    onClick={() => finishWash(order._id)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                  >
                    เสร็จซัก (ไปขั้นตอนอบผ้า)
                  </button>
                )}
                {canStartDry && (
                  <button
                    onClick={() => startWash(order._id)}
                    className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-purple-700 hover:bg-purple-100"
                  >
                    เริ่มอบผ้า
                  </button>
                )}
                {canFinishDry && (
                  <button
                    onClick={() => finishDry(order._id)}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-100"
                  >
                    เสร็จอบผ้า
                  </button>
                )}
                {isLaundryDone && (
                  <span className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-700">
                    {isDryOnlyLaundry ? 'อบผ้าเสร็จแล้ว' : 'ซัก+อบผ้าเสร็จแล้ว'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
