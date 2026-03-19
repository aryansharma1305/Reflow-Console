"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    getAllProjects,
    getProjectDevices,
    getUserEmail,
    getUserName,
    isAuthenticated,
    exportDeviceData,
} from "@/lib/api";
import { useMqttStatus } from "@/lib/useMqttDevice";
import {
    FileDown,
    Calendar,
    Database,
    FileText,
    Loader2,
    Download,
    Clock,
    Trash2,
    Mail,
    Plus,
    ChevronDown,
    Check,
} from "lucide-react";

interface Device {
    id?: string;
    serialNumber?: string;
    serial_no?: string;
    name: string;
}

interface Project {
    id?: string;
    _id?: string;
    name: string;
    devices?: Device[];
}

interface ScheduleEntry {
    _id?: string;
    device: string;
    email: string;
    frequency: string;
    reportType: string;
    error?: string;
}

// Simple status dot component matching Analytics/Devices list
function DeviceStatusDot({ serial }: { serial: string }) {
    const { isOnline, checked } = useMqttStatus(serial, 10000);
    if (!checked) return <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" title="Checking..." />;
    return (
        <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            title={isOnline ? "Online" : "Offline"}
        />
    );
}

export default function ReportsPage() {
    const email = getUserEmail();
    const fullName = getUserName();

    // Device selection
    const [projects, setProjects] = useState<Project[]>([]);
    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState("");
    const [loading, setLoading] = useState(true);

    // Export
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
    const [exporting, setExporting] = useState(false);
    const [exportData, setExportData] = useState<any[]>([]);

    // Dropdown state for Export
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
    const exportDropdownRef = useRef<HTMLDivElement>(null);

    // Dropdown state for Schedule
    const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
    const scheduleDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
                setExportDropdownOpen(false);
            }
            if (scheduleDropdownRef.current && !scheduleDropdownRef.current.contains(event.target as Node)) {
                setScheduleDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Email scheduling
    const [scheduleEmail, setScheduleEmail] = useState("");
    const [scheduleFrequency, setScheduleFrequency] = useState("daily");
    const [scheduleDevice, setScheduleDevice] = useState("");
    const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [loadingSchedules, setLoadingSchedules] = useState(false);

    const chartRef = useRef<HTMLDivElement>(null);

    // Load projects and devices
    useEffect(() => {
        async function fetchData() {
            if (!isAuthenticated()) return;
            try {
                const data = await getAllProjects();
                const projectList = Array.isArray(data) ? data : (data?.data?.projects || data?.projects || data?.data || []);
                console.log("[Reports] Projects:", projectList.length);
                setProjects(projectList);

                // Each project fetch returns its own bucket — no closure mutation
                const results = await Promise.allSettled(
                    projectList.map(async (p: Project) => {
                        const pId = p.id || p._id || "";
                        const bucket: Device[] = [];

                        // Fast path: devices nested in project
                        (p.devices || []).forEach((d: Device) => {
                            const dd = d as unknown as Record<string, string>;
                            const sn = d.serialNumber || dd.serial_no || dd.serialNo;
                            if (sn) bucket.push({ id: d.id, serialNumber: sn, name: d.name || sn });
                        });

                        // Full path: call getProjectDevices
                        if (pId) {
                            const res = await getProjectDevices(pId);
                            console.log(`[Reports] Project ${pId}:`, res);
                            const list: Record<string, string>[] = Array.isArray(res) ? res : (res?.data?.devices || res?.devices || res?.data || []);
                            if (Array.isArray(list)) {
                                list.forEach((d: Record<string, string>) => {
                                    const sn = d.serialNumber || d.serial_no || d.serialNo || d.serial_number || d.id || d._id;
                                    if (sn && !bucket.find((x) => x.serialNumber === sn)) {
                                        bucket.push({ id: d.id, serialNumber: sn, name: d.name || sn });
                                    }
                                });
                            }
                        }
                        return bucket;
                    })
                );

                const seen = new Set<string>();
                const devices: Device[] = [];
                results.forEach((r) => {
                    if (r.status === "fulfilled") {
                        r.value.forEach((d: Device) => {
                            const sn = d.serialNumber || "";
                            if (sn && !seen.has(sn)) { seen.add(sn); devices.push(d); }
                        });
                    }
                });

                console.log("[Reports] Devices found:", devices.length, devices.map(d => d.serialNumber));
                setAllDevices(devices);
                if (devices.length > 0) {
                    const first = devices[0].serialNumber || "";
                    setSelectedDevice(first);
                    setScheduleDevice(first);
                }
            } catch (err) {
                console.error("[Reports] Error:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Load schedules for selected device
    useEffect(() => {
        if (!selectedDevice) return;
        loadSchedule(selectedDevice);
    }, [selectedDevice]);

    async function loadSchedule(deviceId: string) {
        setLoadingSchedules(true);
        try {
            const res = await fetch("/api/email-config/get-device-info", {
                headers: { device: deviceId },
            });
            if (res.ok) {
                const data = await res.json();
                if (data && !data.message) {
                    setSchedules([data]);
                } else {
                    setSchedules([]);
                }
            } else {
                setSchedules([]);
            }
        } catch {
            setSchedules([]);
        } finally {
            setLoadingSchedules(false);
        }
    }

    // Export data from PostgreSQL
    async function handleExport() {
        if (!selectedDevice || !startDate || !endDate) {
            alert("Please select a device and date range");
            return;
        }

        setExporting(true);
        try {
            // Send full timestamp bounds for precision
            const startTimestamp = new Date(startDate).toISOString();
            const endTimestamp = new Date(endDate + "T23:59:59").toISOString();
            
            const resData = await exportDeviceData(selectedDevice, startTimestamp, endTimestamp);
            
            // Handle array or nested data structures
            const dataRowArray = Array.isArray(resData) ? resData 
                                 : (resData?.data || resData?.readings || resData?.deviceData || []);

            if (!dataRowArray || dataRowArray.length === 0) throw new Error("No data found");
            setExportData(dataRowArray);

            if (exportFormat === "csv") {
                downloadCSV(dataRowArray);
            } else {
                downloadPDF(dataRowArray);
            }
        } catch (err) {
            console.error("Export error:", err);
            alert("Failed to export data. Please check if the device has data in the selected range.");
        } finally {
            setExporting(false);
        }
    }

    function downloadCSV(data: Record<string, string | number>[]) {
        if (!data || data.length === 0) {
            alert("No data found for the selected range");
            return;
        }
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(","),
            ...data.map((row) => headers.map((h) => row[h] ?? "").join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedDevice}_${startDate}_to_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadPDF(data: Record<string, string | number>[]) {
        if (!data || data.length === 0) {
            alert("No data found for the selected range");
            return;
        }
        try {
            const { default: jsPDF } = await import("jspdf");
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(`Device Report: ${selectedDevice}`, 14, 20);
            doc.setFontSize(10);
            doc.text(`${startDate} to ${endDate}`, 14, 28);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

            const headers = Object.keys(data[0]);
            let y = 44;
            doc.setFontSize(8);

            // Header row
            headers.forEach((h, i) => {
                doc.text(h, 14 + i * 30, y);
            });
            y += 6;

            // Data rows
            data.slice(0, 100).forEach((row) => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                headers.forEach((h, i) => {
                    const val = row[h];
                    doc.text(String(val ?? ""), 14 + i * 30, y);
                });
                y += 5;
            });

            if (data.length > 100) {
                doc.text(`... and ${data.length - 100} more rows`, 14, y + 5);
            }

            doc.save(`${selectedDevice}_report.pdf`);
        } catch (err) {
            console.error("PDF generation error:", err);
            alert("Failed to generate PDF");
        }
    }

    // Save email schedule
    async function handleSaveSchedule() {
        if (!scheduleEmail || !scheduleDevice) {
            alert("Please fill in all schedule fields");
            return;
        }
        setSavingSchedule(true);
        try {
            const res = await fetch("/api/email-config/post-device-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device: scheduleDevice,
                    email: scheduleEmail,
                    frequency: scheduleFrequency,
                    reportType: exportFormat,
                }),
            });
            if (res.ok) {
                await loadSchedule(scheduleDevice);
                setScheduleEmail("");
            }
        } catch (err) {
            console.error("Error saving schedule:", err);
        } finally {
            setSavingSchedule(false);
        }
    }

    // Delete schedule
    async function handleDeleteSchedule(deviceId: string) {
        if (!confirm("Delete this report schedule?")) return;
        try {
            await fetch("/api/email-config/delete-schedule", {
                method: "DELETE",
                headers: { device: deviceId },
            });
            setSchedules((prev: any[]) => prev.filter((s: any) => s.device !== deviceId));
        } catch (err) {
            console.error("Error deleting schedule:", err);
        }
    }

    if (loading) {
        return (
            <DashboardLayout title="Reports" breadcrumbs={[{ label: "Reports" }]} user={{ name: fullName || "", email: email || "" }}>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Reports"
            breadcrumbs={[
                { label: "Workspace", href: "/" },
                { label: "Reports" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h2 className="text-2xl font-bold text-text-primary">Reports & Export</h2>
                    <p className="text-sm text-text-muted mt-1">
                        Export device data and schedule automated email reports.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Data Export Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="rounded-xl bg-white border border-border-subtle p-6"
                    >
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileDown className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="text-base font-bold text-text-primary">Export Device Data</h3>
                        </div>

                        <div className="space-y-4">
                            {/* Device Selection */}
                            <div className="relative z-30" ref={exportDropdownRef}>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Select Device
                                </label>
                                <button
                                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {selectedDevice ? (
                                        <span className="flex items-center gap-2 truncate">
                                            <DeviceStatusDot serial={selectedDevice} />
                                            <span className="truncate">
                                                {allDevices.find((d) => d.serialNumber === selectedDevice)?.name || selectedDevice}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-text-muted">No devices available</span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${exportDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence>
                                    {exportDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
                                        >
                                            {allDevices.length === 0 ? (
                                                <p className="px-3 py-2 text-sm text-text-muted text-center">No devices found</p>
                                            ) : (
                                                allDevices.map((d: Device) => {
                                                    const sn = d.serialNumber || "";
                                                    const isSelected = selectedDevice === sn;
                                                    return (
                                                        <button
                                                            key={sn}
                                                            onClick={() => {
                                                                setSelectedDevice(sn);
                                                                setExportDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                                                                isSelected ? "bg-primary/5 text-primary font-semibold" : "text-text-primary hover:bg-surface-muted"
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                <DeviceStatusDot serial={sn} />
                                                                <div className="flex flex-col items-start truncate">
                                                                    <span className="truncate leading-tight">{d.name}</span>
                                                                    <span className="text-[10px] text-text-muted font-mono leading-tight">{sn}</span>
                                                                </div>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            {/* Format Selection */}
                            <div>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Format
                                </label>
                                <div className="flex gap-3">
                                    {(["csv", "pdf"] as const).map((fmt) => (
                                        <button
                                            key={fmt}
                                            onClick={() => setExportFormat(fmt)}
                                            className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${exportFormat === fmt
                                                    ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                                                    : "border-border-subtle text-text-secondary hover:border-border-default"
                                                }`}
                                        >
                                            {fmt === "csv" ? (
                                                <span className="flex items-center gap-2 justify-center">
                                                    <FileText className="w-4 h-4" /> CSV
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2 justify-center">
                                                    <FileDown className="w-4 h-4" /> PDF
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Export Button */}
                            <button
                                onClick={handleExport}
                                disabled={exporting || !selectedDevice || !startDate || !endDate}
                                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {exporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                {exporting ? "Exporting..." : `Export ${exportFormat.toUpperCase()}`}
                            </button>

                            {exportData.length > 0 && (
                                <p className="text-xs text-text-muted text-center">
                                    Last export: {exportData.length} rows
                                </p>
                            )}
                        </div>
                    </motion.div>

                    {/* Email Scheduling Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="rounded-xl bg-white border border-border-subtle p-6"
                    >
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Mail className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="text-base font-bold text-text-primary">Schedule Email Reports</h3>
                        </div>

                        <div className="space-y-4">
                            {/* Device Selection */}
                            <div className="relative z-20" ref={scheduleDropdownRef}>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Device
                                </label>
                                <button
                                    onClick={() => setScheduleDropdownOpen(!scheduleDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {scheduleDevice ? (
                                        <span className="flex items-center gap-2 truncate">
                                            <DeviceStatusDot serial={scheduleDevice} />
                                            <span className="truncate">
                                                {allDevices.find((d) => d.serialNumber === scheduleDevice)?.name || scheduleDevice}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-text-muted">No devices available</span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${scheduleDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence>
                                    {scheduleDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
                                        >
                                            {allDevices.length === 0 ? (
                                                <p className="px-3 py-2 text-sm text-text-muted text-center">No devices found</p>
                                            ) : (
                                                allDevices.map((d: Device) => {
                                                    const sn = d.serialNumber || "";
                                                    const isSelected = scheduleDevice === sn;
                                                    return (
                                                        <button
                                                            key={sn}
                                                            onClick={() => {
                                                                setScheduleDevice(sn);
                                                                setScheduleDropdownOpen(false);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                                                                isSelected ? "bg-primary/5 text-primary font-semibold" : "text-text-primary hover:bg-surface-muted"
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                <DeviceStatusDot serial={sn} />
                                                                <div className="flex flex-col items-start truncate">
                                                                    <span className="truncate leading-tight">{d.name}</span>
                                                                    <span className="text-[10px] text-text-muted font-mono leading-tight">{sn}</span>
                                                                </div>
                                                            </div>
                                                            {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Recipient Email
                                </label>
                                <input
                                    type="email"
                                    value={scheduleEmail}
                                    onChange={(e) => setScheduleEmail(e.target.value)}
                                    placeholder="reports@company.com"
                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                                />
                            </div>

                            {/* Frequency */}
                            <div>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Frequency
                                </label>
                                <div className="flex gap-2">
                                    {["daily", "weekly", "monthly"].map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setScheduleFrequency(f)}
                                            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium capitalize transition-all ${scheduleFrequency === f
                                                    ? "border-primary bg-primary/5 text-primary"
                                                    : "border-border-subtle text-text-secondary hover:border-border-default"
                                                }`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save */}
                            <button
                                onClick={handleSaveSchedule}
                                disabled={savingSchedule}
                                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {savingSchedule ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                {savingSchedule ? "Saving..." : "Create Schedule"}
                            </button>
                        </div>

                        {/* Existing Schedules */}
                        <div className="mt-5 pt-4 border-t border-border-subtle">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-4 h-4 text-text-muted" />
                                <h4 className="text-sm font-bold text-text-primary">Active Schedules</h4>
                            </div>
                            {loadingSchedules ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                                </div>
                            ) : schedules.length === 0 ? (
                                <p className="text-xs text-text-muted text-center py-3">No schedules configured</p>
                            ) : (
                                <div className="space-y-2">
                                    {schedules.map((s: any, i: number) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-3 rounded-lg bg-surface-muted/50"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">{s.email}</p>
                                                <p className="text-[11px] text-text-muted">
                                                    {s.device} • {s.frequency} • {s.reportType || "csv"}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSchedule(s.device)}
                                                className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
}
