import { NextResponse } from "next/server";

const BACKEND_URL =
    process.env.NEXT_PUBLIC_REFLOW_API_URL ||
    "https://reflow-backend.fly.dev/api/v1";

/**
 * Fetch threshold config for a device from the mqtt-configTable API.
 * Returns { CH1: { min, max }, CH2: ... } or null.
 */
async function fetchThresholds(serial, baseUrl) {
    try {
        const res = await fetch(`${baseUrl}/api/mqtt-configTable?serialId=${serial}`, {
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const cfg = data[data.length - 1];
        const thresholds = {};
        for (let i = 1; i <= 6; i++) {
            const min = cfg[`CH${i}_ThreshMin`];
            const max = cfg[`CH${i}_ThreshMax`];
            if (min !== undefined && max !== undefined && Number(min) !== 0 && Number(max) !== 0) {
                thresholds[`CH${i}`] = { min: Number(min), max: Number(max) };
            }
        }
        return Object.keys(thresholds).length > 0 ? thresholds : null;
    } catch {
        return null;
    }
}

/**
 * Detect numeric channel keys from a data row (SNO1–6 or RawCH1–6 etc.)
 * and map them to the CH1–6 threshold keys.
 */
function detectAndMapKeys(row) {
    if (!row) return {};
    // Map: "SNO1" → "CH1", "RawCH1" → "CH1", "ch_1" → "CH1"
    const mapping = {};
    const patterns = [
        { re: /^SNO(\d)$/i, ch: (m) => `CH${m[1]}` },
        { re: /^RawCH(\d)$/i, ch: (m) => `CH${m[1]}` },
        { re: /^ch_(\d)$/i, ch: (m) => `CH${m[1]}` },
        { re: /^CH(\d)$/i, ch: (m) => `CH${m[1]}` },
    ];
    Object.keys(row).forEach((k) => {
        for (const { re, ch } of patterns) {
            const m = k.match(re);
            if (m) { mapping[k] = ch(m); break; }
        }
    });
    return mapping;
}

/**
 * Compute threshold-based deviation %.
 * Formula: (readings outside threshold / total readings) × 100
 * A reading is "outside" if v < threshMin OR v > threshMax for ANY channel that has a threshold.
 * Only channels that have a configured threshold are checked.
 */
function computeThresholdDeviation(rows, thresholds) {
    if (!rows || rows.length === 0) return null;
    if (!thresholds || Object.keys(thresholds).length === 0) return null;

    const keyMap = detectAndMapKeys(rows[0] || {});
    
    // Count per-reading violations
    let totalChecks = 0;
    let violations = 0;

    rows.forEach((row) => {
        Object.entries(keyMap).forEach(([rawKey, chKey]) => {
            const threshold = thresholds[chKey];
            if (!threshold) return; // no threshold configured for this channel
            const v = parseFloat(row[rawKey]);
            if (isNaN(v) || !isFinite(v)) return;
            totalChecks++;
            if (v < threshold.min || v > threshold.max) violations++;
        });
    });

    if (totalChecks === 0) return null;
    return (violations / totalChecks) * 100;
}

/**
 * Fetch ALL data for a device for a date range (single call).
 */
async function fetchDeviceData(serial, startIso, endIso, authToken) {
    try {
        const res = await fetch(`${BACKEND_URL}/device/${serial}/export`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ startDate: startIso, endDate: endIso }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const rows = Array.isArray(raw) ? raw : raw?.data || raw?.readings || raw?.deviceData || [];
        return Array.isArray(rows) && rows.length > 0 ? rows : null;
    } catch {
        return null;
    }
}

/** Group rows by date string (YYYY-MM-DD) */
function groupByDay(rows) {
    const groups = {};
    rows.forEach((row) => {
        const ts = row.timestamp || row.createdAt;
        if (!ts) return;
        const day = new Date(ts).toISOString().split("T")[0];
        if (!groups[day]) groups[day] = [];
        groups[day].push(row);
    });
    return groups;
}

// ── GET handler ──────────────────────────────────────────────────────────────
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";
    const serialsParam = searchParams.get("serials") || "";
    const serials = serialsParam.split(",").map((s) => s.trim()).filter(Boolean);

    if (serials.length === 0) {
        return NextResponse.json({ error: "No serials provided" }, { status: 400 });
    }

    const authToken = request.headers.get("x-auth-token") || "";
    // Determine base URL for internal API calls
    const host = request.headers.get("host") || "localhost:3000";
    const proto = process.env.NODE_ENV === "production" ? "https" : "http";
    const baseUrl = `${proto}://${host}`;
    const now = new Date();

    // Fetch thresholds for all devices in parallel
    const thresholdResults = await Promise.allSettled(
        serials.map((serial) => fetchThresholds(serial, baseUrl))
    );
    const thresholdMap = {};
    serials.forEach((serial, i) => {
        const r = thresholdResults[i];
        thresholdMap[serial] = r.status === "fulfilled" ? r.value : null;
    });

    // ── TODAY ────────────────────────────────────────────────────────────────
    if (period === "today") {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const results = await Promise.allSettled(
            serials.map((serial) =>
                fetchDeviceData(serial, startOfDay.toISOString(), now.toISOString(), authToken)
            )
        );

        const allPcts = [];
        let totalReadings = 0;

        results.forEach((r, i) => {
            if (r.status !== "fulfilled" || !r.value) return;
            const rows = r.value;
            totalReadings += rows.length;
            const thresholds = thresholdMap[serials[i]];
            const pct = computeThresholdDeviation(rows, thresholds);
            if (pct !== null) allPcts.push(pct);
        });

        const avgDeviationPct =
            allPcts.length > 0 ? allPcts.reduce((a, b) => a + b, 0) / allPcts.length : null;
        return NextResponse.json({ avgDeviationPct, totalReadings });
    }

    // ── WEEKLY / MONTHLY ─────────────────────────────────────────────────────
    const days = period === "weekly" ? 7 : 30;
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
    rangeStart.setHours(0, 0, 0, 0);

    // One batch call per device for the full range
    const results = await Promise.allSettled(
        serials.map((serial) =>
            fetchDeviceData(serial, rangeStart.toISOString(), now.toISOString(), authToken)
        )
    );

    // Aggregate into dayDeviations { "YYYY-MM-DD": [pct, ...] }
    const dayDeviations = {};

    results.forEach((r, i) => {
        if (r.status !== "fulfilled" || !r.value) return;
        const rows = r.value;
        const thresholds = thresholdMap[serials[i]];
        const byDay = groupByDay(rows);

        Object.entries(byDay).forEach(([day, dayRows]) => {
            const pct = computeThresholdDeviation(dayRows, thresholds);
            if (pct !== null) {
                if (!dayDeviations[day]) dayDeviations[day] = [];
                dayDeviations[day].push(pct);
            }
        });
    });

    // Build ordered trend array
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const pts = dayDeviations[dateStr] || [];
        const avg = pts.length > 0 ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
        trend.push({ date: dateStr, avgDeviationPct: avg });
    }

    return NextResponse.json({ trend });
}
