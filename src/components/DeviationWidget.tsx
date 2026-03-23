"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from "lucide-react";
import { useProjects } from "@/lib/ProjectsContext";

interface TrendPoint {
    date: string;
    avgDeviationPct: number | null;
}

interface LiveData {
    avgDeviationPct: number | null;
    readingCount: number;
    lastUpdated: string | null;
}

function getColor(pct: number | null): string {
    if (pct === null) return "bg-slate-200";
    if (pct < 5) return "bg-emerald-400";
    if (pct < 15) return "bg-amber-400";
    return "bg-red-400";
}

function getBadgeStyle(pct: number | null): string {
    if (pct === null) return "bg-slate-100 text-slate-500";
    if (pct < 5) return "bg-emerald-50 text-emerald-700";
    if (pct < 15) return "bg-amber-50 text-amber-700";
    return "bg-red-50 text-red-700";
}

function SparkBars({ data, label }: { data: TrendPoint[]; label: string }) {
    const validPcts = data.map((d) => d.avgDeviationPct ?? 0);
    const max = Math.max(1, ...validPcts);

    return (
        <div className="mb-4">
            <p className="text-[11px] text-text-muted mb-2">{label}</p>
            <div className="flex items-end gap-[3px] h-12">
                {data.map((pt, i) => {
                    const pct = pt.avgDeviationPct;
                    const height = pct !== null ? Math.max(6, Math.round((pct / max) * 100)) : 6;
                    const dateLabel = new Date(pt.date + "T00:00:00").toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                    });
                    return (
                        <motion.div
                            key={pt.date}
                            initial={{ height: 0 }}
                            animate={{ height: `${height}%` }}
                            transition={{ duration: 0.4, delay: 0.04 * i }}
                            className={`flex-1 rounded-t-sm ${getColor(pct)} cursor-default`}
                            title={pct !== null ? `${dateLabel}: ${pct.toFixed(1)}%` : `${dateLabel}: No data`}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/** Fetch thresholds for a device from mqtt-configTable */
async function fetchDeviceThresholds(
    serial: string
): Promise<Record<string, { min: number; max: number }> | null> {
    try {
        const res = await fetch(`/api/mqtt-configTable?serialId=${serial}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const cfg = data[data.length - 1];
        const thresholds: Record<string, { min: number; max: number }> = {};
        for (let i = 1; i <= 6; i++) {
            const min = cfg[`CH${i}_ThreshMin`];
            const max = cfg[`CH${i}_ThreshMax`];
            if (min !== undefined && max !== undefined && Number(min) !== 0 && Number(max) !== 0) {
                thresholds[`RawCH${i}`] = { min: Number(min), max: Number(max) };
            }
        }
        return Object.keys(thresholds).length > 0 ? thresholds : null;
    } catch {
        return null;
    }
}

/**
 * Compute threshold-based deviation % from MQTT readings.
 * Formula: (readings outside [ThreshMin, ThreshMax] / total readings) × 100
 * Only channels with configured thresholds are evaluated.
 * Falls back to mean absolute deviation if no thresholds configured.
 */
function computeLiveDeviation(
    readings: Array<Record<string, number | null>>,
    thresholds: Record<string, { min: number; max: number }> | null
): number | null {
    if (readings.length === 0) return null;

    const channelKeys = ["RawCH1", "RawCH2", "RawCH3", "RawCH4", "RawCH5", "RawCH6"];

    // Threshold-crossing approach (preferred)
    if (thresholds && Object.keys(thresholds).length > 0) {
        let totalChecks = 0;
        let violations = 0;
        readings.forEach((row) => {
            channelKeys.forEach((k) => {
                const threshold = thresholds[k];
                if (!threshold) return;
                const v = row[k];
                if (v === null || v === undefined || !isFinite(v as number)) return;
                totalChecks++;
                if ((v as number) < threshold.min || (v as number) > threshold.max) violations++;
            });
        });
        if (totalChecks === 0) return null;
        return (violations / totalChecks) * 100;
    }

    // Fallback: mean absolute deviation %
    const keys = channelKeys.filter((k) => {
        const v = readings[0]?.[k];
        return v !== null && v !== undefined && isFinite(v as number);
    });
    if (keys.length === 0) return null;
    const avgs: Record<string, number> = {};
    keys.forEach((k) => {
        const vals = readings.map((r) => r[k] as number).filter((v) => v !== null && isFinite(v));
        avgs[k] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const devs: number[] = [];
    readings.forEach((row) => {
        keys.forEach((k) => {
            const v = row[k] as number;
            const avg = avgs[k];
            if (v !== null && isFinite(v) && Math.abs(avg) > 0.0001) {
                devs.push((Math.abs(v - avg) / Math.abs(avg)) * 100);
            }
        });
    });
    if (devs.length === 0) return null;
    return devs.reduce((a, b) => a + b, 0) / devs.length;
}

export default function DeviationWidget() {
    const { devices, loading: devicesLoading } = useProjects();

    // Live deviation from MQTT
    const [liveData, setLiveData] = useState<LiveData>({ avgDeviationPct: null, readingCount: 0, lastUpdated: null });
    const [liveLoading, setLiveLoading] = useState(true);
    // Stored MQTT readings per device: { [serial]: last N readings }
    const mqttHistory = useRef<Record<string, Array<Record<string, number | null>>>>({});
    // Threshold config per device: { [serial]: { RawCH1: { min, max }, ... } | null }
    const thresholdCache = useRef<Record<string, Record<string, { min: number; max: number }> | null>>({});

    // Historical trends (loaded once, slower)
    const [weekly, setWeekly] = useState<TrendPoint[]>([]);
    const [monthly, setMonthly] = useState<TrendPoint[]>([]);
    const [trendsLoading, setTrendsLoading] = useState(true);
    const [trendsError, setTrendsError] = useState<string | null>(null);

    const serials: string[] = devices
        .map((d: any) => d.serialNumber || d.serial_no || d.serialNo || d.serial_number || "")
        .filter(Boolean);

    const serialsStr = serials.join(",");

    // ── Compute live deviation using thresholds ────────────────────────────
    const computeAndSetLive = useCallback(() => {
        const allReadings: Array<{ readings: Array<Record<string, number | null>>; thresholds: Record<string, { min: number; max: number }> | null }> = [];
        Object.entries(mqttHistory.current).forEach(([serial, readings]) => {
            allReadings.push({ readings, thresholds: thresholdCache.current[serial] ?? null });
        });
        // Compute per-device, then average
        const pcts: number[] = [];
        allReadings.forEach(({ readings, thresholds }) => {
            const pct = computeLiveDeviation(readings, thresholds);
            if (pct !== null) pcts.push(pct);
        });
        const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
        const count = Object.values(mqttHistory.current).reduce((sum, arr) => sum + arr.length, 0);
        setLiveData({
            avgDeviationPct: avgPct,
            readingCount: count,
            lastUpdated: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });
        setLiveLoading(false);
    }, []);

    // ── Poll MQTT for each device every 5s + load thresholds once ──────────
    useEffect(() => {
        if (devicesLoading || serials.length === 0) return;

        const HISTORY_SIZE = 20;

        // Load thresholds for each device once
        serials.forEach(async (serial) => {
            if (thresholdCache.current[serial] !== undefined) return; // already loaded
            thresholdCache.current[serial] = null; // mark as loading
            const thresholds = await fetchDeviceThresholds(serial);
            thresholdCache.current[serial] = thresholds;
        });

        const pollAll = async () => {
            const promises = serials.map(async (serial) => {
                try {
                    const res = await fetch(`/api/mqtt-readings?serialId=${serial}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data?.error) return;

                    const reading: Record<string, number | null> = {};
                    ["RawCH1", "RawCH2", "RawCH3", "RawCH4", "RawCH5", "RawCH6"].forEach((k) => {
                        if (data[k] !== null && data[k] !== undefined) {
                            reading[k] = Number(data[k]);
                        }
                    });

                    if (Object.keys(reading).length > 0) {
                        if (!mqttHistory.current[serial]) mqttHistory.current[serial] = [];
                        mqttHistory.current[serial].push(reading);
                        if (mqttHistory.current[serial].length > HISTORY_SIZE) {
                            mqttHistory.current[serial] = mqttHistory.current[serial].slice(-HISTORY_SIZE);
                        }
                    }
                } catch {
                    // silent
                }
            });

            await Promise.allSettled(promises);
            computeAndSetLive();
        };

        pollAll();
        const interval = setInterval(pollAll, 5000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [devicesLoading, serialsStr, computeAndSetLive]);

    // ── Load historical trends once ──────────────────────────────────────────
    const loadTrends = useCallback(async () => {
        if (!serialsStr) return;
        setTrendsLoading(true);
        setTrendsError(null);
        try {
            const token =
                (typeof window !== "undefined" &&
                    (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token"))) || "";
            const headers: HeadersInit = token ? { "x-auth-token": token } : {};
            const base = `/api/deviation-stats?serials=${encodeURIComponent(serialsStr)}`;

            const [weeklyRes, monthlyRes] = await Promise.all([
                fetch(`${base}&period=weekly`, { headers }),
                fetch(`${base}&period=monthly`, { headers }),
            ]);

            const [weeklyData, monthlyData] = await Promise.all([
                weeklyRes.json(),
                monthlyRes.json(),
            ]);

            setWeekly(weeklyData.trend || []);
            setMonthly(monthlyData.trend || []);
        } catch {
            setTrendsError("Could not load trend data.");
        } finally {
            setTrendsLoading(false);
        }
    }, [serialsStr]);

    useEffect(() => {
        if (!devicesLoading && serialsStr) loadTrends();
    }, [devicesLoading, serialsStr, loadTrends]);

    // ── Trend direction: compare today vs yesterday from weekly data ─────────
    const yesterdayPct = weekly.length >= 2 ? weekly[weekly.length - 2]?.avgDeviationPct : null;
    const todayPct = liveData.avgDeviationPct;

    let trendDir: "up" | "down" | "flat" | null = null;
    if (todayPct !== null && yesterdayPct !== null) {
        if (todayPct > yesterdayPct + 0.5) trendDir = "up";
        else if (todayPct < yesterdayPct - 0.5) trendDir = "down";
        else trendDir = "flat";
    }

    const noDevices = !devicesLoading && serials.length === 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-xl bg-white border border-border-subtle p-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Deviations</h3>
                <div className="flex items-center gap-2">
                    {!liveLoading && todayPct !== null && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${getBadgeStyle(todayPct)}`}>
                            {todayPct < 5 ? "Normal" : todayPct < 15 ? "Moderate" : "High"}
                        </span>
                    )}
                    <button
                        onClick={loadTrends}
                        disabled={trendsLoading}
                        className="p-1 rounded text-text-muted hover:text-primary transition-colors disabled:opacity-40"
                        title="Refresh trends"
                    >
                        <RefreshCw className={`w-3 h-3 ${trendsLoading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Live value */}
            <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <p className="text-[11px] text-text-muted">Live Deviation (today)</p>
                </div>

                {noDevices ? (
                    <p className="text-sm text-text-muted">No devices registered</p>
                ) : liveLoading ? (
                    <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-text-primary">
                            {todayPct !== null ? `${todayPct.toFixed(1)}%` : "—"}
                        </span>
                        {trendDir && (
                            <div className="mb-1">
                                {trendDir === "up" && (
                                    <span className="flex items-center gap-0.5 text-[11px] font-semibold text-red-600">
                                        <TrendingUp className="w-3.5 h-3.5" /> Rising
                                    </span>
                                )}
                                {trendDir === "down" && (
                                    <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
                                        <TrendingDown className="w-3.5 h-3.5" /> Falling
                                    </span>
                                )}
                                {trendDir === "flat" && (
                                    <span className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-500">
                                        <Minus className="w-3.5 h-3.5" /> Stable
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {liveData.lastUpdated && liveData.readingCount > 0 && (
                    <p className="text-[10px] text-text-muted mt-0.5">
                        {liveData.readingCount} readings · updated {liveData.lastUpdated}
                    </p>
                )}
                {!liveLoading && todayPct === null && !noDevices && (
                    <p className="text-[10px] text-amber-600 mt-0.5">Waiting for MQTT data…</p>
                )}
            </div>

            {/* Trend charts */}
            {trendsLoading ? (
                <div className="space-y-4">
                    {[7, 30].map((len) => (
                        <div key={len}>
                            <div className="h-3 w-32 bg-slate-100 rounded mb-2 animate-pulse" />
                            <div className="flex items-end gap-[3px] h-12">
                                {Array.from({ length: len }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 bg-slate-100 rounded-t-sm animate-pulse"
                                        style={{ height: `${20 + ((i * 17) % 70)}%` }}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : trendsError ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {trendsError}
                </div>
            ) : (
                <>
                    {weekly.length > 0 && <SparkBars data={weekly} label="Weekly Trend (last 7 days)" />}
                    {monthly.length > 0 && <SparkBars data={monthly} label="Monthly Trend (last 30 days)" />}
                </>
            )}

            {/* Legend */}
            {!noDevices && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-subtle">
                    {[
                        { color: "bg-emerald-400", label: "< 5%" },
                        { color: "bg-amber-400", label: "5–15%" },
                        { color: "bg-red-400", label: "> 15%" },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-sm ${item.color}`} />
                            <span className="text-[10px] text-text-muted">{item.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
