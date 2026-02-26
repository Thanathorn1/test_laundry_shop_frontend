"use client";

import { useEffect, useState } from 'react';
import { apiFetch, apiUpload, API_BASE_URL } from '@/lib/api';

interface RiderProfile {
    fullName: string;
    licensePlate: string;
    drivingLicense: string;
    phone: string;
    address: string;
    riderImageUrl?: string;
    vehicleImageUrl?: string;
    isApproved: boolean;
}

export default function RiderProfile() {
    const [profile, setProfile] = useState<RiderProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, []);

    const emptyProfile: RiderProfile = {
        fullName: '',
        licensePlate: '',
        drivingLicense: '',
        phone: '',
        address: '',
        isApproved: false,
        riderImageUrl: '',
        vehicleImageUrl: '',
    };

    const normalizeProfile = (input: unknown): RiderProfile => {
        const source = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
        return {
            fullName: typeof source.fullName === 'string' ? source.fullName : '',
            licensePlate: typeof source.licensePlate === 'string' ? source.licensePlate : '',
            drivingLicense: typeof source.drivingLicense === 'string' ? source.drivingLicense : '',
            phone: typeof source.phone === 'string' ? source.phone : '',
            address: typeof source.address === 'string' ? source.address : '',
            riderImageUrl: typeof source.riderImageUrl === 'string' ? source.riderImageUrl : '',
            vehicleImageUrl: typeof source.vehicleImageUrl === 'string' ? source.vehicleImageUrl : '',
            isApproved: Boolean(source.isApproved),
        };
    };

    const isMissingProfileError = (message: string) => {
        const m = (message || '').toLowerCase();
        return (
            m.includes('not found') ||
            m.includes('โปรไฟล์') ||
            m.includes('ยังไม่ได้') ||
            m.includes('ไม่มี')
        );
    };

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const data = await apiFetch('/rider/profile');
            setProfile(normalizeProfile(data));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);

            // New rider might not have a profile yet: allow creating one
            if (isMissingProfileError(message)) {
                setError(null);
                setProfile(emptyProfile);
                return;
            }

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!profile) return;

        try {
            setIsUpdating(true);
            const formData = new FormData();
            formData.append('fullName', profile.fullName);
            formData.append('licensePlate', profile.licensePlate);
            formData.append('drivingLicense', profile.drivingLicense);
            formData.append('phone', profile.phone);
            formData.append('address', profile.address);

            // Handle file inputs separately if needed, but here we just send the text data
            // For images, we provide separate upload buttons or handle them in the same PATCH
            await apiUpload('/rider/profile', formData);
            alert('Profile updated successfully');
            fetchProfile();
        } catch (err: unknown) {
            if (err instanceof Error) {
                alert(err.message);
            }
        } finally {
            setIsUpdating(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const formData = new FormData();
            formData.append(field, file);
            // We also need to send the rest of the profile data as the backend expect the whole DTO
            if (profile) {
                formData.append('fullName', profile.fullName);
                formData.append('licensePlate', profile.licensePlate);
                formData.append('drivingLicense', profile.drivingLicense);
                formData.append('phone', profile.phone);
                formData.append('address', profile.address);
            }

            await apiUpload('/rider/profile', formData);
            alert('Image uploaded successfully');
            fetchProfile();
        } catch (err: unknown) {
            if (err instanceof Error) {
                alert(err.message);
            }
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="text-blue-900 font-black uppercase tracking-widest text-xs animate-pulse">กำลังโหลดโปรไฟล์ของคุณ...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="max-w-xl mx-auto mt-20 p-10 bg-white rounded-[2.5rem] shadow-2xl shadow-rose-100/50 border border-rose-50 text-center">
            <div className="h-20 w-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">⚠️</div>
            <h2 className="text-2xl font-black text-blue-900 mb-4 tracking-tight">ไม่ได้รับอนุญาต</h2>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                ขออภัย บัญชีของคุณอาจไม่มีสิทธิ์เข้าถึงหน้านี้ หรือเซสชันหมดอายุแล้ว
                <br /><span className="text-rose-500 text-xs font-bold mt-2 block">Error: {error}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                    onClick={() => window.location.reload()}
                    className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-100"
                >
                    ลองใหม่อีกครั้ง
                </button>
                <button
                    onClick={() => {
                        localStorage.clear();
                        window.location.href = '/';
                    }}
                    className="px-8 py-4 bg-slate-50 text-blue-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all"
                >
                    กลับไปหน้าล็อกอิน
                </button>
            </div>
        </div>
    );

    if (!profile) return (
        <div className="max-w-xl mx-auto mt-20 p-10 bg-white rounded-[2.5rem] shadow-2xl border border-blue-100 text-center">
            <h2 className="text-2xl font-black text-blue-900 mb-4 tracking-tight">ไม่พบโปรไฟล์</h2>
            <p className="text-slate-500 font-medium mb-8">กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งาน</p>
            <button
                onClick={() => window.location.href = '/'}
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-100"
            >
                กลับหน้าหลัก
            </button>
        </div>
    );

    return (
        <div className="p-8">
            <div className="max-w-3xl bg-white p-10 rounded-[2rem] shadow-2xl shadow-blue-100/50 border border-white">
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-blue-900 tracking-tight">Rider Profile</h1>
                    <p className="text-blue-700/60 text-sm font-medium">Update your professional details and vehicle information.</p>
                </div>

                <div className="mb-8 grid grid-cols-2 gap-8">
                    <div>
                        <label className="mb-3 block text-[10px] font-black text-blue-600 uppercase tracking-widest">Rider Identity</label>
                        <div className="relative h-48 w-48 overflow-hidden rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 transition-all hover:border-blue-400 hover:bg-white group cursor-pointer shadow-inner">
                            {profile.riderImageUrl ? (
                                <img
                                    src={profile.riderImageUrl.startsWith('http') ? profile.riderImageUrl : `${API_BASE_URL}${profile.riderImageUrl}`}
                                    alt="Rider"
                                    className="h-full w-full object-cover transition-transform group-hover:scale-110"
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                                    <span className="text-2xl mb-1">📸</span>
                                    <span className="text-[10px] font-black uppercase tracking-tight">Upload Rider Image</span>
                                </div>
                            )}
                            <input
                                type="file"
                                className="absolute inset-0 cursor-pointer opacity-0"
                                onChange={(e) => handleImageUpload(e, 'riderImage')}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-3 block text-[10px] font-black text-sky-500 uppercase tracking-widest">Vehicle Details</label>
                        <div className="relative h-48 w-48 overflow-hidden rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 transition-all hover:border-sky-400 hover:bg-white group cursor-pointer shadow-inner">
                            {profile.vehicleImageUrl ? (
                                <img
                                    src={profile.vehicleImageUrl.startsWith('http') ? profile.vehicleImageUrl : `${API_BASE_URL}${profile.vehicleImageUrl}`}
                                    alt="Vehicle"
                                    className="h-full w-full object-cover transition-transform group-hover:scale-110"
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                                    <span className="text-2xl mb-1">🚗</span>
                                    <span className="text-[10px] font-black uppercase tracking-tight">Upload Vehicle Image</span>
                                </div>
                            )}
                            <input
                                type="file"
                                className="absolute inset-0 cursor-pointer opacity-0"
                                onChange={(e) => handleImageUpload(e, 'vehicleImage')}
                            />
                        </div>
                    </div>
                </div>

                <form onSubmit={handleUpdate} className="grid sm:grid-cols-2 gap-6">
                    <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-black text-blue-300 uppercase tracking-widest">Legal Full Name</label>
                        <input
                            type="text"
                            className="w-full rounded-xl border border-blue-50 bg-slate-50 px-4 py-3 text-blue-900 font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                            placeholder="John Doe"
                            value={profile.fullName}
                            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black text-blue-300 uppercase tracking-widest">Phone Number</label>
                        <input
                            type="text"
                            className="w-full rounded-xl border border-blue-50 bg-slate-50 px-4 py-3 text-blue-900 font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                            placeholder="08X-XXX-XXXX"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[10px] font-black text-blue-300 uppercase tracking-widest">License Plate</label>
                        <input
                            type="text"
                            className="w-full rounded-xl border border-blue-50 bg-slate-50 px-4 py-3 text-blue-900 font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                            placeholder="ABC-1234"
                            value={profile.licensePlate}
                            onChange={(e) => setProfile({ ...profile, licensePlate: e.target.value })}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-black text-blue-300 uppercase tracking-widest">Driving License Number</label>
                        <input
                            type="text"
                            className="w-full rounded-xl border border-blue-50 bg-slate-50 px-4 py-3 text-blue-900 font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                            value={profile.drivingLicense}
                            onChange={(e) => setProfile({ ...profile, drivingLicense: e.target.value })}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-black text-blue-300 uppercase tracking-widest">Home Address</label>
                        <textarea
                            className="w-full rounded-xl border border-blue-50 bg-slate-50 px-4 py-3 text-blue-900 font-bold outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
                            rows={3}
                            value={profile.address}
                            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                        />
                    </div>
                    <div>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${profile.isApproved ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                            {profile.isApproved ? 'Approved' : 'Pending Approval'}
                        </span>
                    </div>
                    <button
                        type="submit"
                        disabled={isUpdating}
                        className="sm:col-span-2 w-full mt-4 rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white shadow-xl shadow-blue-100/50 hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group"
                    >
                        {isUpdating ? (
                            <>
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Updating Profile...
                            </>
                        ) : (
                            <>
                                <span>💾</span>
                                Save Professional Changes
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
