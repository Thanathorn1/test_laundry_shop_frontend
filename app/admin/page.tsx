"use client";

import Link from 'next/link';

export default function AdminPage() {
    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-blue-900">
            {/* Sidebar */}
            <aside className="w-72 border-r border-blue-50 bg-white p-8 shadow-sm h-screen sticky top-0">
                <div className="flex items-center gap-3 mb-10">
                    <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                        <span className="text-white font-black text-xl">A</span>
                    </div>
                    <h2 className="text-xl font-black text-blue-900 tracking-tight uppercase">Admin Panel</h2>
                </div>
                <nav className="space-y-1.5 focus:outline-none">
                    <div className="px-4 py-2 text-[10px] font-black text-blue-300 uppercase tracking-widest">General</div>
                    <Link href="/admin" className="flex items-center rounded-xl px-4 py-3 text-sm font-bold bg-blue-50 text-blue-700 shadow-sm transition-all border border-blue-100">
                        <span className="mr-3 text-lg">📊</span>
                        Dashboard
                    </Link>
                    <Link href="/admin/customers" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">👤</span>
                        Customer List
                    </Link>
                    <Link href="/admin/riders" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🛵</span>
                        Rider List
                    </Link>
                    <Link href="/admin/admins" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🛡️</span>
                        Admin List
                    </Link>
                    <Link href="/admin/employees" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">🧑‍🔧</span>
                        Employee List
                    </Link>
                    <Link href="/admin/pin-shop" className="flex items-center w-full rounded-xl px-4 py-3 text-sm font-bold text-blue-700/60 hover:bg-blue-50 hover:text-blue-700 transition-all group">
                        <span className="mr-3 text-lg opacity-50 group-hover:opacity-100">📍</span>
                        Pin Shop
                    </Link>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-12">
                <header className="mb-12">
                    <h1 className="text-4xl font-black text-blue-900 tracking-tight mb-2">System Overview</h1>
                    <p className="text-blue-700/60 font-medium">Monitoring laundry operations and user performance.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    {[
                        { label: 'Total Revenue', value: '฿128,400', icon: '💰', color: 'blue' },
                        { label: 'Active Orders', value: '42', icon: '🧺', color: 'sky' },
                        { label: 'Online Riders', value: '8', icon: '🛵', color: 'emerald' }
                    ].map((stat, i) => (
                        <div key={i} className="bg-white p-8 rounded-[2rem] shadow-2xl shadow-blue-100/50 border border-white relative overflow-hidden group hover:-translate-y-1 transition-all">
                            <div className={`absolute top-0 right-0 h-24 w-24 bg-${stat.color}-50 rounded-bl-full -mr-8 -mt-8`}></div>
                            <span className="text-3xl mb-4 block">{stat.icon}</span>
                            <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest block mb-1">{stat.label}</span>
                            <span className="text-3xl font-black text-blue-900">{stat.value}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-blue-100/50 border border-white">
                    <h3 className="text-xl font-black text-blue-900 mb-6">Recent Activity Log</h3>
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">👤</div>
                                    <div>
                                        <p className="text-sm font-bold text-blue-900">New order accepted by Rider #00{i}</p>
                                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tight">2 mins ago</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">Details</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
