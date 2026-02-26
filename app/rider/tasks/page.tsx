"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import "leaflet/dist/leaflet.css";

// Dynamic imports for Leaflet
const MapContainer = dynamic(
    () => import("react-leaflet").then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import("react-leaflet").then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import("react-leaflet").then((mod) => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import("react-leaflet").then((mod) => mod.Popup),
    { ssr: false }
);
const MapController = dynamic(
    () => import('react-leaflet').then((mod) => {
        const { useMap } = mod;
        return function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
            const map = useMap();
            useEffect(() => {
                map.setView(center, zoom);
            }, [center, zoom, map]);
            return null;
        };
    }),
    { ssr: false }
);

interface Task {
    _id: string;
    productName: string;
    customerName?: string;
    contactPhone: string;
    pickupAddress: string;
    deliveryAddress: string;
    status: 'pending' | 'assigned' | 'picked_up' | 'at_shop' | 'washing' | 'laundry_done' | 'out_for_delivery' | 'completed' | 'cancelled';
    totalPrice: number;
    pickupType?: 'now' | 'schedule';
    pickupLocation?: {
        type: string;
        coordinates: [number, number]; // [lon, lat]
    };
    location?: {
        lat: number;
        lon: number;
    };
    images?: string[];
    description?: string;
    createdAt: string;
}

type Shop = {
    _id: string;
    shopName?: string;
    label?: string;
    totalWashingMachines?: number;
    machineInUse?: number;
    machineAvailable?: number;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '⏳' },
    assigned: { label: 'Assigned', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '🚴' },
    picked_up: { label: 'Picked Up', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: '📦' },
    at_shop: { label: 'At Shop', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', icon: '🏪' },
    washing: { label: 'Washing', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: '🫧' },
    laundry_done: { label: 'Laundry Done', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '🧺' },
    out_for_delivery: { label: 'Out For Delivery', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '🚚' },
    completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '✅' },
    cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '❌' },
};

export default function MyTasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [shops, setShops] = useState<Shop[]>([]);
    const [handoverShopByOrderId, setHandoverShopByOrderId] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => {
        fetchTasks();
        fetchShops();
    }, []);

    // Polling fallback: refresh tasks every 5 seconds for real-time updates
    useEffect(() => {
        const interval = setInterval(() => {
            fetchTasks();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const data = await apiFetch("/rider/my-tasks");
            setTasks(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unknown error occurred");
        } finally {
            setLoading(false);
        }
    };

    const fetchShops = async () => {
        try {
            const data = (await apiFetch('/map/shops')) as Shop[];
            setShops(Array.isArray(data) ? data : []);
        } catch {
            setShops([]);
        }
    };

    const handoverToShop = async (orderId: string) => {
        const shopId = handoverShopByOrderId[orderId];
        if (!shopId) {
            alert('Please select a shop first');
            return;
        }

        setUpdatingId(orderId);
        try {
            await apiFetch(`/rider/handover/${orderId}`, {
                method: 'PATCH',
                body: JSON.stringify({ shopId }),
            });
            await fetchTasks();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to handover to shop');
        } finally {
            setUpdatingId(null);
        }
    };

    const startReturnDelivery = async (orderId: string) => {
        setUpdatingId(orderId);
        try {
            await apiFetch(`/rider/return-delivery/${orderId}`, { method: 'PATCH' });
            await fetchTasks();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to start return delivery');
        } finally {
            setUpdatingId(null);
        }
    };

    const completeDelivery = async (orderId: string) => {
        setUpdatingId(orderId);
        try {
            await apiFetch(`/rider/complete-delivery/${orderId}`, { method: 'PATCH' });
            await fetchTasks();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to complete delivery');
        } finally {
            setUpdatingId(null);
        }
    };

    const updateStatus = async (orderId: string, newStatus: string) => {
        if (newStatus === 'pending' && !confirm('คุณแน่ใจหรือไม่ว่าต้องการส่งเป้าคืนสู๋ Dashboard เพื่อให้ไรเดอร์คนอื่นรับต่อ?')) return;
        if (newStatus === 'cancelled' && !confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคำสั่งซื้อนี้อย่างถาวร?')) return;

        setUpdatingId(orderId);
        try {
            await apiFetch(`/rider/status/${orderId}`, {
                method: "PATCH",
                body: JSON.stringify({ status: newStatus }),
            });
            await fetchTasks();
            if (selectedTask?._id === orderId) {
                const updated = await apiFetch(`/rider/my-tasks`);
                const match = updated.find((t: Task) => t._id === orderId);
                setSelectedTask(match || null);
            }
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : "Failed to update status");
        } finally {
            setUpdatingId(null);
        }
    };

    // Custom task marker icon (Blue pulse)
    const taskIcon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const L = require('leaflet');
        return L.divIcon({
            className: 'custom-task-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="absolute h-8 w-8 rounded-full bg-blue-500/20 animate-ping"></div>
                    <div class="h-5 w-5 rounded-full bg-blue-600 border-2 border-white shadow-xl ring-4 ring-blue-600/10"></div>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
        });
    }, []);

    const activeTasks = tasks.filter(t => !['completed', 'cancelled'].includes(t.status));

    const mapPos = useMemo(() => {
        if (activeTasks.length > 0) {
            const task = activeTasks[0];
            const lat = task.location?.lat || task.pickupLocation?.coordinates?.[1];
            const lon = task.location?.lon || task.pickupLocation?.coordinates?.[0];
            if (lat && lon) return { center: [lat, lon] as [number, number], zoom: 14 };
        }
        return { center: [13.7563, 100.5018] as [number, number], zoom: 12 };
    }, [activeTasks]);

    if (loading)
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        );

    return (
        <div className="p-12 relative min-h-screen flex flex-col">
            <header className="mb-12">
                <h1 className="text-4xl font-black text-blue-900 tracking-tight mb-2 uppercase">My Tasks</h1>
                <p className="text-blue-700/60 font-bold uppercase tracking-widest text-[10px]">Managing your active and past deliveries.</p>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 flex-1">
                {/* Task List Column */}
                <div className="xl:col-span-2 space-y-6">
                    {activeTasks.length === 0 ? (
                        <div className="bg-white rounded-[2.5rem] p-12 text-center border border-slate-100 shadow-xl shadow-blue-900/5">
                            <span className="text-5xl mb-6 block">✨</span>
                            <h3 className="text-xl font-bold text-blue-900 mb-2">No active tasks</h3>
                            <p className="text-blue-700/60">Ready to earn? Check available orders!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {activeTasks.map((task) => {
                                const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.assigned;
                                return (
                                    <div
                                        key={task._id}
                                        className="bg-white rounded-[2rem] p-8 border border-white shadow-2xl shadow-blue-100/50 hover:-translate-y-1 transition-all group flex flex-col"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex-1 min-w-0 mr-4">
                                                <h3 className="text-lg font-black text-blue-900 truncate">
                                                    {task.customerName || task.productName || 'Order #' + task._id.slice(-4)}
                                                </h3>
                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1">
                                                    {new Date(task.createdAt).toLocaleDateString('th-TH', {
                                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </p>
                                            </div>
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${cfg.color} ${cfg.bg}`}>
                                                <span>{cfg.icon}</span> {cfg.label}
                                            </span>
                                        </div>

                                        <div className="space-y-3 mb-8 flex-1">
                                            <div className="flex items-start gap-3">
                                                <span className="text-sm">📍</span>
                                                <p className="text-xs font-bold text-slate-500 line-clamp-2">{task.pickupAddress}</p>
                                            </div>
                                            {task.totalPrice > 0 && (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm">💰</span>
                                                    <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Earnings: ฿{task.totalPrice}</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSelectedTask(task)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-blue-900 text-[10px] font-black px-4 py-3 rounded-xl hover:bg-slate-100 transition-colors uppercase tracking-widest"
                                            >
                                                Details
                                            </button>
                                            {task.status === 'assigned' && (
                                                <button
                                                    onClick={() => updateStatus(task._id, 'picked_up')}
                                                    disabled={updatingId === task._id}
                                                    className="flex-1 bg-blue-600 text-white text-[10px] font-black px-4 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 uppercase tracking-widest disabled:opacity-50"
                                                >
                                                    {updatingId === task._id ? '...' : 'Pick Up'}
                                                </button>
                                            )}
                                            {task.status === 'picked_up' && (
                                                <div className="flex flex-1 gap-2">
                                                    {task.pickupType === 'now' && (
                                                        <p className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                            Priority service: choose shop with available machine
                                                        </p>
                                                    )}
                                                    <select
                                                        value={handoverShopByOrderId[task._id] || ''}
                                                        onChange={(e) =>
                                                            setHandoverShopByOrderId((prev) => ({
                                                                ...prev,
                                                                [task._id]: e.target.value,
                                                            }))
                                                        }
                                                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-3 text-[10px] font-black text-blue-900 uppercase tracking-widest"
                                                    >
                                                        <option value="" disabled>
                                                            Select Shop
                                                        </option>
                                                        {shops.map((s) => (
                                                            <option
                                                                key={s._id}
                                                                value={s._id}
                                                                disabled={task.pickupType === 'now' && (Number(s.machineAvailable) || 0) <= 0}
                                                            >
                                                                {`${(s.shopName || s.label || 'Shop').toUpperCase()} (${Number(s.machineAvailable) || 0}/${Number(s.totalWashingMachines) || 10})`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        onClick={() => handoverToShop(task._id)}
                                                        disabled={updatingId === task._id}
                                                        className="bg-sky-600 text-white text-[10px] font-black px-4 py-3 rounded-xl hover:bg-sky-700 transition-colors shadow-lg shadow-sky-100 uppercase tracking-widest disabled:opacity-50"
                                                    >
                                                        {updatingId === task._id ? '...' : 'Send'}
                                                    </button>
                                                </div>
                                            )}

                                            {task.status === 'laundry_done' && (
                                                <button
                                                    onClick={() => startReturnDelivery(task._id)}
                                                    disabled={updatingId === task._id}
                                                    className="flex-1 bg-blue-600 text-white text-[10px] font-black px-4 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 uppercase tracking-widest disabled:opacity-50"
                                                >
                                                    {updatingId === task._id ? '...' : 'Return Delivery'}
                                                </button>
                                            )}

                                            {task.status === 'out_for_delivery' && (
                                                <button
                                                    onClick={() => completeDelivery(task._id)}
                                                    disabled={updatingId === task._id}
                                                    className="flex-1 bg-emerald-600 text-white text-[10px] font-black px-4 py-3 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 uppercase tracking-widest disabled:opacity-50"
                                                >
                                                    {updatingId === task._id ? '...' : 'Complete'}
                                                </button>
                                            )}

                                            {(task.status === 'assigned' || task.status === 'picked_up') && (
                                                <div className="flex flex-col gap-1 flex-1">
                                                    <button
                                                        onClick={() => updateStatus(task._id, 'cancelled')}
                                                        disabled={updatingId === task._id}
                                                        className="w-full py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all disabled:opacity-50"
                                                    >
                                                        {updatingId === task._id ? '...' : 'ยกเลิกออเดอร์'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Past Tasks / History */}
                    <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-100/50 border border-white mt-12">
                        <h3 className="text-xl font-black text-blue-900 mb-8 uppercase tracking-tight">Recent History</h3>
                        <div className="space-y-4">
                            {tasks.filter(t => t.status === 'completed').slice(0, 5).map(task => {
                                const cfg = STATUS_CONFIG[task.status];
                                return (
                                    <div key={task._id} className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 flex items-center justify-center bg-white rounded-xl border border-slate-100 shadow-sm text-lg">
                                                {cfg.icon}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-blue-900">{task.customerName || task.productName || 'Order #' + task._id.slice(-4)}</h4>
                                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-0.5">
                                                    {new Date(task.createdAt).toLocaleDateString('th-TH')} • ฿{task.totalPrice}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${cfg.color} ${cfg.bg}`}>
                                            {cfg.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Map/Status Column */}
                <div className="space-y-8 h-fit sticky top-32">
                    <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl shadow-blue-900/10 border border-white h-[500px]">
                        {typeof window !== 'undefined' && (
                            <MapContainer
                                center={mapPos.center}
                                zoom={mapPos.zoom}
                                style={{ height: "100%", width: "100%" }}
                            >
                                <TileLayer
                                    attribution="&copy; OpenStreetMap"
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <MapController center={mapPos.center} zoom={mapPos.zoom} />

                                {activeTasks.map((task) => {
                                    const lat = task.location?.lat || task.pickupLocation?.coordinates?.[1];
                                    const lon = task.location?.lon || task.pickupLocation?.coordinates?.[0];

                                    if (!lat || !lon || !taskIcon) return null;

                                    return (
                                        <Marker key={task._id} position={[lat, lon]} icon={taskIcon}>
                                            <Popup>
                                                <div className="p-2 w-32">
                                                    <p className="font-black text-blue-900 text-xs mb-1 truncate">
                                                        {task.customerName || task.productName || 'Order #' + task._id.slice(-4)}
                                                    </p>
                                                    <p className="text-[9px] text-slate-500 font-bold mb-2 line-clamp-2">{task.pickupAddress}</p>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTask(task);
                                                        }}
                                                        className="w-full bg-blue-600 text-white text-[9px] font-black py-1.5 rounded-lg uppercase"
                                                    >
                                                        Details
                                                    </button>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-10">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-blue-900 tracking-tight">{selectedTask.customerName || selectedTask.productName}</h3>
                                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mt-1">ID: {selectedTask._id}</p>
                                </div>
                                <button onClick={() => setSelectedTask(null)} className="h-10 w-10 flex items-center justify-center bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">✕</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                <div className="space-y-6">
                                    <section>
                                        <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Customer Contact</h4>
                                        <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                            📞 {selectedTask.contactPhone || 'No phone provided'}
                                        </p>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Pickup Location</h4>
                                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <p className="text-xs font-bold text-slate-600 leading-relaxed">{selectedTask.pickupAddress}</p>
                                        </div>
                                    </section>

                                    {selectedTask.description && (
                                        <section>
                                            <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Additional Notes</h4>
                                            <p className="text-xs font-medium text-slate-500 leading-relaxed italic">"{selectedTask.description}"</p>
                                        </section>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    <section>
                                        <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Order Status</h4>
                                        <div className="flex items-center gap-3">
                                            <div className="h-3 w-3 rounded-full bg-blue-600 animate-pulse"></div>
                                            <p className="text-sm font-black text-blue-900 uppercase tracking-widest">{selectedTask.status.replace('_', ' ')}</p>
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Earnings</h4>
                                        <p className="text-2xl font-black text-blue-900">฿{selectedTask.totalPrice}</p>
                                    </section>

                                    {selectedTask.images && selectedTask.images.length > 0 && (
                                        <section>
                                            <h4 className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">Basket Photos</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {selectedTask.images.map((img, i) => (
                                                    <img key={i} src={`${API_BASE_URL}${img}`} alt="Basket" className="h-20 w-full object-cover rounded-xl border border-slate-200" />
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-6 border-t border-slate-100">
                                <button
                                    onClick={() => setSelectedTask(null)}
                                    className="flex-1 px-8 py-4 bg-slate-50 text-blue-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all font-sans"
                                >
                                    Close
                                </button>
                                {['assigned', 'picked_up'].includes(selectedTask.status) && (
                                    <div className="flex-1 flex flex-col gap-2">
                                        <button
                                            onClick={() => updateStatus(selectedTask._id, 'pending')}
                                            disabled={updatingId === selectedTask._id}
                                            className="w-full px-8 py-4 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-amber-100 transition-all font-sans disabled:opacity-50"
                                        >
                                            {updatingId === selectedTask._id ? '...' : 'คืนงาน (ส่งกลับ Dashboard)'}
                                        </button>
                                        <button
                                            onClick={() => updateStatus(selectedTask._id, 'cancelled')}
                                            disabled={updatingId === selectedTask._id}
                                            className="w-full px-8 py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-all font-sans disabled:opacity-50"
                                        >
                                            {updatingId === selectedTask._id ? '...' : 'ยกเลิกออเดอร์อย่างถาวร'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = `
  .custom-task-icon {
    background: transparent;
    border: none;
  }
`;
