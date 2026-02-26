"use client";

import React, { useEffect, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

const SHOP: LatLng = { lat: 13.7563, lng: 100.5018 }; // Central Bangkok (mock)
const CUSTOMER: LatLng = { lat: 13.745, lng: 100.534 }; // mock customer

function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) return resolve();

    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function haversineKm(a: LatLng, b: LatLng) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function mockBackendCompute(from: LatLng, to: LatLng) {
  const distanceKm = haversineKm(from, to);
  const speedKmph = 30; // average speed
  const durationMin = (distanceKm / speedKmph) * 60;
  const base = 30;
  const perKm = 5;
  const fee = Math.max(base, Math.round((base + perKm * distanceKm) * 100) / 100);
  return { distanceKm: Math.round(distanceKm * 100) / 100, durationMin: Math.round(durationMin * 10) / 10, fee };
}

export default function MapTestPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const LRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const routeRef = useRef<any>(null);

  const [selected, setSelected] = useState<LatLng | null>(null);
  const [rider, setRider] = useState<LatLng>({ lat: 13.75, lng: 100.52 });
  const [lastResult, setLastResult] = useState<{ distanceKm: number; durationMin: number; fee: number } | null>(null);
  const [mode, setMode] = useState<"shop->customer" | "rider->customer">("shop->customer");

  // init map and leaflet
  useEffect(() => {
    let mounted = true;
    loadLeaflet()
      .then(() => {
        if (!mounted) return;
        const L = (window as any).L;
        LRef.current = L;
        const map = L.map("map", { center: [SHOP.lat, SHOP.lng], zoom: 13 });
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        // add static markers
        markersRef.current.shop = L.marker([SHOP.lat, SHOP.lng]).addTo(map).bindPopup("Shop (mock)");
        markersRef.current.customer = L.marker([CUSTOMER.lat, CUSTOMER.lng]).addTo(map).bindPopup("Customer (mock)");
        markersRef.current.rider = L.marker([rider.lat, rider.lng], { opacity: 0.9 }).addTo(map).bindPopup("Rider (mock)");

        // click to pick location
        map.on("click", (e: any) => {
          const picked = { lat: e.latlng.lat, lng: e.latlng.lng };
          setSelected(picked);
          if (markersRef.current.selected) {
            markersRef.current.selected.setLatLng([picked.lat, picked.lng]);
          } else {
            markersRef.current.selected = L.marker([picked.lat, picked.lng], { draggable: true }).addTo(map).bindPopup("Selected");
            markersRef.current.selected.on("dragend", (ev: any) => {
              const pos = ev.target.getLatLng();
              setSelected({ lat: pos.lat, lng: pos.lng });
            });
          }
        });
      })
      .catch((err) => console.error("Failed loading leaflet", err));

    return () => {
      mounted = false;
      try {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
        }
      } catch (e) {}
    };
  }, []);

  // update rider marker when rider state changes
  useEffect(() => {
    const L = LRef.current;
    if (!L) return;
    const m = markersRef.current.rider;
    if (m) {
      m.setLatLng([rider.lat, rider.lng]);
    }
  }, [rider]);

  // simulate rider movement towards customer when mode is rider->customer
  useEffect(() => {
    const t = setInterval(() => {
      setRider((r) => {
        const to = CUSTOMER;
        const step = 0.0005; // small step
        const dx = to.lat - r.lat;
        const dy = to.lng - r.lng;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.0006) return r;
        return { lat: r.lat + (dx / dist) * step, lng: r.lng + (dy / dist) * step };
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // redraw route when mode changes, selected changes, or rider/customer/shop move
    const L = LRef.current;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const from = mode === "shop->customer" ? SHOP : rider;
    const to = CUSTOMER;

    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    const poly = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: "blue" }).addTo(map);
    routeRef.current = poly;
    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
  }, [mode, rider, selected]);

  const onConfirm = () => {
    const from = mode === "shop->customer" ? SHOP : rider;
    const to = selected ?? CUSTOMER;
    const res = mockBackendCompute(from, to);
    setLastResult(res);
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 text-black">
      <h2 className="mb-3 text-2xl font-semibold">Map Test (mock)</h2>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: "70%", minHeight: 500 }}>
          <div id="map" ref={mapRef} style={{ width: "100%", height: 500, borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }} />
        </div>

        <aside style={{ width: "30%" }}>
          <div style={{ marginBottom: 12 }}>
            <strong>Mode:</strong>
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "block", marginBottom: 6 }}>
                <input type="radio" checked={mode === "shop->customer"} onChange={() => setMode("shop->customer")} /> Shop → Customer
              </label>
              <label style={{ display: "block" }}>
                <input type="radio" checked={mode === "rider->customer"} onChange={() => setMode("rider->customer")} /> Rider → Customer
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div><strong>Picked:</strong></div>
            <div style={{ marginTop: 6 }}>{selected ? `${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}` : "(click map to pick)"}</div>
          </div>

          <button onClick={onConfirm} style={{ marginBottom: 12, padding: "8px 12px" }}>Confirm Location → Compute</button>

          {lastResult && (
            <div style={{ background: "#fff", padding: 12, borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
              <div><strong>Distance:</strong> {lastResult.distanceKm} km</div>
              <div><strong>Duration:</strong> {lastResult.durationMin} min</div>
              <div><strong>Fee:</strong> ฿{lastResult.fee}</div>
            </div>
          )}

          <div style={{ marginTop: 16, background: "#fff", padding: 8, borderRadius: 6 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Legend</strong></div>
            <div style={{ fontSize: 13 }}>• Shop (fixed)</div>
            <div style={{ fontSize: 13 }}>• Customer (fixed)</div>
            <div style={{ fontSize: 13 }}>• Rider (moving)</div>
            <div style={{ fontSize: 13 }}>• Selected (click map)</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
