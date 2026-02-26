"use client";

import { useEffect, useRef } from 'react';

interface OSMMapProps {
    id: string;
    className?: string;
    callback?: (map: {
        location: (point: { lat: number; lon: number }) => void;
        Overlays: {
            add: (marker: { lat: number; lon: number; title?: string; detail?: string }) => void;
        };
    }) => void;
}

declare global {
    interface Window {
        L: any;
    }
}

let leafletLoaderPromise: Promise<any> | null = null;

function loadLeaflet() {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.L) return Promise.resolve(window.L);
    if (leafletLoaderPromise) return leafletLoaderPromise;

    leafletLoaderPromise = new Promise((resolve, reject) => {
        const cssId = 'leaflet-css-cdn';
        if (!document.getElementById(cssId)) {
            const css = document.createElement('link');
            css.id = cssId;
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
        }

        const scriptId = 'leaflet-js-cdn';
        const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

        const done = () => {
            if (window.L) resolve(window.L);
            else reject(new Error('Leaflet failed to load'));
        };

        if (existing) {
            if (window.L) done();
            else existing.addEventListener('load', done, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = done;
        script.onerror = () => reject(new Error('Failed to load Leaflet script'));
        document.body.appendChild(script);
    });

    return leafletLoaderPromise;
}

export default function OpenStreetMapView({ id, callback, className }: OSMMapProps) {
    const mapRef = useRef<any>(null);

    useEffect(() => {
        let mounted = true;

        const initMap = async () => {
            const L = await loadLeaflet();
            if (!mounted || !L || mapRef.current) return;

            const placeholder = document.getElementById(id);
            if (!placeholder) return;

            const map = L.map(placeholder, {
                center: [13.7563, 100.5018],
                zoom: 13,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map);

            const adaptedMap = {
                location: (point: { lat: number; lon: number }) => {
                    map.setView([Number(point.lat), Number(point.lon)], map.getZoom());
                },
                Overlays: {
                    add: (marker: { lat: number; lon: number; title?: string; detail?: string }) => {
                        const item = L.marker([Number(marker.lat), Number(marker.lon)]);
                        const popup = [marker.title, marker.detail].filter(Boolean).join('<br/>');
                        if (popup) item.bindPopup(popup);
                        item.addTo(map);
                    },
                },
            };

            mapRef.current = map;
            setTimeout(() => map.invalidateSize(), 50);
            callback?.(adaptedMap);
        };

        initMap();

        return () => {
            mounted = false;
            if (mapRef.current && typeof mapRef.current.remove === 'function') {
                mapRef.current.remove();
            }
            mapRef.current = null;
        };
    }, [id, callback]);

    return <div id={id} className={className} style={{ width: '100%', height: '100%' }} />;
}
