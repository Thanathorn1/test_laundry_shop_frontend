"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { calculateOrderPriceSummary, getWashUnitPrice } from "@/lib/pricing";

type CreateOrderPayload = {
  productName: string;
  description?: string;
  images?: string[];
  contactPhone?: string;
  laundryType?: 'wash' | 'dry';
  weightCategory?: 's' | 'm' | 'l';
  serviceTimeMinutes?: number;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress?: string;
  pickupType: 'now' | 'schedule';
  pickupAt?: string;
};

type CustomerProfile = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
};

type SavedAddress = {
  label: string;
  address: string;
  coordinates: number[];
  isDefault: boolean;
  contactPhone?: string;
  pickupType?: 'now' | 'schedule';
  pickupAt?: string | null;
};

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
    const parsed = JSON.parse(atob(padded)) as { role?: string };

    if (parsed.role === 'admin' || parsed.role === 'rider' || parsed.role === 'user') {
      return parsed.role;
    }
    return null;
  } catch {
    return null;
  }
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
      if ((window as any).L) {
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

export default function CreateOrderPage() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const hasTriedAutoLocationRef = useRef(false);

  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [laundryType, setLaundryType] = useState<'wash' | 'dry'>('wash');
  const [weightCategory, setWeightCategory] = useState<'s' | 'm' | 'l'>('s');
  const [serviceTimeMinutes, setServiceTimeMinutes] = useState(50);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [basketPhotos, setBasketPhotos] = useState<File[]>([]);
  const [basketPhotoPreviews, setBasketPhotoPreviews] = useState<string[]>([]);
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupType, setPickupType] = useState<'now' | 'schedule'>('now');
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [savePickup, setSavePickup] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Home");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [pickupLatitude, setPickupLatitude] = useState(String(DEFAULT_PICKUP.lat));
  const [pickupLongitude, setPickupLongitude] = useState(String(DEFAULT_PICKUP.lng));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [mustCompleteProfile, setMustCompleteProfile] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    const token = localStorage.getItem('access_token');
    const tokenRole = getRoleFromAccessToken(token);
    const authRole = localStorage.getItem('auth_role') || tokenRole;
    if (tokenRole && localStorage.getItem('auth_role') !== tokenRole) {
      localStorage.setItem('auth_role', tokenRole);
    }
    setIsAdminSession(authRole === 'admin');
  }, []);

  useEffect(() => {
    if (!hasMounted || hasTriedAutoLocationRef.current) return;
    hasTriedAutoLocationRef.current = true;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLatitude(String(position.coords.latitude));
        setPickupLongitude(String(position.coords.longitude));
      },
      () => {
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [hasMounted]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        (!mustCompleteProfile || (firstName.trim() && lastName.trim())) &&
        productName.trim() &&
          contactPhone.trim() &&
          pickupLatitude.trim() &&
          pickupLongitude.trim() &&
          !Number.isNaN(Number(pickupLatitude)) &&
          !Number.isNaN(Number(pickupLongitude)) &&
          (pickupType === 'now' || (pickupDate.trim() && pickupTime.trim())),
      ),
    [mustCompleteProfile, firstName, lastName, productName, contactPhone, pickupLatitude, pickupLongitude, pickupType, pickupDate, pickupTime],
  );

  const estimatedPrice = useMemo(
    () =>
      calculateOrderPriceSummary({
        laundryType,
        weightCategory,
        serviceTimeMinutes,
        pickupType,
      }),
    [laundryType, weightCategory, serviceTimeMinutes, pickupType],
  );

  const unitPrice = laundryType === 'dry' ? 20 : getWashUnitPrice(weightCategory);

  const minScheduleDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const scheduleTimeOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    if (!pickupDate) return options;

    const now = new Date();
    const nowDate = now.toISOString().slice(0, 10);
    const base = pickupDate === nowDate ? new Date(now.getTime() + 60 * 60 * 1000) : new Date(`${pickupDate}T00:00:00`);
    base.setMinutes(Math.ceil(base.getMinutes() / 15) * 15, 0, 0);

    const end = new Date(`${pickupDate}T23:59:59`);
    for (let cursor = new Date(base); cursor <= end; cursor = new Date(cursor.getTime() + 15 * 60 * 1000)) {
      const hh = String(cursor.getHours()).padStart(2, '0');
      const mm = String(cursor.getMinutes()).padStart(2, '0');
      const value = `${hh}:${mm}`;
      const label = cursor.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      options.push({ value, label });
    }

    return options;
  }, [pickupDate]);

  useEffect(() => {
    if (pickupType !== 'schedule') return;
    if (!pickupDate) {
      setPickupDate(minScheduleDate);
      return;
    }
    if (!pickupTime || !scheduleTimeOptions.some((item) => item.value === pickupTime)) {
      setPickupTime(scheduleTimeOptions[0]?.value || '');
    }
  }, [pickupType, pickupDate, pickupTime, scheduleTimeOptions, minScheduleDate]);

  useEffect(() => {
    const loadSavedAddresses = async () => {
      try {
        setIsLoadingSaved(true);
        const profile = await apiFetch('/customers/me');
        if (profile && typeof profile === 'object') {
          const fName = (profile as CustomerProfile).firstName;
          const lName = (profile as CustomerProfile).lastName;
          const phone = (profile as CustomerProfile).phoneNumber;
          if (typeof fName === 'string') {
            setFirstName(fName);
          }
          if (typeof lName === 'string') {
            setLastName(lName);
          }
          if (typeof phone === 'string') {
            setContactPhone(phone);
          }

          const profileMissing = !String(fName ?? '').trim() || !String(lName ?? '').trim() || !String(phone ?? '').trim();
          setMustCompleteProfile(profileMissing);
        }

        const data = await apiFetch("/customers/saved-addresses");
        if (Array.isArray(data)) {
          setSavedAddresses(data as SavedAddress[]);
        }
      } catch (savedError) {
        const message = savedError instanceof Error ? savedError.message : 'Failed to load saved addresses';
        if (message.toLowerCase().includes('unauthorized')) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_role');
          localStorage.removeItem('auth_role');
          router.push('/');
          return;
        }
        if (message.toLowerCase().includes('customer profile not found')) {
          router.push('/customer/profile?returnTo=/customer/create-order');
          return;
        }
      } finally {
        setIsLoadingSaved(false);
      }
    };

    loadSavedAddresses();
  }, [router]);

  useEffect(() => {
    let mounted = true;

    const setupMap = async () => {
      try {
        const L = await loadLeaflet();
        if (!mounted || !L || !mapContainerRef.current || mapInstanceRef.current) {
          return;
        }

        const initialLat = Number(pickupLatitude) || DEFAULT_PICKUP.lat;
        const initialLng = Number(pickupLongitude) || DEFAULT_PICKUP.lng;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 15,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

        marker.on("dragend", () => {
          const point = marker.getLatLng();
          setPickupLatitude(String(point.lat));
          setPickupLongitude(String(point.lng));
        });

        map.on("click", (event: { latlng: LatLng }) => {
          const point = event.latlng;
          marker.setLatLng(point);
          setPickupLatitude(String(point.lat));
          setPickupLongitude(String(point.lng));
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
      } catch {
        setError("Failed to load map");
      }
    };

    setupMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [pickupLatitude, pickupLongitude]);

  useEffect(() => {
    const lat = Number(pickupLatitude);
    const lng = Number(pickupLongitude);

    if (Number.isNaN(lat) || Number.isNaN(lng) || !markerRef.current || !mapInstanceRef.current) {
      return;
    }

    markerRef.current.setLatLng({ lat, lng });
    mapInstanceRef.current.panTo([lat, lng]);
  }, [pickupLatitude, pickupLongitude]);

  useEffect(() => {
    const urls = basketPhotos.map((file) => URL.createObjectURL(file));
    setBasketPhotoPreviews(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [basketPhotos]);

  const filesToBase64 = async (files: File[]) => {
    const readers = files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Failed to read image"));
          reader.readAsDataURL(file);
        }),
    );
    return Promise.all(readers);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLatitude(String(position.coords.latitude));
        setPickupLongitude(String(position.coords.longitude));
      },
      () => setError("Cannot access current location. Please allow location permission."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const pickupLat = Number(pickupLatitude);
    const pickupLng = Number(pickupLongitude);
    if (Number.isNaN(pickupLat) || Number.isNaN(pickupLng)) {
      setError("Pickup latitude/longitude must be numbers");
      return;
    }

    if (pickupType === 'schedule' && (!pickupDate.trim() || !pickupTime.trim())) {
      setError("Please select pickup date and time");
      return;
    }

    if (pickupType === 'schedule') {
      const scheduledAt = new Date(`${pickupDate}T${pickupTime}:00`);
      const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
      if (scheduledAt.getTime() < oneHourLater.getTime()) {
        setError("Scheduled pickup must be at least 1 hour from now");
        return;
      }
    }

    const pickupAt =
      pickupType === 'schedule'
        ? new Date(`${pickupDate}T${pickupTime}:00`).toISOString()
        : undefined;

    const payload: CreateOrderPayload = {
      productName: productName.trim(),
      description: description.trim() || undefined,
      images: basketPhotos.length ? await filesToBase64(basketPhotos) : undefined,
      contactPhone: contactPhone.trim() || undefined,
      laundryType,
      weightCategory,
      serviceTimeMinutes,
      pickupLatitude: pickupLat,
      pickupLongitude: pickupLng,
      pickupAddress: pickupAddress.trim() || undefined,
      pickupType,
      pickupAt,
    };

    try {
      setIsLoading(true);

      if (mustCompleteProfile) {
        await apiFetch('/customers/register', {
          method: 'POST',
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneNumber: contactPhone.trim(),
          }),
        });
        setMustCompleteProfile(false);
      }

      await apiFetch("/customers/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (savePickup && pickupAddress.trim()) {
        await apiFetch('/customers/addresses', {
          method: 'POST',
          body: JSON.stringify({
            label: saveLabel.trim() || 'Saved Place',
            address: pickupAddress.trim(),
            latitude: pickupLat,
            longitude: pickupLng,
            isDefault: false,
            contactPhone: contactPhone.trim() || undefined,
            pickupType,
            pickupAt: pickupAt || null,
          }),
        });

        const data = await apiFetch('/customers/saved-addresses');
        if (Array.isArray(data)) {
          setSavedAddresses(data as SavedAddress[]);
        }
      }

      setSuccess("Order created successfully");
      setProductName("");
      setDescription("");
      setLaundryType('wash');
      setWeightCategory('s');
      setServiceTimeMinutes(50);
      setBasketPhotos([]);
      setSavePickup(false);
      router.push('/customer');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Create order failed";
      if (message.toLowerCase().includes('unauthorized')) {
        setError('Session expired. Please login again.');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('auth_role');
        router.push('/');
        return;
      }
      if (message.toLowerCase().includes('customer profile not found')) {
        router.push('/customer/profile?returnTo=/customer/create-order');
        return;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasMounted) {
    return <div className="min-h-screen bg-slate-50 text-blue-900" />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-blue-900">
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
          <Link href="/customer/create-order" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold bg-blue-50 text-blue-700 shadow-sm transition-all border border-blue-100">
            <span className="mr-3 text-lg">➕</span>
            New Order
          </Link>
          <Link href="/customer/history" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
            <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🗒️</span>
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

      <main className="flex-1 p-6 pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white bg-white p-8 shadow-2xl shadow-blue-100/50">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight">Create Order</h1>
          <Link href="/customer" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-slate-50">
            Back
          </Link>
        </div>

        <p className="mb-6 text-sm font-medium text-blue-700/70">
          Fill in order details. You can open Map Test to help choose coordinates.
        </p>

        <div className="mb-6 flex gap-3">
          <a
            href="/maptest"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700"
          >
            Open Map Test
          </a>
          <button
            type="button"
            onClick={useCurrentLocation}
            className="rounded-xl border border-emerald-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-50"
          >
            Use Current Location
          </button>
          <button
            type="button"
            onClick={() => {
              setPickupLatitude(String(DEFAULT_PICKUP.lat));
              setPickupLongitude(String(DEFAULT_PICKUP.lng));
            }}
            className="rounded-xl border border-blue-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50"
          >
            Use Mock Coordinates
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-blue-700">Saved Pickup Addresses</p>
          {isLoadingSaved ? (
            <p className="text-sm text-blue-700/60">Loading saved places...</p>
          ) : savedAddresses.length === 0 ? (
            <p className="text-sm text-blue-700/60">No saved pickup addresses yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {savedAddresses.map((item, index) => (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  onClick={() => {
                    setPickupAddress(item.address ?? '');
                    if (Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
                      setPickupLongitude(String(item.coordinates[0]));
                      setPickupLatitude(String(item.coordinates[1]));
                    }
                    if (typeof item.contactPhone === 'string' && item.contactPhone.trim()) {
                      setContactPhone(item.contactPhone);
                    }
                    if (item.pickupType === 'schedule') {
                      setPickupType('schedule');
                      if (item.pickupAt) {
                        const d = new Date(item.pickupAt);
                        if (!Number.isNaN(d.getTime())) {
                          setPickupDate(d.toISOString().slice(0, 10));
                          setPickupTime(d.toISOString().slice(11, 16));
                        }
                      }
                    } else {
                      setPickupType('now');
                    }
                  }}
                  className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
          <div ref={mapContainerRef} className="h-64 w-full" />
        </div>
        <p className="-mt-3 mb-5 text-xs font-semibold text-blue-700/70">Drag marker or click on map to change pickup location.</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          {mustCompleteProfile && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-amber-700">
                Add customer info first
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-bold">First Name</label>
                  <input
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
                    placeholder="Your first name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold">Last Name</label>
                  <input
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
                    placeholder="Your last name"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold text-amber-700/80">
                These details are required before placing your first order.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-bold">Product Name</label>
            <input
              required
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="Laundry bag #1"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-bold">Laundry Type</label>
              <select
                value={laundryType}
                onChange={(event) => setLaundryType(event.target.value as 'wash' | 'dry')}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              >
                <option value="wash">Wash + Dry Laundry</option>
                <option value="dry">Dry Only Laundry</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">Weight (kg)</label>
              <select
                value={weightCategory}
                onChange={(event) => setWeightCategory(event.target.value as 's' | 'm' | 'l')}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              >
                <option value="s">S (0 - 4 kg)</option>
                <option value="m">M (6 - 10 kg)</option>
                <option value="l">L (10 - 20 kg)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">Drying Time (อบผ้า กี่นาที)</label>
              <select
                value={String(serviceTimeMinutes)}
                onChange={(event) => setServiceTimeMinutes(Number(event.target.value))}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              >
                <option value="50">50</option>
                <option value="75">75</option>
                <option value="100">100</option>
                <option value="125">125</option>
                <option value="150">150</option>
              </select>
              <p className="mt-1 text-xs font-semibold text-blue-700/70">เลือกเวลาอบผ้าเป็นนาที (เช่น 50, 75, 100 นาที)</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Basket Photos</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setBasketPhotos(Array.from(event.target.files ?? []))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
            {basketPhotos.length > 0 && (
              <p className="mt-1 text-xs font-semibold text-blue-700/70">{basketPhotos.length} file(s) selected</p>
            )}
            {basketPhotoPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {basketPhotoPreviews.map((previewUrl, index) => (
                  <div key={`${previewUrl}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={previewUrl}
                      alt={`Basket preview ${index + 1}`}
                      className="h-24 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="Optional details"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Contact Phone</label>
            <input
              required
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="e.g. 0812345678"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold">Pickup Latitude</label>
              <input
                required
                value={pickupLatitude}
                onChange={(event) => setPickupLatitude(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">Pickup Longitude</label>
              <input
                required
                value={pickupLongitude}
                onChange={(event) => setPickupLongitude(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">Pickup Address</label>
            <input
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="mb-2 text-sm font-bold">Pickup Time</p>
            <div className="mb-3 flex gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <input
                  type="radio"
                  name="pickupType"
                  checked={pickupType === 'now'}
                  onChange={() => setPickupType('now')}
                />
                Pickup Now
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <input
                  type="radio"
                  name="pickupType"
                  checked={pickupType === 'schedule'}
                  onChange={() => setPickupType('schedule')}
                />
                Schedule Pickup
              </label>
            </div>

            {pickupType === 'schedule' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="date"
                  min={minScheduleDate}
                  value={pickupDate}
                  onChange={(event) => setPickupDate(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-500"
                />
                <select
                  value={pickupTime}
                  onChange={(event) => setPickupTime(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-500"
                >
                  {scheduleTimeOptions.length === 0 ? (
                    <option value="">No available time</option>
                  ) : (
                    scheduleTimeOptions.map((item) => (
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

          <div className="rounded-2xl border border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <input
                type="checkbox"
                checked={savePickup}
                onChange={(event) => setSavePickup(event.target.checked)}
              />
              Save this pickup address for future use
            </label>

            {savePickup && (
              <input
                value={saveLabel}
                onChange={(event) => setSaveLabel(event.target.value)}
                className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
                placeholder="Label e.g. Home / Condo / Office"
              />
            )}
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Auto Price</p>
            <p className="mt-1 text-lg font-black text-emerald-800">฿{estimatedPrice.totalPrice.toLocaleString()}</p>
            <div className="mt-1 space-y-1 text-xs font-semibold text-emerald-700/90">
              <p>สูตรค่าซัก: {laundryType === 'dry' ? '0 บาท (Dry only)' : `(${serviceTimeMinutes} ÷ 50) × ${unitPrice} บาท`}</p>
              <p>สูตรค่าอบผ้า: ({serviceTimeMinutes} ÷ 50) × 20 บาท</p>
            </div>
            <div className="mt-3 border-t border-emerald-200 pt-2 text-xs font-semibold text-emerald-800 space-y-1">
              <div className="flex items-center justify-between">
                <span>ค่าซัก</span>
                <span>฿{estimatedPrice.washPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ค่าอบผ้า</span>
                <span>฿{estimatedPrice.dryPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>รวมค่าซัก/อบ</span>
                <span>฿{estimatedPrice.baseLaundryPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ค่าจัดส่ง</span>
                <span>฿{estimatedPrice.deliveryFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{pickupType === 'now' ? 'ค่าบริการ Pickup Now' : 'ค่าบริการ Pickup Schedule'}</span>
                <span>฿{estimatedPrice.pickupServiceFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between border-t border-emerald-200 pt-1 font-black">
                <span>รวมสุทธิ</span>
                <span>฿{estimatedPrice.totalPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || isLoading}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Creating..." : "Create Order"}
          </button>
        </form>

        {success && <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700">{success}</p>}
        {error && <p className="mt-4 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-2">
          <Link href="/customer" className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70">
            <span className="text-base">🏠</span>
            Dashboard
          </Link>
          <Link href="/customer/create-order" className="flex flex-col items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-black text-blue-700">
            <span className="text-base">➕</span>
            New Order
          </Link>
          <Link href="/customer/history" className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold text-blue-700/70">
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
