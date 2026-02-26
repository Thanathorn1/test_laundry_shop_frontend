"use client";

import { useEffect, useState, useMemo } from 'react';
import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import type { MapContainerProps, TileLayerProps, MarkerProps, PopupProps } from 'react-leaflet';

// Dynamically import Leaflet components
const MapContainer = dynamic(
    () => import('react-leaflet').then((mod) => mod.MapContainer),
    { ssr: false }
) as ComponentType<MapContainerProps>;
const TileLayer = dynamic(
    () => import('react-leaflet').then((mod) => mod.TileLayer),
    { ssr: false }
) as ComponentType<TileLayerProps>;
const Marker = dynamic(
    () => import('react-leaflet').then((mod) => mod.Marker),
    { ssr: false }
) as ComponentType<MarkerProps>;
const Popup = dynamic(
    () => import('react-leaflet').then((mod) => mod.Popup),
    { ssr: false }
) as ComponentType<PopupProps>;
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

interface Order {
    _id: string;
    customerName: string;
    pickupAddress: string;
    totalPrice: number;
    pickupLocation?: {
        type: string;
        coordinates: [number, number];
    };
    distance?: number;
}

interface Shop {
    _id: string;
    shopName?: string;
    label?: string;
    phoneNumber?: string;
    totalWashingMachines?: number;
    machineAvailable?: number;
    location?: {
        type: string;
        coordinates: [number, number];
    };
}

interface RiderMapClientProps {
    orders: Order[];
    shops?: Shop[];
    userLocation?: { lat: number; lon: number } | null;
    onAcceptOrder?: (orderId: string) => void;
}

export default function RiderMapClient({ orders, shops = [], userLocation, onAcceptOrder }: RiderMapClientProps) {
    const [mapView, setMapView] = useState<{ center: [number, number], zoom: number }>({
        center: [13.7563, 100.5018], // Default Bangkok
        zoom: 13
    });

    // Fix for Leaflet default icons
    const icon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const L = require('leaflet');
        return L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    }, []);

    // Custom rider icon
    const riderIcon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const L = require('leaflet');
        return L.divIcon({
            className: 'custom-rider-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="absolute h-6 w-6 rounded-full bg-blue-500/20 animate-ping"></div>
                    <div class="h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-lg ring-2 ring-blue-600/20"></div>
                </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });
    }, []);

    const shopIcon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        const L = require('leaflet');
        return L.divIcon({
            className: 'custom-shop-icon',
            html: `
                <div class="relative flex items-center justify-center">
                    <div class="h-4 w-4 rounded-full bg-rose-600 border-2 border-white shadow-lg ring-2 ring-rose-600/20"></div>
                </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
        });
    }, []);

    useEffect(() => {
        if (userLocation) {
            setMapView({ center: [userLocation.lat, userLocation.lon], zoom: 13 });
        }
    }, [userLocation]);

    return (
        <div className="h-full w-full relative">
            <MapContainer
                center={mapView.center}
                zoom={mapView.zoom}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController center={mapView.center} zoom={mapView.zoom} />

                {userLocation && riderIcon && (
                    <Marker position={[userLocation.lat, userLocation.lon]} icon={riderIcon}>
                        <Popup>
                            <div className="p-2">
                                <p className="font-black text-blue-600 text-xs uppercase tracking-widest">Your Location</p>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {orders.map((order) => {
                    const lat = order.pickupLocation?.coordinates?.[1];
                    const lon = order.pickupLocation?.coordinates?.[0];

                    if (!lat || !lon || !icon) return null;

                    return (
                        <Marker
                            key={order._id}
                            position={[lat, lon]}
                            icon={icon}
                        >
                            <Popup>
                                <div className="p-3 w-48 font-sans">
                                    <p className="font-black text-blue-900 text-sm mb-1">{order.customerName}</p>
                                    <p className="text-[10px] text-slate-500 font-bold mb-2 line-clamp-2">{order.pickupAddress}</p>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">฿{order.totalPrice}</span>
                                        {order.distance !== undefined && (
                                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">{order.distance} km</span>
                                        )}
                                    </div>
                                    {onAcceptOrder && (
                                        <button
                                            onClick={() => onAcceptOrder(order._id)}
                                            className="w-full bg-blue-600 text-white text-[10px] font-black py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 uppercase tracking-widest"
                                        >
                                            Accept Order
                                        </button>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {shops.map((shop) => {
                    const lat = shop.location?.coordinates?.[1];
                    const lon = shop.location?.coordinates?.[0];
                    if (!lat || !lon || !shopIcon) return null;

                    return (
                        <Marker
                            key={`shop-${shop._id}`}
                            position={[lat, lon]}
                            icon={shopIcon}
                        >
                            <Popup>
                                <div className="p-3 w-48 font-sans">
                                    <p className="font-black text-rose-600 text-xs uppercase tracking-widest mb-1">Shop</p>
                                    <p className="font-black text-blue-900 text-sm mb-2">{shop.shopName || shop.label || 'Laundry Shop'}</p>
                                    {shop.phoneNumber ? (
                                        <p className="text-[10px] text-slate-500 font-bold mb-2">☎ {shop.phoneNumber}</p>
                                    ) : null}
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                        {Number(shop.machineAvailable) || 0}/{Number(shop.totalWashingMachines) || 10} Available
                                    </span>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
