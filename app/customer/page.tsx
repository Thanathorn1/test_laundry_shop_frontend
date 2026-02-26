"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { io } from 'socket.io-client';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRoute } from '@/lib/road-route';
import { calculateOrderPriceSummary, getWashUnitPrice, getWeightCategoryLabel } from '@/lib/pricing';

const MapContainer = dynamic(
    () => import('react-leaflet').then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then((mod) => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import('react-leaflet').then((mod) => mod.Popup),
    { ssr: false }
);
const Polyline = dynamic(
    () => import('react-leaflet').then((mod) => mod.Polyline),
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

type LatLng = { lat: number; lng: number };

type LeafletMarker = {
    addTo: (map: LeafletMap) => LeafletMarker;
    on: (event: string, handler: () => void) => void;
    getLatLng: () => LatLng;
    setLatLng: (latLng: LatLng) => void;
};

type LeafletMap = {
    on: (event: string, handler: (event: { latlng: LatLng }) => void) => void;
    panTo: (latLng: [number, number]) => void;
    remove: () => void;
};

type LeafletLib = {
    map: (container: HTMLElement, options: { center: [number, number]; zoom: number }) => LeafletMap;
    tileLayer: (url: string, options: { maxZoom: number }) => { addTo: (map: LeafletMap) => void };
    marker: (latLng: [number, number], options: { draggable: boolean }) => LeafletMarker;
};

const DEFAULT_PICKUP = { lat: 13.7563, lng: 100.5018 };

function getRoleFromAccessToken(token: string | null): 'user' | 'rider' | 'admin' | null {
    if (!token) return null;
    try {
        const payloadBase64 = token.split('.')[1];
        if (!payloadBase64) return null;

        const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const json = atob(padded);
        const parsed = JSON.parse(json) as { role?: string };

        if (parsed.role === 'admin' || parsed.role === 'rider' || parsed.role === 'user') {
            return parsed.role;
        }
        return null;
    } catch {
        return null;
    }
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

async function loadLeaflet() {
    if (typeof window === 'undefined') return null;
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
        const existingScript = document.querySelector('script[data-leaflet="true"]') as HTMLScriptElement | null;
        if (existingScript) {
            if ((window as any).L) {
                resolve();
                return;
            }
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () => reject(new Error('Failed to load leaflet')));
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

interface Order {
    _id: string;
    productName: string;
    contactPhone: string;
    status: 'pending' | 'assigned' | 'picked_up' | 'at_shop' | 'washing' | 'drying' | 'laundry_done' | 'out_for_delivery' | 'completed' | 'cancelled';
    pickupAddress: string | null;
    pickupType: 'now' | 'schedule';
    pickupAt: string | null;
    totalPrice: number;
    laundryType?: 'wash' | 'dry';
    weightCategory?: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';
    serviceTimeMinutes?: number;
    createdAt: string;
    deliveryAddress?: string | null;
    riderId?: string | null;
    shopId?: string | null;
    images?: string[];
    description?: string;
    pickupLocation?: {
        type: 'Point';
        coordinates: number[];
    };
    deliveryLocation?: {
        type: 'Point';
        coordinates: number[];
    };
}

interface Shop {
    _id: string;
    shopName?: string;
    label?: string;
    location?: { coordinates?: number[] };
}

interface CustomerProfile {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    role?: 'user' | 'rider' | 'admin';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
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

export default function CustomerPage() {
    const router = useRouter();
    const editMapContainerRef = useRef<HTMLDivElement | null>(null);
    const editMapInstanceRef = useRef<LeafletMap | null>(null);
    const editMarkerRef = useRef<LeafletMarker | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [profile, setProfile] = useState<CustomerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [editProductName, setEditProductName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editContactPhone, setEditContactPhone] = useState('');
    const [editBasketPhotos, setEditBasketPhotos] = useState<File[]>([]);
    const [editBasketPreviews, setEditBasketPreviews] = useState<string[]>([]);
    const [editPickupLatitude, setEditPickupLatitude] = useState('');
    const [editPickupLongitude, setEditPickupLongitude] = useState('');
    const [editPickupAddress, setEditPickupAddress] = useState('');
    const [editPickupType, setEditPickupType] = useState<'now' | 'schedule'>('now');
    const [editPickupDate, setEditPickupDate] = useState('');
    const [editPickupTime, setEditPickupTime] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isAdminSession, setIsAdminSession] = useState(false);
    const [shops, setShops] = useState<Shop[]>([]);
    const [riderLiveLocation, setRiderLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [trackingMapView, setTrackingMapView] = useState<{ center: [number, number]; zoom: number }>({
        center: [13.7563, 100.5018],
        zoom: 13,
    });
    const [trackingRoutePoints, setTrackingRoutePoints] = useState<[number, number][]>([]);
    const [trackingSummary, setTrackingSummary] = useState<{ label: string; distanceKm: number | null; durationMin: number | null } | null>(null);

    const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null);

    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const refreshTimerRef = useRef<number | null>(null);

    useEffect(() => {
        let active = true;
        import('leaflet')
            .then((mod) => {
                if (active) setLeaflet(mod);
            })
            .catch(() => {
                // ignore leaflet import errors for optional custom icons
            });

        return () => {
            active = false;
        };
    }, []);

    const riderIcon = useMemo(() => {
        if (!leaflet) return null;
        return leaflet.divIcon({
            className: 'customer-rider-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="absolute h-6 w-6 rounded-full bg-blue-500/20 animate-ping"></div>
                    <div class="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-lg ring-2 ring-blue-600/20"></div>
                </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });
    }, [leaflet]);

    const customerIcon = useMemo(() => {
        if (!leaflet) return null;
        return leaflet.divIcon({
            className: 'customer-point-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="h-4 w-4 rounded-full bg-emerald-600 border-2 border-white shadow-lg ring-2 ring-emerald-600/20"></div>
                </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
        });
    }, [leaflet]);

    const shopIcon = useMemo(() => {
        if (!leaflet) return null;
        return leaflet.divIcon({
            className: 'customer-shop-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="h-4 w-4 rounded-full bg-fuchsia-600 border-2 border-white shadow-lg ring-2 ring-fuchsia-600/20"></div>
                </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
        });
    }, [leaflet]);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        const tokenRole = getRoleFromAccessToken(token);
        const authRole = localStorage.getItem('auth_role') || tokenRole;
        if (tokenRole && localStorage.getItem('auth_role') !== tokenRole) {
            localStorage.setItem('auth_role', tokenRole);
        }
        setIsAdminSession(authRole === 'admin');

        async function fetchData() {
            try {
                const [ordersData, profileData, shopsData] = await Promise.all([
                    apiFetch('/customers/orders'),
                    apiFetch('/customers/me'),
                    apiFetch('/map/shops'),
                ]);
                setOrders(ordersData);
                setProfile(profileData);
                setShops(Array.isArray(shopsData) ? shopsData : []);
                if (profileData?.role === 'admin') {
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
                setProfile(null);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [router]);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        const userId = getUserIdFromAccessToken(token);
        if (!userId) return;

        const socketBaseUrl = API_BASE_URL.replace(/\/api\/?$/, '');
        const socket = io(socketBaseUrl, {
            transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('register', { userId });
        });

        socket.on('order:update', () => {
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
            }
            refreshTimerRef.current = window.setTimeout(async () => {
                try {
                    const ordersData = await apiFetch('/customers/orders');
                    setOrders(Array.isArray(ordersData) ? ordersData : []);
                } catch {
                    // ignore transient fetch errors
                }
            }, 250);
        });

        return () => {
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
            socket.off('order:update');
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    // Polling fallback: refresh orders every 5 seconds for real-time status updates
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const ordersData = await apiFetch('/customers/orders');
                setOrders(Array.isArray(ordersData) ? ordersData : []);
            } catch {
                // ignore transient errors
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const urls = editBasketPhotos.map((file) => URL.createObjectURL(file));
        setEditBasketPreviews(urls);

        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [editBasketPhotos]);

    useEffect(() => {
        let mounted = true;

        const setupMap = async () => {
            if (!editingOrder) return;

            const L = await loadLeaflet();
            if (!mounted || !L || !editMapContainerRef.current || editMapInstanceRef.current) {
                return;
            }

            const initialLat = Number(editPickupLatitude) || DEFAULT_PICKUP.lat;
            const initialLng = Number(editPickupLongitude) || DEFAULT_PICKUP.lng;

            const map = L.map(editMapContainerRef.current, {
                center: [initialLat, initialLng],
                zoom: 15,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map);

            const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

            marker.on('dragend', () => {
                const point = marker.getLatLng();
                setEditPickupLatitude(String(point.lat));
                setEditPickupLongitude(String(point.lng));
            });

            map.on('click', (event: { latlng: LatLng }) => {
                const point = event.latlng;
                marker.setLatLng(point);
                setEditPickupLatitude(String(point.lat));
                setEditPickupLongitude(String(point.lng));
            });

            editMapInstanceRef.current = map;
            editMarkerRef.current = marker;
        };

        setupMap();

        return () => {
            mounted = false;
            if (editMapInstanceRef.current) {
                editMapInstanceRef.current.remove();
            }
            editMapInstanceRef.current = null;
            editMarkerRef.current = null;
        };
    }, [editingOrder]);

    useEffect(() => {
        const lat = Number(editPickupLatitude);
        const lng = Number(editPickupLongitude);

        if (Number.isNaN(lat) || Number.isNaN(lng) || !editMarkerRef.current || !editMapInstanceRef.current) {
            return;
        }

        editMarkerRef.current.setLatLng({ lat, lng });
        editMapInstanceRef.current.panTo([lat, lng]);
    }, [editPickupLatitude, editPickupLongitude]);

    const filesToBase64 = async (files: File[]) => {
        const readers = files.map(
            (file) =>
                new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error('Failed to read image'));
                    reader.readAsDataURL(file);
                }),
        );
        return Promise.all(readers);
    };

    const openEdit = (order: Order) => {
        setEditProductName(order.productName);
        setEditDescription(order.description || '');
        setEditContactPhone(order.contactPhone || '');
        setEditPickupAddress(order.pickupAddress || '');
        setEditPickupType(order.pickupType || 'now');
        setEditBasketPhotos([]);

        const coordinates = order.pickupLocation?.coordinates;
        if (Array.isArray(coordinates) && coordinates.length >= 2) {
            setEditPickupLongitude(String(coordinates[0]));
            setEditPickupLatitude(String(coordinates[1]));
        } else {
            setEditPickupLongitude('');
            setEditPickupLatitude('');
        }

        if (order.pickupAt) {
            const pickupDateTime = new Date(order.pickupAt);
            setEditPickupDate(pickupDateTime.toISOString().slice(0, 10));
            setEditPickupTime(pickupDateTime.toISOString().slice(11, 16));
        } else {
            setEditPickupDate('');
            setEditPickupTime('');
        }

        setEditingOrder(order);
    };

    const saveEdit = async () => {
        if (!editingOrder) return;

        const pickupLatitude = Number(editPickupLatitude);
        const pickupLongitude = Number(editPickupLongitude);
        if (Number.isNaN(pickupLatitude) || Number.isNaN(pickupLongitude)) {
            alert('Pickup latitude/longitude must be numbers');
            return;
        }

        if (editPickupType === 'schedule' && (!editPickupDate.trim() || !editPickupTime.trim())) {
            alert('Please select pickup date and time');
            return;
        }

        if (editPickupType === 'schedule') {
            const scheduledAt = new Date(`${editPickupDate}T${editPickupTime}:00`);
            const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
            if (scheduledAt.getTime() < oneHourLater.getTime()) {
                alert('Scheduled pickup must be at least 1 hour from now');
                return;
            }
        }

        const pickupAt =
            editPickupType === 'schedule'
                ? new Date(`${editPickupDate}T${editPickupTime}:00`).toISOString()
                : null;

        setEditSaving(true);
        try {
            const updated = await apiFetch(`/customers/orders/${editingOrder._id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    productName: editProductName,
                    description: editDescription,
                    contactPhone: editContactPhone,
                    pickupLatitude,
                    pickupLongitude,
                    pickupAddress: editPickupAddress,
                    pickupType: editPickupType,
                    pickupAt,
                    images: editBasketPhotos.length ? await filesToBase64(editBasketPhotos) : undefined,
                }),
            });
            setOrders(prev => prev.map(o => o._id === editingOrder._id ? { ...o, ...updated } : o));
            setEditingOrder(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to update order');
        } finally {
            setEditSaving(false);
        }
    };

    const deleteOrder = async (orderId: string) => {
        if (!confirm('Delete this order? This cannot be undone.')) return;
        setDeletingId(orderId);
        try {
            await apiFetch(`/customers/orders/${orderId}`, { method: 'DELETE' });
            setOrders(prev => prev.filter(o => o._id !== orderId));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete order');
        } finally {
            setDeletingId(null);
        }
    };

    const useEditCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported in this browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setEditPickupLatitude(String(position.coords.latitude));
                setEditPickupLongitude(String(position.coords.longitude));
            },
            () => alert('Cannot access current location. Please allow location permission.'),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
    const minEditScheduleDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const editScheduleTimeOptions = useMemo(() => {
        const options: Array<{ value: string; label: string }> = [];
        if (!editPickupDate) return options;

        const now = new Date();
        const nowDate = now.toISOString().slice(0, 10);
        const base = editPickupDate === nowDate ? new Date(now.getTime() + 60 * 60 * 1000) : new Date(`${editPickupDate}T00:00:00`);
        base.setMinutes(Math.ceil(base.getMinutes() / 15) * 15, 0, 0);
        const end = new Date(`${editPickupDate}T23:59:59`);

        for (let cursor = new Date(base); cursor <= end; cursor = new Date(cursor.getTime() + 15 * 60 * 1000)) {
            const hh = String(cursor.getHours()).padStart(2, '0');
            const mm = String(cursor.getMinutes()).padStart(2, '0');
            const value = `${hh}:${mm}`;
            const label = cursor.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            options.push({ value, label });
        }

        return options;
    }, [editPickupDate]);

    useEffect(() => {
        if (editPickupType !== 'schedule') return;
        if (!editPickupDate) {
            setEditPickupDate(minEditScheduleDate);
            return;
        }
        if (!editPickupTime || !editScheduleTimeOptions.some((item) => item.value === editPickupTime)) {
            setEditPickupTime(editScheduleTimeOptions[0]?.value || '');
        }
    }, [editPickupType, editPickupDate, editPickupTime, editScheduleTimeOptions, minEditScheduleDate]);
    const trackedOrder = useMemo(() => {
        if (!activeOrders.length) return null;
        return [...activeOrders].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0] || null;
    }, [activeOrders]);

    const shopsById = useMemo(() => {
        const map = new Map<string, Shop>();
        (shops || []).forEach((shop) => {
            if (shop?._id) map.set(String(shop._id), shop);
        });
        return map;
    }, [shops]);

    const getCoordFromGeo = (coords?: number[]): [number, number] | null => {
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const lat = coords[1];
        const lng = coords[0];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lat, lng];
    };

    const getPickupPoint = (order: Order): [number, number] | null => getCoordFromGeo(order.pickupLocation?.coordinates);
    const getDeliveryPoint = (order: Order): [number, number] | null =>
        getCoordFromGeo(order.deliveryLocation?.coordinates) || getPickupPoint(order);
    const getShopPoint = (order: Order): [number, number] | null => {
        if (!order.shopId) return null;
        const shop = shopsById.get(String(order.shopId));
        return getCoordFromGeo(shop?.location?.coordinates);
    };

    useEffect(() => {
        let cancelled = false;

        const syncRiderLocation = async () => {
            if (!trackedOrder?.riderId) {
                setRiderLiveLocation(null);
                return;
            }

            try {
                const payload = await apiFetch(`/rider/location/${trackedOrder.riderId}`);
                const coordinates = payload?.location?.coordinates;
                if (!Array.isArray(coordinates) || coordinates.length < 2) {
                    if (!cancelled) setRiderLiveLocation(null);
                    return;
                }

                const lng = Number(coordinates[0]);
                const lat = Number(coordinates[1]);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    if (!cancelled) setRiderLiveLocation(null);
                    return;
                }

                if (!cancelled) {
                    setRiderLiveLocation({ lat, lng });
                }
            } catch {
                if (!cancelled) setRiderLiveLocation(null);
            }
        };

        syncRiderLocation();
        const interval = window.setInterval(syncRiderLocation, 5000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [trackedOrder?.riderId]);

    useEffect(() => {
        let cancelled = false;

        const computeTrackingRoute = async () => {
            if (!trackedOrder) {
                setTrackingRoutePoints([]);
                setTrackingSummary(null);
                return;
            }

            const pickupPoint = getPickupPoint(trackedOrder);
            const deliveryPoint = getDeliveryPoint(trackedOrder);
            const shopPoint = getShopPoint(trackedOrder);

            let origin: [number, number] | null = null;
            let target: [number, number] | null = null;
            let label = '';

            if (trackedOrder.status === 'assigned') {
                origin = riderLiveLocation ? [riderLiveLocation.lat, riderLiveLocation.lng] : null;
                target = pickupPoint;
                label = 'Rider is coming to pickup point';
            } else if (trackedOrder.status === 'picked_up') {
                origin = riderLiveLocation ? [riderLiveLocation.lat, riderLiveLocation.lng] : pickupPoint;
                target = shopPoint;
                label = 'Rider is heading to laundry shop';
            } else if (trackedOrder.status === 'at_shop' || trackedOrder.status === 'washing' || trackedOrder.status === 'drying') {
                origin = pickupPoint;
                target = shopPoint;
                label = 'Laundry is being processed at shop';
            } else if (trackedOrder.status === 'laundry_done') {
                origin = riderLiveLocation ? [riderLiveLocation.lat, riderLiveLocation.lng] : shopPoint;
                target = shopPoint;
                label = 'Laundry ready at shop';
            } else if (trackedOrder.status === 'out_for_delivery') {
                origin = riderLiveLocation ? [riderLiveLocation.lat, riderLiveLocation.lng] : shopPoint;
                target = deliveryPoint;
                label = 'Rider is returning your laundry';
            } else {
                target = pickupPoint;
                label = 'Waiting for rider assignment';
            }

            if (!origin || !target) {
                setTrackingRoutePoints([]);
                setTrackingSummary({ label, distanceKm: null, durationMin: null });
                if (target) setTrackingMapView({ center: target, zoom: 14 });
                return;
            }

            const route = await fetchRoadRoute(origin, target);
            const points = route.points.length >= 2 ? route.points : [origin, target];

            if (cancelled) return;

            setTrackingRoutePoints(points);
            setTrackingSummary({
                label,
                distanceKm: route.distanceKm,
                durationMin: route.durationMin,
            });
            setTrackingMapView({ center: target, zoom: 14 });
        };

        computeTrackingRoute();

        return () => {
            cancelled = true;
        };
    }, [trackedOrder, riderLiveLocation, shopsById]);

    const trackedPickupPoint = trackedOrder ? getPickupPoint(trackedOrder) : null;
    const trackedDeliveryPoint = trackedOrder ? getDeliveryPoint(trackedOrder) : null;
    const trackedShopPoint = trackedOrder ? getShopPoint(trackedOrder) : null;
    const trackingRouteColor = trackedOrder?.status === 'out_for_delivery'
        ? '#059669'
        : trackedOrder?.status === 'picked_up'
            ? '#0284c7'
            : trackedOrder?.status === 'at_shop' || trackedOrder?.status === 'washing' || trackedOrder?.status === 'drying'
                ? '#a21caf'
            : trackedOrder?.status === 'laundry_done'
                ? '#1d4ed8'
                : '#2563eb';
    const greeting = profile?.firstName?.trim() ? `Hello, ${profile.firstName} ${profile.lastName || ''}!` : 'Hello!';

    const openNewOrder = () => {
        router.push('/customer/create-order');
    };

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-blue-900">
            {/* Edit Modal */}
            {editingOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
                        <h3 className="text-xl font-black text-blue-900 mb-6">Edit Order</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-bold text-blue-900">Product Name</label>
                                <input
                                    value={editProductName}
                                    onChange={e => setEditProductName(e.target.value)}
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-bold text-blue-900">Basket Photos</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => setEditBasketPhotos(Array.from(event.target.files ?? []))}
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs font-semibold text-blue-700/70">
                                    Current photos: {editingOrder.images?.length ?? 0}
                                </p>
                                {editBasketPreviews.length > 0 && (
                                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                                        {editBasketPreviews.map((previewUrl, index) => (
                                            <div key={`${previewUrl}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                <img src={previewUrl} alt={`Edit basket preview ${index + 1}`} className="h-20 w-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-bold text-blue-900">Contact Phone</label>
                                <input
                                    value={editContactPhone}
                                    onChange={e => setEditContactPhone(e.target.value)}
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div ref={editMapContainerRef} className="h-56 w-full" />
                            </div>
                            <div className="-mt-2 flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-blue-700/70">Drag marker or click on map to change pickup location.</p>
                                <button
                                    type="button"
                                    onClick={useEditCurrentLocation}
                                    className="rounded-xl border border-emerald-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-50"
                                >
                                    Use Current Location
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-bold text-blue-900">Pickup Latitude</label>
                                    <input
                                        value={editPickupLatitude}
                                        onChange={e => setEditPickupLatitude(e.target.value)}
                                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-bold text-blue-900">Pickup Longitude</label>
                                    <input
                                        value={editPickupLongitude}
                                        onChange={e => setEditPickupLongitude(e.target.value)}
                                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-bold text-blue-900">Description</label>
                                <textarea
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-bold text-blue-900">Pickup Address</label>
                                <input
                                    value={editPickupAddress}
                                    onChange={e => setEditPickupAddress(e.target.value)}
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4">
                                <p className="mb-2 text-sm font-bold">Pickup Time</p>
                                <div className="mb-3 flex gap-4">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                                        <input
                                            type="radio"
                                            name="editPickupType"
                                            checked={editPickupType === 'now'}
                                            onChange={() => setEditPickupType('now')}
                                        />
                                        Pickup Now
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                                        <input
                                            type="radio"
                                            name="editPickupType"
                                            checked={editPickupType === 'schedule'}
                                            onChange={() => setEditPickupType('schedule')}
                                        />
                                        Schedule Pickup
                                    </label>
                                </div>

                                {editPickupType === 'schedule' && (
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <input
                                            type="date"
                                            min={minEditScheduleDate}
                                            value={editPickupDate}
                                            onChange={(event) => setEditPickupDate(event.target.value)}
                                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-500"
                                        />
                                        <select
                                            value={editPickupTime}
                                            onChange={(event) => setEditPickupTime(event.target.value)}
                                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-500"
                                        >
                                            {editScheduleTimeOptions.length === 0 ? (
                                                <option value="">No available time</option>
                                            ) : (
                                                editScheduleTimeOptions.map((item) => (
                                                    <option key={item.value} value={item.value}>
                                                        {item.label}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                        <p className="text-xs font-semibold text-blue-700/70">Schedule pickup ฟรี และต้องมากกว่าเวลาปัจจุบันอย่างน้อย 1 ชั่วโมง</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={editSaving || !editProductName.trim()}
                                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {editSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <aside className="hidden md:block w-72 border-r border-blue-50 bg-white p-8 shadow-sm h-screen sticky top-0">
                <div className="flex items-center gap-3 mb-10">
                    <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                        <span className="text-white font-black text-xl">C</span>
                    </div>
                    <h2 className="text-xl font-black text-blue-900 tracking-tight uppercase">Laundry Client</h2>
                </div>
                <nav className="space-y-1.5">
                    <Link href="/customer" className="flex items-center rounded-xl px-4 py-3 text-sm font-bold bg-blue-50 text-blue-700 shadow-sm transition-all border border-blue-100">
                        <span className="mr-3 text-lg">🏠</span>
                        Dashboard
                    </Link>
                    <button
                        type="button"
                        onClick={openNewOrder}
                        className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group text-left"
                    >
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">➕</span>
                        New Order
                    </button>
                    <Link href="/customer/history" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">📅</span>
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

            {/* Main Content */}
            <main className="flex-1 p-6 pb-24 md:p-12 md:pb-12">
                <div className="flex items-center justify-between mb-12">
                    <header>
                        <h1 className="text-4xl font-black text-blue-900 tracking-tight mb-2">{greeting}</h1>
                        <p className="text-blue-700/60 font-medium">Ready for some fresh and clean clothes today?</p>
                    </header>
                    <button
                        type="button"
                        onClick={openNewOrder}
                        className="bg-blue-600 px-8 py-4 rounded-2xl text-white font-black uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all inline-flex items-center justify-center"
                    >
                        Create New Order
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Current Orders */}
                    <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-100/50 border border-white">
                        <h3 className="text-xl font-black text-blue-900 mb-6">Current Orders</h3>
                        {loading ? (
                            <div className="flex items-center justify-center p-12">
                                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                            </div>
                        ) : activeOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-3xl border border-dashed border-blue-200">
                                <span className="text-4xl mb-4">✨</span>
                                <p className="text-blue-400 font-bold">Everything is clean! No active orders.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                {activeOrders.map((order) => {
                                    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                                    const isPending = order.status === 'pending';
                                    const priceSummary = calculateOrderPriceSummary({
                                        laundryType: order.laundryType,
                                        weightCategory: order.weightCategory,
                                        serviceTimeMinutes: order.serviceTimeMinutes,
                                        pickupType: order.pickupType,
                                    });
                                    const displayPrice = order.totalPrice > 0 ? order.totalPrice : priceSummary.totalPrice;
                                    const displayServiceTime = typeof order.serviceTimeMinutes === 'number' ? order.serviceTimeMinutes : 50;
                                    const unitPrice = order.laundryType === 'dry' ? 20 : getWashUnitPrice(order.weightCategory);
                                    return (
                                        <div key={order._id} className={`p-5 rounded-2xl border ${cfg.bg} transition-all hover:shadow-md`}>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-black text-blue-900 truncate">{order.productName}</h4>
                                                    <p className="text-xs text-blue-500 mt-1">
                                                        {new Date(order.createdAt).toLocaleDateString('th-TH', {
                                                            day: 'numeric', month: 'short', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit',
                                                        })}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${cfg.color} ${cfg.bg}`}>
                                                    <span>{cfg.icon}</span> {cfg.label}
                                                </span>
                                            </div>
                                            {order.pickupAddress && (
                                                <p className="text-sm text-blue-700/60 mb-2">
                                                    <span className="font-bold">Pickup:</span> {order.pickupAddress}
                                                </p>
                                            )}
                                            <p className="text-xs text-blue-700/70 mb-1">
                                                {order.laundryType === 'dry' ? 'Dry Only Laundry' : 'Wash + Dry Laundry'}
                                                {order.weightCategory ? ` • ${getWeightCategoryLabel(order.weightCategory)}` : ''}
                                                {` • ${displayServiceTime} min`}
                                            </p>
                                            <div className="flex items-center justify-between mt-3">
                                                <span className="text-xs font-bold text-blue-500">
                                                    {order.pickupType === 'schedule' && order.pickupAt
                                                        ? `Scheduled: ${new Date(order.pickupAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                                                        : 'Pickup Now'}
                                                </span>
                                                <span className="text-sm font-black text-blue-900">฿{displayPrice.toLocaleString()}</span>
                                            </div>
                                            <p className="mt-1 text-[11px] font-semibold text-blue-600/80">
                                                ({displayServiceTime} ÷ 50) × {unitPrice} บาท
                                            </p>
                                            <p className="text-[11px] font-semibold text-blue-600/80">
                                                + Delivery 50 {order.pickupType === 'now' ? '+ Pickup Now 20' : '+ Pickup Schedule 0'}
                                            </p>
                                            {/* Edit / Delete — only for pending orders */}
                                            {isPending && (
                                                <div className="flex gap-2 mt-4 pt-3 border-t border-amber-200">
                                                    <button
                                                        onClick={() => openEdit(order)}
                                                        className="flex-1 rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-50 transition-all"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                    <button
                                                        onClick={() => deleteOrder(order._id)}
                                                        disabled={deletingId === order._id}
                                                        className="flex-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50"
                                                    >
                                                        {deletingId === order._id ? 'Deleting…' : '🗑 Delete'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right column */}
                    <div className="space-y-8">
                        {/* Live Tracking Map */}
                        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-100/50 border border-white">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-black text-blue-900">Live Tracking</h3>
                                {trackedOrder && (
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${(STATUS_CONFIG[trackedOrder.status] || STATUS_CONFIG.pending).color} ${(STATUS_CONFIG[trackedOrder.status] || STATUS_CONFIG.pending).bg}`}>
                                        {(STATUS_CONFIG[trackedOrder.status] || STATUS_CONFIG.pending).icon} {(STATUS_CONFIG[trackedOrder.status] || STATUS_CONFIG.pending).label}
                                    </span>
                                )}
                            </div>

                            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-slate-50">
                                {typeof window !== 'undefined' && (
                                    <MapContainer
                                        center={trackingMapView.center}
                                        zoom={trackingMapView.zoom}
                                        scrollWheelZoom={true}
                                        style={{ height: '320px', width: '100%' }}
                                        zoomControl={false}
                                    >
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <MapController center={trackingMapView.center} zoom={trackingMapView.zoom} />

                                        {trackingRoutePoints.length >= 2 && (
                                            <Polyline
                                                positions={trackingRoutePoints}
                                                pathOptions={{ color: trackingRouteColor, weight: 5, opacity: 0.85 }}
                                            />
                                        )}

                                        {riderLiveLocation && riderIcon && (
                                            <Marker position={[riderLiveLocation.lat, riderLiveLocation.lng]} icon={riderIcon}>
                                                <Popup>Rider location</Popup>
                                            </Marker>
                                        )}

                                        {trackedPickupPoint && customerIcon && (
                                            <Marker position={trackedPickupPoint} icon={customerIcon}>
                                                <Popup>Pickup point</Popup>
                                            </Marker>
                                        )}

                                        {trackedDeliveryPoint && customerIcon && (
                                            <Marker position={trackedDeliveryPoint} icon={customerIcon}>
                                                <Popup>Delivery point</Popup>
                                            </Marker>
                                        )}

                                        {trackedShopPoint && shopIcon && (
                                            <Marker position={trackedShopPoint} icon={shopIcon}>
                                                <Popup>Laundry shop</Popup>
                                            </Marker>
                                        )}
                                    </MapContainer>
                                )}
                            </div>

                            {trackedOrder ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm font-bold text-blue-900">{trackingSummary?.label || 'Tracking your active order'}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-blue-700/70">
                                        {trackingSummary?.distanceKm !== null && trackingSummary?.distanceKm !== undefined && (
                                            <span className="rounded-xl bg-blue-50 px-3 py-1 border border-blue-100">Distance: {trackingSummary.distanceKm.toFixed(1)} km</span>
                                        )}
                                        {trackingSummary?.durationMin !== null && trackingSummary?.durationMin !== undefined && (
                                            <span className="rounded-xl bg-emerald-50 px-3 py-1 border border-emerald-100">ETA: {Math.max(1, Math.round(trackingSummary.durationMin))} min</span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm font-semibold text-blue-700/70">Create an order to start live route tracking.</p>
                            )}
                        </div>

                        {/* Recent Completed */}
                        {orders.filter(o => o.status === 'completed').length > 0 && (
                            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-100/50 border border-white">
                                <h3 className="text-xl font-black text-blue-900 mb-6">Recently Completed</h3>
                                <div className="space-y-3">
                                    {orders.filter(o => o.status === 'completed').slice(0, 3).map((order) => (
                                        <div key={order._id} className="flex items-center justify-between p-4 rounded-2xl bg-green-50 border border-green-200">
                                            <div>
                                                <h4 className="font-bold text-green-800 text-sm">{order.productName}</h4>
                                                <p className="text-xs text-green-600">
                                                    {new Date(order.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                                </p>
                                            </div>
                                            <span className="text-green-600 text-lg">✅</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
                <div className="grid grid-cols-4 gap-2">
                    <Link href="/customer" className="flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-black text-blue-700">
                        <span className="text-base">🏠</span>
                        Dashboard
                    </Link>
                    <button
                        type="button"
                        onClick={openNewOrder}
                        className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70"
                    >
                        <span className="text-base">➕</span>
                        New Order
                    </button>
                    <Link href="/customer/history" className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70">
                        <span className="text-base">🗓️</span>
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
