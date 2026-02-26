"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api";

type LatLng = { lat: number; lng: number };

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  openPopup: () => LeafletMarker;
  on: (event: string, handler: () => void) => void;
  getLatLng: () => LatLng;
  setLatLng: (latLng: [number, number] | LatLng) => void;
  remove: () => void;
};

type LeafletMap = {
  on: (event: string, handler: (event: { latlng: LatLng }) => void) => void;
  setView: (center: [number, number], zoom: number) => void;
  remove: () => void;
};

type LeafletLib = {
  map: (container: HTMLElement, options: { center: [number, number]; zoom: number }) => LeafletMap;
  tileLayer: (url: string, options: { maxZoom: number }) => { addTo: (map: LeafletMap) => void };
  marker: (latLng: [number, number], options?: { draggable?: boolean }) => LeafletMarker;
};

const DEFAULT_COORDS: LatLng = { lat: 13.7563, lng: 100.5018 };
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

function toImageSrc(input?: string) {
  if (!input) return "";
  if (input.startsWith("http://") || input.startsWith("https://") || input.startsWith("data:image/")) {
    return input;
  }
  if (input.startsWith("/")) {
    return `${BACKEND_BASE_URL}${input}`;
  }
  return input;
}

async function loadLeaflet() {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { L?: LeafletLib };
  if (w.L) return w.L;

  if (!document.querySelector('link[data-leaflet="true"]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.setAttribute("data-leaflet", "true");
    document.head.appendChild(css);
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector('script[data-leaflet="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      if ((window as { L?: LeafletLib }).L) {
        resolve();
        return;
      }
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () => reject(new Error("Failed to load leaflet")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.setAttribute("data-leaflet", "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load leaflet"));
    document.body.appendChild(script);
  });

  return (window as unknown as { L?: LeafletLib }).L ?? null;
}

type Shop = {
  _id: string;
  shopName?: string;
  label?: string;
  phoneNumber?: string;
  photoImage?: string;
  totalWashingMachines?: number;
  machineSizeConfig?: {
    s?: number;
    m?: number;
    l?: number;
  };
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  machineInUse?: number;
  machineAvailable?: number;
  ownerId?: string;
  createdAt?: string;
  location?: {
    type: string;
    coordinates: number[];
  };
};

export default function AdminPinShopPage() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletLib | null>(null);
  const selectedMarkerRef = useRef<LeafletMarker | null>(null);
  const editMapContainerRef = useRef<HTMLDivElement | null>(null);
  const editMapRef = useRef<LeafletMap | null>(null);
  const editMarkerRef = useRef<LeafletMarker | null>(null);
  const shopMarkersRef = useRef<LeafletMarker[]>([]);
  const markerByShopIdRef = useRef<Record<string, LeafletMarker>>({});
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [backHref, setBackHref] = useState("/admin");
  const [backLabel, setBackLabel] = useState("← Back to Admin");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"alpha-asc" | "alpha-desc" | "newest" | "oldest">("alpha-asc");
  const [isAdminSession, setIsAdminSession] = useState(false);

  const [shopName, setShopName] = useState("");
  const [label, setLabel] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [photoImage, setPhotoImage] = useState("");
  const [totalWashingMachines, setTotalWashingMachines] = useState("10");
  const [machineS, setMachineS] = useState("4");
  const [machineM, setMachineM] = useState("3");
  const [machineL, setMachineL] = useState("3");
  const [latitude, setLatitude] = useState("13.7563");
  const [longitude, setLongitude] = useState("100.5018");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShopName, setEditShopName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editTotalWashingMachines, setEditTotalWashingMachines] = useState("10");
  const [editMachineS, setEditMachineS] = useState("4");
  const [editMachineM, setEditMachineM] = useState("3");
  const [editMachineL, setEditMachineL] = useState("3");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    let mounted = true;

    const setupMap = async () => {
      const L = await loadLeaflet();
      if (!mounted || !L || !mapContainerRef.current || mapRef.current) {
        return;
      }

      leafletRef.current = L;
      const initialLat = Number(latitude) || DEFAULT_COORDS.lat;
      const initialLng = Number(longitude) || DEFAULT_COORDS.lng;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
      marker.bindPopup("New Shop Location");

      marker.on("dragend", () => {
        const point = marker.getLatLng();
        setLatitude(String(point.lat));
        setLongitude(String(point.lng));
      });

      map.on("click", (event: { latlng: LatLng }) => {
        const point = event.latlng;
        marker.setLatLng(point);
        setLatitude(String(point.lat));
        setLongitude(String(point.lng));
      });

      mapRef.current = map;
      selectedMarkerRef.current = marker;
    };

    setupMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      mapRef.current = null;
      selectedMarkerRef.current = null;
      shopMarkersRef.current = [];
      markerByShopIdRef.current = {};
    };
  }, [isClient]);

  useEffect(() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || !selectedMarkerRef.current || !mapRef.current) {
      return;
    }

    selectedMarkerRef.current.setLatLng({ lat, lng });
    mapRef.current.setView([lat, lng], 14);
  }, [latitude, longitude]);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) {
      return;
    }

    shopMarkersRef.current.forEach((marker) => marker.remove());
    shopMarkersRef.current = [];
    markerByShopIdRef.current = {};

    const markers: LeafletMarker[] = [];
    for (const shop of shops) {
      const coords = shop.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const shopLng = Number(coords[0]);
      const shopLat = Number(coords[1]);
      if (Number.isNaN(shopLat) || Number.isNaN(shopLng)) continue;

      const name = shop.shopName || shop.label || "Shop";
      const marker = L.marker([shopLat, shopLng]).addTo(mapRef.current);
      const imageSrc = toImageSrc(shop.photoImage);
      marker.bindPopup(
        `<div style="min-width:180px"><div style="font-weight:700;margin-bottom:6px">${name}</div>${
          imageSrc
            ? `<img src="${imageSrc}" alt="${name}" style="width:100%;height:96px;object-fit:cover;border-radius:8px;margin-bottom:6px" onerror="this.style.display='none'" />`
            : ""
        }<div style="font-size:12px;color:#475569">${shop.phoneNumber || "No phone"}</div></div>`,
      );
      marker.on("click", () => {
        setEditingId(shop._id);
        setEditShopName(shop.shopName || "");
        setEditLabel(shop.label || "");
        setEditPhone(shop.phoneNumber || "");
        setEditPhoto(shop.photoImage || "");
        setEditTotalWashingMachines(String(shop.totalWashingMachines || 10));
        setEditMachineS(String(shop.machineSizeConfig?.s ?? shop.totalWashingMachines ?? 10));
        setEditMachineM(String(shop.machineSizeConfig?.m ?? 0));
        setEditMachineL(String(shop.machineSizeConfig?.l ?? 0));
        setEditLng(String(shopLng));
        setEditLat(String(shopLat));
      });
      markers.push(marker);
      markerByShopIdRef.current[shop._id] = marker;
    }

    shopMarkersRef.current = markers;

    if (markers.length > 0) {
      const firstShop = shops[0]?.location?.coordinates;
      if (Array.isArray(firstShop) && firstShop.length >= 2) {
        const firstLng = Number(firstShop[0]);
        const firstLat = Number(firstShop[1]);
        if (!Number.isNaN(firstLat) && !Number.isNaN(firstLng)) {
          mapRef.current.setView([firstLat, firstLng], 14);
        }
      }
    }
  }, [shops]);

  const filteredAndSortedShops = shops
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
    if (!Array.isArray(coords) || coords.length < 2 || !mapRef.current) return;

    mapRef.current.setView([Number(coords[1]), Number(coords[0])], 15);
    markerByShopIdRef.current[shop._id]?.openPopup();
  };

  useEffect(() => {
    let mounted = true;

    const setupEditMap = async () => {
      if (!editingId) return;

      const L = await loadLeaflet();
      if (!mounted || !L || !editMapContainerRef.current || editMapRef.current) {
        return;
      }

      const lat = Number(editLat) || DEFAULT_COORDS.lat;
      const lng = Number(editLng) || DEFAULT_COORDS.lng;

      const map = L.map(editMapContainerRef.current, {
        center: [lat, lng],
        zoom: 15,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.bindPopup("Edit Shop Location");

      marker.on("dragend", () => {
        const point = marker.getLatLng();
        setEditLat(String(point.lat));
        setEditLng(String(point.lng));
      });

      map.on("click", (event: { latlng: LatLng }) => {
        const point = event.latlng;
        marker.setLatLng(point);
        setEditLat(String(point.lat));
        setEditLng(String(point.lng));
      });

      editMapRef.current = map;
      editMarkerRef.current = marker;
    };

    setupEditMap();

    return () => {
      mounted = false;
      if (editMapRef.current) {
        editMapRef.current.remove();
      }
      editMapRef.current = null;
      editMarkerRef.current = null;
    };
  }, [editingId]);

  useEffect(() => {
    const lat = Number(editLat);
    const lng = Number(editLng);
    if (Number.isNaN(lat) || Number.isNaN(lng) || !editMarkerRef.current || !editMapRef.current) {
      return;
    }

    editMarkerRef.current.setLatLng({ lat, lng });
    editMapRef.current.setView([lat, lng], 15);
  }, [editLat, editLng]);

  useEffect(() => {
    const total =
      Math.max(0, Math.floor(Number(machineS) || 0)) +
      Math.max(0, Math.floor(Number(machineM) || 0)) +
      Math.max(0, Math.floor(Number(machineL) || 0));
    setTotalWashingMachines(String(total));
  }, [machineS, machineM, machineL]);

  useEffect(() => {
    const total =
      Math.max(0, Math.floor(Number(editMachineS) || 0)) +
      Math.max(0, Math.floor(Number(editMachineM) || 0)) +
      Math.max(0, Math.floor(Number(editMachineL) || 0));
    setEditTotalWashingMachines(String(total));
  }, [editMachineS, editMachineM, editMachineL]);

  const loadShops = async () => {
    try {
      setLoading(true);
      const data = (await apiFetch("/map/shops")) as Shop[];
      setShops(Array.isArray(data) ? data : []);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Failed to load shops";
      setError(text);
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
    const token = localStorage.getItem("access_token");
    const tokenRole = (() => {
      try {
        if (!token) return null;
        const payloadBase64 = token.split('.')[1];
        if (!payloadBase64) return null;
        const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const parsed = JSON.parse(atob(padded)) as { role?: string };
        return parsed.role || null;
      } catch {
        return null;
      }
    })();
    const effectiveRole = authRole || tokenRole;

    if (effectiveRole !== "admin" && effectiveRole !== "employee") {
      router.replace("/");
      return;
    }
    setIsAdminSession(effectiveRole === "admin");
    loadShops();
  }, [router]);

  const onPhotoFileChange = async (file: File | null) => {
    if (!file) return;
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
    setPhotoImage(result);
  };

  const onEditPhotoFileChange = async (file: File | null) => {
    if (!file) return;
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
    setEditPhoto(result);
  };

  const createShop = async () => {
    setError(null);
    setMessage(null);

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Latitude/Longitude must be valid numbers");
      return;
    }
    if (!shopName.trim()) {
      setError("Shop name is required");
      return;
    }

    const machineSCount = Math.max(0, Math.floor(Number(machineS) || 0));
    const machineMCount = Math.max(0, Math.floor(Number(machineM) || 0));
    const machineLCount = Math.max(0, Math.floor(Number(machineL) || 0));
    const machineCount = machineSCount + machineMCount + machineLCount;
    if (machineCount < 1) {
      setError("At least 1 machine is required (S/M/L)");
      return;
    }

    try {
      setSaving(true);
      await apiFetch("/map/shops", {
        method: "POST",
        body: JSON.stringify({
          shopName: shopName.trim(),
          label: label.trim() || shopName.trim(),
          phoneNumber: phoneNumber.trim(),
          photoImage: photoImage.trim(),
          totalWashingMachines: machineCount,
          machineSizeConfig: {
            s: machineSCount,
            m: machineMCount,
            l: machineLCount,
          },
          location: { lat, lng },
        }),
      });
      setMessage("Shop added");
      setShopName("");
      setLabel("");
      setPhoneNumber("");
      setPhotoImage("");
      setTotalWashingMachines("10");
      setMachineS("4");
      setMachineM("3");
      setMachineL("3");
      await loadShops();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add shop");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (shop: Shop) => {
    setEditingId(shop._id);
    setEditShopName(shop.shopName || "");
    setEditLabel(shop.label || "");
    setEditPhone(shop.phoneNumber || "");
    setEditPhoto(shop.photoImage || "");
    setEditTotalWashingMachines(String(shop.totalWashingMachines || 10));
    setEditMachineS(String(shop.machineSizeConfig?.s ?? shop.totalWashingMachines ?? 10));
    setEditMachineM(String(shop.machineSizeConfig?.m ?? 0));
    setEditMachineL(String(shop.machineSizeConfig?.l ?? 0));
    const coords = shop.location?.coordinates;
    setEditLng(Array.isArray(coords) && coords.length >= 2 ? String(coords[0]) : "");
    setEditLat(Array.isArray(coords) && coords.length >= 2 ? String(coords[1]) : "");
  };

  const saveEdit = async (shopId: string) => {
    const lat = Number(editLat);
    const lng = Number(editLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Edit latitude/longitude must be valid numbers");
      return;
    }

    const machineSCount = Math.max(0, Math.floor(Number(editMachineS) || 0));
    const machineMCount = Math.max(0, Math.floor(Number(editMachineM) || 0));
    const machineLCount = Math.max(0, Math.floor(Number(editMachineL) || 0));
    const machineCount = machineSCount + machineMCount + machineLCount;
    if (machineCount < 1) {
      setError("At least 1 machine is required (S/M/L)");
      return;
    }

    try {
      await apiFetch(`/map/shops/${shopId}`, {
        method: "PUT",
        body: JSON.stringify({
          shopName: editShopName.trim(),
          label: editLabel.trim(),
          phoneNumber: editPhone.trim(),
          photoImage: editPhoto.trim(),
          totalWashingMachines: machineCount,
          machineSizeConfig: {
            s: machineSCount,
            m: machineMCount,
            l: machineLCount,
          },
          location: { lat, lng },
        }),
      });
      setEditingId(null);
      setMessage("Shop updated");
      await loadShops();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update shop");
    }
  };

  const approveShop = async (shopId: string) => {
    try {
      await apiFetch(`/map/shops/${shopId}/approve`, { method: 'PATCH' });
      setMessage('Shop approved');
      await loadShops();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve shop');
    }
  };

  const deleteShop = async (shopId: string) => {
    if (!confirm("Delete this shop?")) return;
    try {
      await apiFetch(`/map/shops/${shopId}`, { method: "DELETE" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.toLowerCase().includes("not found")) {
        setError(msg || "Failed to delete shop");
        return;
      }
    }
    setMessage("Shop deleted");
    if (editingId === shopId) setEditingId(null);
    await loadShops();
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 font-sans text-blue-900">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Pin Shop</h1>
              <p className="text-sm text-blue-700/60">Add and manage shop pins for riders.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-100/40">
            <p className="text-sm font-semibold text-blue-500">Loading pin shop...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-blue-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Pin Shop</h1>
            <p className="text-sm text-blue-700/60">Add and manage shop pins for riders.</p>
          </div>
          <Link href={backHref} className="rounded-xl border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
            {backLabel}
          </Link>
        </div>

        <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-100/40">
          <p className="mb-3 text-sm font-semibold text-blue-700/80">Click map to choose shop pin location.</p>
          <div ref={mapContainerRef} className="mb-4 h-80 w-full rounded-2xl border border-slate-200" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Shop Name</span>
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop Name" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Phone Number</span>
              <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone Number" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Photo URL / Base64</span>
              <input value={photoImage} onChange={(e) => setPhotoImage(e.target.value)} placeholder="Photo URL/Base64" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Machine S</span>
              <input value={machineS} onChange={(e) => setMachineS(e.target.value)} placeholder="Machine S" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Machine M</span>
              <input value={machineM} onChange={(e) => setMachineM(e.target.value)} placeholder="Machine M" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Machine L</span>
              <input value={machineL} onChange={(e) => setMachineL(e.target.value)} placeholder="Machine L" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Total Washing Machines</span>
              <input value={totalWashingMachines} readOnly placeholder="Total Washing Machines" className="w-full rounded-xl border border-zinc-300 bg-slate-50 px-3 py-2 text-sm text-zinc-600" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Latitude</span>
              <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-blue-700">Longitude</span>
              <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <input type="file" accept="image/*" onChange={(e) => onPhotoFileChange(e.target.files?.[0] ?? null)} className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
          {photoImage ? (
            <img src={toImageSrc(photoImage)} alt="New shop preview" className="mt-3 h-32 w-48 rounded-xl border border-slate-200 object-cover" onError={(e) => {
              e.currentTarget.style.display = "none";
            }} />
          ) : null}
          <button onClick={createShop} disabled={saving} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Add Shop"}
          </button>
          {!isAdminSession && (
            <p className="mt-2 text-xs font-semibold text-amber-700">Employee added shop will be pending until admin approves.</p>
          )}
          {message && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="mt-6 rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-100/40">
          <h2 className="mb-4 text-lg font-black text-blue-900">Pinned Shops</h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search shop name"
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
          {loading ? (
            <p className="text-sm font-semibold text-blue-600">Loading shops...</p>
          ) : filteredAndSortedShops.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-blue-700/70">No shop added yet.</p>
          ) : (
            <div className="space-y-3">
              {filteredAndSortedShops.map((shop) => {
                const coords = shop.location?.coordinates;
                const lat = Array.isArray(coords) && coords.length >= 2 ? coords[1] : null;
                const lng = Array.isArray(coords) && coords.length >= 2 ? coords[0] : null;
                const isEditing = editingId === shop._id;

                return (
                  <div key={shop._id} className="rounded-2xl border border-slate-100 p-4" onClick={() => !isEditing && focusShopOnMap(shop)}>
                    {isEditing ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-500">Edit location on map</p>
                          <div ref={editMapContainerRef} className="h-56 w-full rounded-xl border border-slate-200" />
                        </div>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Shop Name</span>
                          <input value={editShopName} onChange={(e) => setEditShopName(e.target.value)} placeholder="Shop Name" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Label</span>
                          <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Label" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Phone</span>
                          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Photo URL / Base64</span>
                          <input value={editPhoto} onChange={(e) => setEditPhoto(e.target.value)} placeholder="Photo URL/Base64" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Machine S</span>
                          <input value={editMachineS} onChange={(e) => setEditMachineS(e.target.value)} placeholder="Machine S" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Machine M</span>
                          <input value={editMachineM} onChange={(e) => setEditMachineM(e.target.value)} placeholder="Machine M" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Machine L</span>
                          <input value={editMachineL} onChange={(e) => setEditMachineL(e.target.value)} placeholder="Machine L" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Total Washing Machines</span>
                          <input value={editTotalWashingMachines} readOnly placeholder="Total Washing Machines" className="w-full rounded-xl border border-zinc-300 bg-slate-50 px-3 py-2 text-sm text-zinc-600" />
                        </label>
                        <input type="file" accept="image/*" onChange={(e) => onEditPhotoFileChange(e.target.files?.[0] ?? null)} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm md:col-span-2" />
                        {editPhoto ? (
                          <img src={toImageSrc(editPhoto)} alt="Edit shop preview" className="h-32 w-48 rounded-xl border border-slate-200 object-cover md:col-span-2" onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }} />
                        ) : null}
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Latitude</span>
                          <input value={editLat} onChange={(e) => setEditLat(e.target.value)} placeholder="Latitude" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold text-blue-700">Longitude</span>
                          <input value={editLng} onChange={(e) => setEditLng(e.target.value)} placeholder="Longitude" className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                        </label>
                        <div className="md:col-span-2 flex gap-2 pt-1">
                          <button onClick={() => saveEdit(shop._id)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700">Save</button>
                          <button onClick={() => setEditingId(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-blue-900">{shop.shopName || shop.label || "Laundry Shop"}</p>
                          <p className="text-xs font-semibold text-blue-600">Phone: {shop.phoneNumber || "-"}</p>
                          <p className="text-xs font-semibold text-indigo-600">Machines: {shop.machineAvailable ?? 0} available / {shop.totalWashingMachines ?? 10} total</p>
                          <p className="text-xs font-semibold text-indigo-500">S/M/L: {shop.machineSizeConfig?.s ?? shop.totalWashingMachines ?? 10}/{shop.machineSizeConfig?.m ?? 0}/{shop.machineSizeConfig?.l ?? 0}</p>
                          <p className="text-xs font-semibold text-amber-600">Status: {shop.approvalStatus || 'approved'}</p>
                          <p className="text-xs font-semibold text-blue-500">{lat != null && lng != null ? `${lat}, ${lng}` : "-"}</p>
                          {shop.photoImage ? (
                            <img src={toImageSrc(shop.photoImage)} alt={shop.shopName || shop.label || "Shop"} className="mt-2 h-20 w-32 rounded-lg border border-slate-200 object-cover" onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }} />
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          {isAdminSession && shop.approvalStatus === 'pending' && (
                            <button onClick={() => approveShop(shop._id)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-50">Approve</button>
                          )}
                          <button onClick={() => startEdit(shop)} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50">Edit</button>
                          {isAdminSession && <button onClick={() => deleteShop(shop._id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50">Delete</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
