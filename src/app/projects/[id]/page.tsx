"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import LogoLoader from "@/components/LogoLoader";
import {
    getProjectDevices, deleteProject, getAllProjects,
    getUserEmail, getUserName, isAuthenticated,
} from "@/lib/api";
import {
    Plus, Search, Cpu, Wifi, WifiOff, AlertTriangle,
    Activity, Trash2, MoreVertical, RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DeviceRow {
    id?: string;
    status: string;
    name: string;
    serialNo: string;
    firmware?: string;
    lastHeartbeat?: string;
    description?: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; icon: React.ReactNode }> = {
    Online: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", icon: <Wifi className="w-3 h-3" /> },
    Offline: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", icon: <WifiOff className="w-3 h-3" /> },
    Standby: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", icon: <Activity className="w-3 h-3" /> },
    Warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", icon: <AlertTriangle className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_CONFIG[status] || STATUS_CONFIG.Standby;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "Online" ? "animate-pulse" : ""}`} />
            {status}
        </span>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
function ProjectDetailContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [projectName, setProjectName] = useState("Project");
    const [isOwner, setIsOwner] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    const email = getUserEmail();
    const fullName = getUserName();

    async function loadData(silent = false) {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        try {
            // Load project name
            const allData = await getAllProjects();
            const allProjects = allData?.data?.projects || allData?.projects || [];
            const proj = allProjects.find((p: { id?: string; _id?: string; createdBy?: { email?: string }; name?: string }) =>
                (p.id || p._id) === projectId);
            if (proj) {
                setProjectName(proj.name || "Project");
                setIsOwner(proj.createdBy?.email === email);
            }

            // Load devices
            const data = await getProjectDevices(projectId);
            console.log("[DEBUG] Raw devices API response:", JSON.stringify(data, null, 2));
            const list = data?.data?.devices || data?.devices || [];
            console.log("[DEBUG] First device raw object:", list[0]);
            const mapped: DeviceRow[] = list.map((dev: any) => {
                const d = dev.device || dev;
                const status = d.status === "active" ? "Online" : d.status === "inactive" ? "Offline" : d.status || "Standby";
                return {
                    id: d.id || d._id,
                    status,
                    name: d.name || d.serial_no || d.serialNumber || d.serialNo || d.serial_number || "Unnamed",
                    serialNo: d.serial_no || d.serialNumber || d.serialNo || d.serial_number || "—",
                    firmware: d.firmware || "N/A",
                    lastHeartbeat: d.lastSeen || d.lastHeartbeat || "Unknown",
                    description: d.description,
                };
            });
            setDevices(mapped);
        } catch (err) {
            console.error("Failed to load project data:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        if (!isAuthenticated()) {
            router.push("/login");
            return;
        }
        loadData();
    }, [projectId]);

    // Stats
    const total = devices.length;
    const online = devices.filter(d => d.status === "Online").length;
    const offline = devices.filter(d => d.status === "Offline").length;
    const warning = devices.filter(d => d.status === "Warning").length;

    // Filter
    const filtered = devices.filter(d => {
        const q = searchQuery.toLowerCase();
        const matchQ = d.name.toLowerCase().includes(q) || d.serialNo.toLowerCase().includes(q);
        const matchS = statusFilter === "All" || d.status === statusFilter;
        return matchQ && matchS;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (loading) return <LogoLoader text="Loading project..." />;

    return (
        <DashboardLayout
            title={projectName}
            breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: projectName }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">

                {/* ── Title Row ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{projectName}</h2>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {projectId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => loadData(true)}
                            disabled={refreshing}
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            onClick={() => router.push(`/devices/add?projectId=${projectId}`)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Device
                        </button>
                        {isOwner && (
                            <button
                                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </motion.div>

                {/* ── Delete confirm ── */}
                <AnimatePresence>
                    {showDeleteConfirm && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                            className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-sm font-semibold text-red-700">⚠ Delete this project? This cannot be undone.</p>
                            <div className="flex gap-2">
                                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700">Cancel</button>
                                <button disabled={deleting} onClick={async () => {
                                    setDeleting(true);
                                    try { await deleteProject(projectId); router.push("/projects"); }
                                    catch { setDeleting(false); setShowDeleteConfirm(false); }
                                }} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                                    {deleting ? "Deleting…" : "Yes, Delete"}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Total Devices", value: total, icon: <Cpu className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50", border: "border-blue-100" },
                        { label: "Online", value: online, icon: <Wifi className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-50", border: "border-emerald-100" },
                        { label: "Offline", value: offline, icon: <WifiOff className="w-5 h-5 text-red-400" />, bg: "bg-red-50", border: "border-red-100" },
                        { label: "Warning", value: warning, icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, bg: "bg-amber-50", border: "border-amber-100" },
                    ].map(card => (
                        <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className={`rounded-xl border ${card.border} ${card.bg} p-4 flex items-center gap-4`}>
                            <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                                {card.icon}
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{card.value}</p>
                                <p className="text-xs text-slate-500">{card.label}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ── Devices Table ── */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-white border border-slate-100 overflow-hidden">

                    {/* Search + Filter bar */}
                    <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by name or serial…"
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                                className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {["All", "Online", "Offline", "Warning", "Standby"].map(s => (
                                <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                        <div className="grid grid-cols-[1fr_1.5fr_1.2fr_0.8fr_1fr_auto] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                            {["Status", "Device Name", "Serial No.", "Firmware", "Last Seen", ""].map(h => (
                                <span key={h} className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</span>
                            ))}
                        </div>

                    {/* Rows */}
                    {paginated.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <Cpu className="w-7 h-7 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">
                                {devices.length === 0 ? "No devices yet" : "No devices match your filter"}
                            </p>
                            {devices.length === 0 && (
                                <button
                                    onClick={() => router.push(`/devices/add?projectId=${projectId}`)}
                                    className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Add First Device
                                </button>
                            )}
                        </div>
                    ) : (
                        paginated.map((device, i) => (
                            <motion.div
                                key={device.serialNo + i}
                                onClick={() => router.push(`/devices/${device.id || device.serialNo}`)}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.025 }}
                                className="grid grid-cols-[1fr_1.5fr_1.2fr_0.8fr_1fr_auto] gap-4 px-5 py-3.5 items-center border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                            >
                                <div><StatusBadge status={device.status} /></div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 truncate">{device.name}</p>
                                    {device.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{device.description}</p>}
                                </div>
                                <code className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1.5 rounded-md font-mono w-fit border border-slate-200 shadow-sm">{device.serialNo}</code>
                                <span className="text-sm text-slate-500">{device.firmware || "N/A"}</span>
                                <span className="text-xs text-slate-500">{device.lastHeartbeat || "Unknown"}</span>
                                
                                {/* Action */}
                                <div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/devices/${device.id || device.serialNo}`);
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-1 opacity-0 group-hover:opacity-100"
                                    >
                                        Open <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}

                    {/* Footer / Pagination */}
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
                            <span className="text-xs text-slate-500">
                                Showing <span className="font-medium text-blue-600">{paginated.length}</span> of <span className="font-medium">{filtered.length}</span> devices
                            </span>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-white transition-colors disabled:opacity-40">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                                        <button key={n} onClick={() => setPage(n)}
                                            className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors ${page === n ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-white"}`}>
                                            {n}
                                        </button>
                                    ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-white transition-colors disabled:opacity-40">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </DashboardLayout>
    );
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
    return (
        <Suspense fallback={<LogoLoader text="Loading project..." />}>
            <ProjectDetailContent projectId={params.id} />
        </Suspense>
    );
}
