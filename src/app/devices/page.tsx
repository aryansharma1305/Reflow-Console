"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    getUserEmail,
    getUserName,
    isAuthenticated,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useMqttStatus } from "@/lib/useMqttDevice";
import { Cpu, Plus, Search, ChevronRight, RefreshCw } from "lucide-react";

// ── Per-row MQTT status badge ────────────────────────────────────
function DeviceStatusBadge({ serial }: { serial: string }) {
    const { isOnline, checked } = useMqttStatus(serial, 8000);

    if (!checked) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                Checking…
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                isOnline
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
            }`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${
                    isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
            />
            {isOnline ? "Online" : "Offline"}
        </span>
    );
}

export default function DevicesPage() {
    const router = useRouter();
    const email = getUserEmail();
    const fullName = getUserName();

    const { devices, loading, error: cacheError, refresh } = useProjects();
    const [search, setSearch] = useState("");
    const [localError] = useState<string | null>(null);

    const error = localError || cacheError;

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return devices.filter((d) => {
            const dev = (d as any).device || d;
            return (
                dev.name?.toLowerCase().includes(q) ||
                (dev.serial_no || dev.serialNumber || "").toLowerCase().includes(q) ||
                d.projectName?.toLowerCase().includes(q)
            );
        });
    }, [devices, search]);

    return (
        <DashboardLayout
            title="Devices"
            breadcrumbs={[{ label: "Workspace", href: "/" }, { label: "Devices" }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary">Devices</h2>
                        <p className="text-sm text-text-muted mt-1">
                            All IoT devices — live status via MQTT.
                        </p>
                        {error && <p className="text-xs text-amber-600 mt-1">⚠ {error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refresh()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                        <button
                            onClick={() => router.push("/devices/add")}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Device
                        </button>
                    </div>
                </motion.div>

                {/* Summary stats */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                >
                    {[
                        { label: "Total", value: devices.length, color: "text-text-primary", bg: "bg-white" },
                        { label: "In Projects", value: Array.from(new Set(devices.map((d) => d.projectId))).length, color: "text-blue-700", bg: "bg-blue-50" },
                        { label: "Filtered", value: filtered.length, color: "text-amber-700", bg: "bg-amber-50" },
                    ].map((s) => (
                        <div key={s.label} className={`rounded-xl ${s.bg} border border-border-subtle p-4`}>
                            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{s.label}</p>
                            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Search */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="relative max-w-md"
                >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search by name, serial number, or project…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                </motion.div>

                {/* Devices Table */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="rounded-xl bg-white border border-border-subtle overflow-hidden"
                >
                    {/* Table header */}
                    <div className="grid grid-cols-[2fr_1.5fr_1.2fr_1fr_auto] gap-4 px-6 py-3 text-[11px] font-bold text-text-muted uppercase tracking-wider border-b border-border-subtle bg-surface-muted">
                        <span>Device</span>
                        <span>Serial Number</span>
                        <span>Project</span>
                        <span>MQTT Status</span>
                        <span></span>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <p className="text-sm text-text-muted">Loading devices...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-surface-muted flex items-center justify-center mb-4">
                                <Cpu className="w-7 h-7 text-text-muted" />
                            </div>
                            <p className="text-sm font-semibold text-text-primary mb-1">No devices found</p>
                            <p className="text-xs text-text-muted mb-4">
                                {search ? "Try a different search term" : "Add your first device to a project"}
                            </p>
                            {!search && (
                                <button
                                    onClick={() => router.push("/devices/add")}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Device
                                </button>
                            )}
                        </div>
                    ) : (
                        filtered.map((device, i) => {
                            const d = (device as any).device || device;
                            const serial = d.serial_no || d.serialNumber || "—";
                            const devId = d.id || d._id || serial;
                            const devName = d.name || serial;
                            
                            return (
                                <motion.div
                                    key={`${devId}-${i}`}
                                    onClick={() => router.push(`/devices/${devId}`)}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: i * 0.04 }}
                                    className="grid grid-cols-[2fr_1.5fr_1.2fr_1fr_auto] gap-4 items-center px-6 py-4 border-b border-border-subtle last:border-0 hover:bg-surface-muted/50 transition-colors group cursor-pointer"
                                >
                                    {/* Device name */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                                            <Cpu className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-text-primary truncate">
                                                {devName}
                                            </p>
                                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider truncate mt-0.5">
                                                {d.description || "IoT Device"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Serial */}
                                    <div>
                                        <code className="text-[11px] font-bold text-text-muted bg-surface-muted px-2 py-1.5 rounded-md font-mono w-fit border border-border-subtle shadow-sm">
                                            {serial}
                                        </code>
                                    </div>

                                    {/* Project */}
                                    <div>
                                        <span className="text-xs text-primary font-bold bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20 truncate">
                                            {device.projectName || "—"}
                                        </span>
                                    </div>

                                    {/* MQTT-derived live status */}
                                    <div>
                                        {serial !== "—" ? (
                                            <DeviceStatusBadge serial={serial} />
                                        ) : (
                                            <span className="text-xs font-medium text-text-muted px-2 py-1 bg-surface-muted rounded-full">No serial</span>
                                        )}
                                    </div>

                                    {/* Action */}
                                    <div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/devices/${devId}`);
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary border border-primary/20 bg-primary/5 hover:bg-primary hover:text-white transition-all shadow-sm flex items-center gap-1"
                                        >
                                            Open <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </motion.div>

                {filtered.length > 0 && (
                    <p className="text-xs text-text-muted text-right">
                        Showing {filtered.length} of {devices.length} devices • Status live from MQTT
                    </p>
                )}
            </div>
        </DashboardLayout>
    );
}
