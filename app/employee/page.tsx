"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, API_BASE_URL } from '@/lib/api';
import { fetchRoadRoute } from '@/lib/road-route';

type Shop = {
  _id: string;
  shopName?: string;
  label?: string;
  phoneNumber?: string;
  photoImage?: string;
  createdAt?: string;
  distanceKm?: number;
  location?: { coordinates: number[] };
};

type MyEmployeeProfile = {
  _id: string;
  assignedShopId?: string | null;
  assignedShopIds?: string[];
  joinRequestShopId?: string | null;
  joinRequestStatus?: 'none' | 'pending' | 'rejected';
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  openPopup: () => LeafletMarker;
  remove: () => void;
};

type LeafletCircleMarker = {
  addTo: (map: LeafletMap) => LeafletCircleMarker;
  bindPopup: (content: string) => LeafletCircleMarker;
  openPopup: () => LeafletCircleMarker;
  remove: () => void;
};

type LeafletPolyline = {
  addTo: (map: LeafletMap) => LeafletPolyline;
  bindPopup: (content: string) => LeafletPolyline;
  remove: () => void;
};

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => void;
  invalidateSize: () => void;
  remove: () => void;
};

type LeafletLib = {
  map: (container: HTMLElement, options: { center: [number, number]; zoom: number }) => LeafletMap;
  tileLayer: (url: string, options: { maxZoom: number }) => { addTo: (map: LeafletMap) => void };
  marker: (latLng: [number, number]) => LeafletMarker;
  circleMarker: (latLng: [number, number], options?: { radius?: number; color?: string; fillColor?: string; fillOpacity?: number; weight?: number }) => LeafletCircleMarker;
  polyline: (latLngs: [number, number][], options?: { color?: string; weight?: number; opacity?: number }) => LeafletPolyline;
};

type ShopOrder = {
  _id: string;
  riderId?: string | { _id?: string } | null;
  status?: string;
  createdAt?: string;
};

type RiderOverlay = {
  key: string;
  riderId: string;
  riderLat: number;
  riderLng: number;
  shopId: string;
  shopName: string;
  status: string;
  routePoints: [number, number][];
};

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

const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api$/, '');

function toImageSrc(input?: string) {
  if (!input) return '';
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('data:image/')) {
    return input;
  }
  if (input.startsWith('/')) {
    return `${BACKEND_BASE_URL}${input}`;
  }
  return input;
}

export default function EmployeePage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopOrderCountById, setShopOrderCountById] = useState<Record<string, number>>({});
  const [riderOverlays, setRiderOverlays] = useState<RiderOverlay[]>([]);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'alpha-asc' | 'alpha-desc' | 'newest' | 'oldest'>('alpha-asc');
  const [me, setMe] = useState<MyEmployeeProfile | null>(null);
  const [requestingShopId, setRequestingShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletLib | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const riderMarkersRef = useRef<LeafletCircleMarker[]>([]);
  const riderRouteLinesRef = useRef<LeafletPolyline[]>([]);
  const markerByShopIdRef = useRef<Record<string, LeafletMarker>>({});

  const isMemberOfShop = (shopId: string) => {
    if (!me || !shopId) return false;
    if (me.assignedShopId && String(me.assignedShopId) === String(shopId)) return true;
    return Array.isArray(me.assignedShopIds) && me.assignedShopIds.map(String).includes(String(shopId));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const meData = (await apiFetch('/customers/me')) as MyEmployeeProfile;
        setMe(meData);

        let endpoint = '/employee/shops/nearby?maxDistanceKm=12';

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 60000,
            });
          });

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          endpoint = `/employee/shops/nearby?lat=${lat}&lng=${lng}&maxDistanceKm=12`;
        } catch {
          // Fallback: backend returns assigned shop even without current location
        }

        const data = await apiFetch(endpoint);
        setShops(Array.isArray(data) ? data : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load shops';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const requestJoinShop = async (shopId: string) => {
    try {
      setRequestingShopId(shopId);
      setError(null);
      await apiFetch(`/employee/shops/${shopId}/join-request`, { method: 'POST' });
      const meData = (await apiFetch('/customers/me')) as MyEmployeeProfile;
      setMe(meData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to request shop join');
    } finally {
      setRequestingShopId(null);
    }
  };

  const filteredShops = shops
    .filter((shop) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const name = (shop.shopName || shop.label || '').toLowerCase();
      return name.includes(q);
    })
    .sort((a, b) => {
      const aName = a.shopName || a.label || '';
      const bName = b.shopName || b.label || '';

      if (sortMode === 'alpha-asc') return aName.localeCompare(bName);
      if (sortMode === 'alpha-desc') return bName.localeCompare(aName);

      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (sortMode === 'newest') return bTime - aTime;
      return aTime - bTime;
    });

  const focusShopOnMap = (shop: Shop) => {
    const coords = shop.location?.coordinates;
    if (!mapRef.current || !Array.isArray(coords) || coords.length < 2) return;
    mapRef.current.setView([coords[1], coords[0]], 15);
    const marker = markerByShopIdRef.current[shop._id];
    marker?.openPopup();
  };

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const L = await loadLeaflet();
      if (!mounted || !L || !mapContainerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, { center: [13.7563, 100.5018], zoom: 12 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 50);
    };

    setup();

    return () => {
      mounted = false;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    markerByShopIdRef.current = {};

    shops.forEach((shop) => {
      const coords = shop.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      const name = shop.shopName || shop.label || 'Laundry Shop';
      const imageSrc = toImageSrc(shop.photoImage);

      const marker = L.marker([coords[1], coords[0]])
        .bindPopup(
          `<div style="min-width:180px"><div style="font-weight:700;margin-bottom:6px">${name}</div>${
            imageSrc
              ? `<img src="${imageSrc}" alt="${name}" style="width:100%;height:96px;object-fit:cover;border-radius:8px;margin-bottom:6px" onerror="this.style.display='none'" />`
              : ''
          }<div style="font-size:12px;color:#475569">${shop.phoneNumber || '-'}</div></div>`,
        )
        .addTo(map);
      markersRef.current.push(marker);
      markerByShopIdRef.current[shop._id] = marker;
    });

    const first = shops.find((s) => Array.isArray(s.location?.coordinates) && s.location!.coordinates.length >= 2);
    if (first?.location?.coordinates) {
      map.setView([first.location.coordinates[1], first.location.coordinates[0]], 14);
    }
  }, [shops]);

  useEffect(() => {
    let cancelled = false;

    const fetchShopOrdersAndRiders = async () => {
      if (shops.length === 0) {
        setShopOrderCountById({});
        setRiderOverlays([]);
        return;
      }

      const counts: Record<string, number> = {};
      const overlays: RiderOverlay[] = [];
      const accessibleShopIds = new Set(
        shops
          .filter((shop) => isMemberOfShop(shop._id))
          .map((shop) => String(shop._id)),
      );

      await Promise.all(
        shops.map(async (shop) => {
          try {
            const shopName = shop.shopName || shop.label || 'Laundry Shop';
            const shopCoords = shop.location?.coordinates;
            const shopLat = Array.isArray(shopCoords) && shopCoords.length >= 2 ? shopCoords[1] : null;
            const shopLng = Array.isArray(shopCoords) && shopCoords.length >= 2 ? shopCoords[0] : null;

            const ordersData = await apiFetch(`/employee/shops/${shop._id}/orders`);
            const orders = Array.isArray(ordersData) ? (ordersData as ShopOrder[]) : [];
            counts[shop._id] = orders.length;

            const latestOrderByRider = new Map<string, ShopOrder>();
            for (const order of orders) {
              const riderIdRaw = order?.riderId;
              const riderId =
                typeof riderIdRaw === 'string'
                  ? riderIdRaw
                  : riderIdRaw && typeof riderIdRaw === 'object' && typeof riderIdRaw._id === 'string'
                    ? riderIdRaw._id
                    : '';

              if (!riderId) continue;
              if (!latestOrderByRider.has(riderId)) {
                latestOrderByRider.set(riderId, order);
              }
            }

            for (const [riderId, order] of latestOrderByRider.entries()) {
              if (!accessibleShopIds.has(String(shop._id))) continue;

              try {
                const riderLocation = await apiFetch(`/rider/location/${riderId}`);
                const riderCoords = riderLocation?.location?.coordinates;
                if (!Array.isArray(riderCoords) || riderCoords.length < 2) continue;

                const riderLng = Number(riderCoords[0]);
                const riderLat = Number(riderCoords[1]);
                if (!Number.isFinite(riderLat) || !Number.isFinite(riderLng)) continue;

                let routePoints: [number, number][] = [];
                const status = String(order?.status || 'unknown');
                const shouldShowRouteToShop = ['picked_up', 'laundry_done'].includes(status);

                if (shouldShowRouteToShop && Number.isFinite(shopLat) && Number.isFinite(shopLng)) {
                  const route = await fetchRoadRoute([riderLat, riderLng], [Number(shopLat), Number(shopLng)]);
                  routePoints = route.points.length >= 2 ? route.points : [[riderLat, riderLng], [Number(shopLat), Number(shopLng)]];
                }

                overlays.push({
                  key: `${shop._id}-${riderId}`,
                  riderId,
                  riderLat,
                  riderLng,
                  shopId: shop._id,
                  shopName,
                  status,
                  routePoints,
                });
              } catch {
                // ignore rider location fetch errors
              }
            }
          } catch {
            counts[shop._id] = counts[shop._id] ?? 0;
          }
        }),
      );

      if (cancelled) return;
      setShopOrderCountById(counts);
      setRiderOverlays(overlays);
    };

    fetchShopOrdersAndRiders();
    const interval = window.setInterval(fetchShopOrdersAndRiders, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [shops]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    riderMarkersRef.current.forEach((item) => item.remove());
    riderMarkersRef.current = [];
    riderRouteLinesRef.current.forEach((line) => line.remove());
    riderRouteLinesRef.current = [];

    riderOverlays.forEach((overlay) => {
      if (overlay.routePoints.length >= 2) {
        const routeLine = L.polyline(overlay.routePoints, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.85,
        })
          .bindPopup(`<div style="font-weight:700">Rider route to ${overlay.shopName}</div><div style="font-size:12px;color:#475569">Status: ${overlay.status.replace(/_/g, ' ')}</div>`)
          .addTo(map);
        riderRouteLinesRef.current.push(routeLine);
      }

      const riderPin = L.circleMarker([overlay.riderLat, overlay.riderLng], {
        radius: 7,
        color: '#1d4ed8',
        fillColor: '#3b82f6',
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindPopup(`<div style="min-width:170px"><div style="font-weight:700;margin-bottom:4px">Rider</div><div style="font-size:12px;color:#475569">Shop: ${overlay.shopName}</div><div style="font-size:12px;color:#475569">Status: ${overlay.status.replace(/_/g, ' ')}</div></div>`)
        .addTo(map);

      riderMarkersRef.current.push(riderPin);
    });
  }, [riderOverlays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-blue-900 tracking-tight">Shop Map</h1>
        <p className="text-blue-700/60 text-sm font-medium">Select a pinned shop and enter to update laundry progress.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search shop name..."
          className="w-72 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-medium text-blue-900 outline-none focus:border-blue-300"
        />
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as 'alpha-asc' | 'alpha-desc' | 'newest' | 'oldest')}
          className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-900"
        >
          <option value="alpha-asc">A-Z</option>
          <option value="alpha-desc">Z-A</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <div className="h-[420px] w-full overflow-hidden rounded-3xl border-4 border-white bg-white shadow-xl shadow-slate-200/50">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      {loading && <p className="text-sm text-blue-700/70">Loading nearby shops...</p>}
      {error && <p className="text-sm text-rose-600">Error: {error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredShops.map((shop) => (
          <div key={shop._id} onClick={() => focusShopOnMap(shop)} className="cursor-pointer rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-blue-200">
            {toImageSrc(shop.photoImage) ? (
              <img
                src={toImageSrc(shop.photoImage)}
                alt={shop.shopName || shop.label || 'Laundry Shop'}
                className="mb-3 h-28 w-full rounded-xl object-cover"
              />
            ) : null}
            <h3 className="text-sm font-black text-blue-900">{shop.shopName || shop.label || 'Laundry Shop'}</h3>
            <p className="mt-1 text-xs font-semibold text-blue-600">☎ {shop.phoneNumber || '-'}</p>
            <p className="mt-1 text-xs font-semibold text-blue-500">{shop.distanceKm != null ? `${shop.distanceKm} km` : '-'}</p>
            <p className="mt-1 text-xs font-black text-indigo-600">Orders in shop: {shopOrderCountById[shop._id] ?? 0}</p>

            {isMemberOfShop(shop._id) ? (
              <Link
                href={`/employee/shop/${shop._id}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-blue-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"
              >
                Enter Shop ({shopOrderCountById[shop._id] ?? 0})
              </Link>
            ) : me?.joinRequestStatus === 'pending' && me?.joinRequestShopId === shop._id ? (
              <button
                disabled
                onClick={(event) => event.stopPropagation()}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-amber-700"
              >
                Request Pending
              </button>
            ) : (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  requestJoinShop(shop._id);
                }}
                disabled={requestingShopId === shop._id}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-blue-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {requestingShopId === shop._id ? 'Requesting...' : 'Request Join Shop'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
