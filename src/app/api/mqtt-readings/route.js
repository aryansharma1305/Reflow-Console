import { NextResponse } from "next/server";
import mqtt from "mqtt";
import {
    MQTT_CHANNEL_NAMES,
    buildMqttTopic,
    extractSerialFromTopic,
    MQTT_CLIENT_OPTIONS,
    MQTT_POLLING_CONFIG,
} from "@/lib/mqtt.constants.js";

// ── Persistent singleton MQTT client ──────────────────────────────
const globalForMqtt = global;
let client = globalForMqtt.mqttReadingsClient || null;
// mqttData[serialId] = { RawCH1..6, _ts, _rxTs, _hasPayloadTs, _isRetained }
let mqttData = globalForMqtt.mqttReadingsData || {};
let subscribedTopics = globalForMqtt.mqttReadingsTopics || new Set();
// subscribedAt[topic] = ms timestamp when we last subscribed to that topic
// Used to detect initial broker "retained replay" vs live device messages.
let subscribedAt = globalForMqtt.mqttReadingsSubscribedAt || {};

if (process.env.NODE_ENV !== "production") {
    globalForMqtt.mqttReadingsData = mqttData;
    globalForMqtt.mqttReadingsTopics = subscribedTopics;
    globalForMqtt.mqttReadingsSubscribedAt = subscribedAt;
}

// generateMqttTopic now uses constants from mqtt.constants.js
const generateMqttTopic = buildMqttTopic;

// How long after a subscribe() call do we consider incoming messages to be
// the broker's "retained replay" (potentially stale) rather than live data.
// Typical retained replay arrives within ~50ms. 800ms is a safe margin.
const RETAINED_REPLAY_WINDOW_MS = 800;

/**
 * Parse a timestamp from a device MQTT payload.
 * Handles all observed device timestamp formats:
 *   - "02/04/26 13:07:49"  → DD/MM/YY HH:MM:SS (space separator)
 *   - "02/04/26,13:01:47"  → DD/MM/YY,HH:MM:SS (comma separator)
 *   - Standard ISO strings (fallback)
 * Field name variants: UpdateTimeStamp, UpdateTimestamp, updateTimestamp, update_timestamp
 * All times assumed IST (+05:30) unless timezone present.
 */
function parsePayloadTimestamp(payload) {
    if (!payload || typeof payload !== "object") return null;

    // Collect all possible UpdateTimestamp field variants
    const updateTs =
        payload.UpdateTimeStamp ??   // 6-ch & 3-ch devices
        payload.UpdateTimestamp ??   // 1-ch device (capital T, lowercase s)
        payload.updateTimestamp ??
        payload.update_timestamp;

    if (updateTs !== undefined && updateTs !== null) {
        // Numeric epoch
        if (typeof updateTs === "number" && Number.isFinite(updateTs)) {
            return updateTs < 1e12 ? updateTs * 1000 : updateTs;
        }

        if (typeof updateTs === "string" && updateTs.trim()) {
            const raw = updateTs.trim();

            // Pure numeric string
            if (/^\d+$/.test(raw)) {
                const n = Number(raw);
                if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
            }

            // DD/MM/YY HH:MM:SS  or  DD/MM/YY,HH:MM:SS
            // e.g. "02/04/26 13:07:49" or "02/04/26,13:01:47"
            const ddmmyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})[, ](\d{2}:\d{2}:\d{2})$/);
            if (ddmmyy) {
                const [, dd, mm, yy, time] = ddmmyy;
                // Reconstruct as YYYY-MM-DDTHH:MM:SS+05:30
                const isoStr = `20${yy}-${mm}-${dd}T${time}+05:30`;
                const ms = Date.parse(isoStr);
                if (!Number.isNaN(ms)) return ms;
            }

            // Standard ISO / RFC strings (with or without timezone)
            const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
            const candidate = hasZone ? raw : `${raw}+05:30`;
            const ms = Date.parse(candidate);
            if (!Number.isNaN(ms)) return ms;
        }
    }

    // Generic fallback fields: _ts / ts / timestamp / createdAt / time
    const raw = payload._ts ?? payload.ts ?? payload.timestamp ?? payload.createdAt ?? payload.time;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw < 1e12 ? raw * 1000 : raw;
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) {
            const n = Number(trimmed);
            if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
        }
        const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
        const ms = Date.parse(hasZone ? trimmed : `${trimmed}+05:30`);
        return Number.isNaN(ms) ? null : ms;
    }
    return null;
}

function getClient() {
    if (client && client.connected) return client;

    const brokerUrl = process.env.MQTT_BROKER_URL;
    if (!brokerUrl) return null;

    client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        ...MQTT_CLIENT_OPTIONS,
        clientId: `readings_${Math.random().toString(16).slice(2, 8)}`,
    });

    if (process.env.NODE_ENV !== "production") {
        globalForMqtt.mqttReadingsClient = client;
    }

    client.on("connect", () => {
        console.log("[MQTT Readings] Connected to broker");
        // Re-subscribe to any topics we had before reconnect
        for (const topic of subscribedTopics) {
            subscribedAt[topic] = Date.now(); // reset window on reconnect
            client.subscribe(topic, (err) => {
                if (err) console.error(`[MQTT] Re-subscribe failed for ${topic}:`, err.message);
            });
        }
    });

    client.on("message", (topic, message, packet) => {
        try {
            const parsed = JSON.parse(message.toString());
            const serialId = extractSerialFromTopic(topic);
            const payloadTs = parsePayloadTimestamp(parsed);
            const receivedAt = Date.now();

            // ── Retained replay vs live message detection ──────────────────
            // We cannot rely solely on packet.retain because some devices publish
            // ALL messages with retain=1, making even live messages look retained.
            //
            // Instead: track when we subscribed to each topic. Messages arriving
            // within RETAINED_REPLAY_WINDOW_MS of subscription = broker's initial
            // retained replay (potentially stale). Messages after that = live.
            const subTime = subscribedAt[topic] ?? 0;
            const msSinceSubscribe = receivedAt - subTime;
            const isInitialRetainedReplay = msSinceSubscribe < RETAINED_REPLAY_WINDOW_MS;

            // For the initial retained replay: _rxTs = device ts (or 0 if unknown)
            // For live messages: _rxTs = server receive time
            const rxTimestamp = isInitialRetainedReplay
                ? (payloadTs ?? 0)   // 0 = "unknown" → hook will treat as Offline
                : receivedAt;        // live message → definitely fresh

            // DEBUG: log every received message so we can see exact payload structure
            console.log(`[MQTT] ${serialId} | msSinceSub=${msSinceSubscribe} | isRetainedReplay=${isInitialRetainedReplay} | payloadTs=${payloadTs ? new Date(payloadTs).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : null} | keys=${Object.keys(parsed).join(",")}`);

            // Per-channel ERR flags: ERR1..ERR6 (1 = sensor fault, 0 = ok)
            // Also check global ERR field as fallback
            const errFlags = {};
            for (let i = 1; i <= 6; i++) {
                const v = parsed[`ERR${i}`];
                if (v !== undefined && v !== null) {
                    errFlags[`ERR${i}`] = v === 1 || v === "1" || v === true;
                }
            }
            // Global ERR (some devices send a single ERR field)
            const globalErr = parsed.ERR ?? parsed.err ?? parsed.Error ?? null;

            // Raw UpdateTimeStamp string — all casing variants
            const rawUpdateTs =
                parsed.UpdateTimeStamp ??
                parsed.UpdateTimestamp ??
                parsed.updateTimestamp ??
                null;

            const channelData = {
                _ts: payloadTs,
                _rxTs: rxTimestamp,
                _hasPayloadTs: payloadTs !== null,
                _isRetained: isInitialRetainedReplay,
                _err: globalErr,          // global sensor fault (legacy)
                _errFlags: errFlags,      // per-channel { ERR1: bool, ERR2: bool, ... }
                _updateTs: rawUpdateTs,   // raw timestamp string for display
            };
            MQTT_CHANNEL_NAMES.forEach((ch) => {
                channelData[ch] = parsed[ch] ?? null;
            });
            mqttData[serialId] = channelData;
        } catch (error) {
            console.error("[MQTT Readings] Failed to parse message:", error.message);
        }
    });

    client.on("error", (err) => {
        console.error("[MQTT Readings] Connection error:", err.message);
    });

    client.on("offline", () => {
        console.warn("[MQTT Readings] Client went offline");
    });

    return client;
}

async function ensureSubscribed(mqttClient, serialId) {
    const topic = generateMqttTopic(serialId);
    if (subscribedTopics.has(topic)) return; // already subscribed — persist across requests

    subscribedAt[topic] = Date.now(); // record subscription time for retained-replay detection
    return new Promise((resolve, reject) => {
        mqttClient.subscribe(topic, (err) => {
            if (err) {
                reject(err);
            } else {
                subscribedTopics.add(topic);
                resolve();
            }
        });
    });
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const serialId = searchParams.get("serialId");

    if (!serialId) {
        return NextResponse.json({ error: "serialId parameter is required" }, { status: 400 });
    }

    const mqttClient = getClient();
    if (!mqttClient) {
        return NextResponse.json({ error: "MQTT broker not configured" }, { status: 503 });
    }

    try {
        // Wait for connection if not yet connected (up to 5s)
        if (!mqttClient.connected) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
                mqttClient.once("connect", () => { clearTimeout(timeout); resolve(); });
                mqttClient.once("error", (err) => { clearTimeout(timeout); reject(err); });
            });
        }

        // Subscribe (no-op if already subscribed)
        await ensureSubscribed(mqttClient, serialId);

        // If we already have fresh data (received < 5s ago), return it immediately.
        // Use _rxTs (server-receive time) for the cache check — _ts can be null when
        // the device doesn't embed its own timestamp.
        const cached = mqttData[serialId];
        const cachedRxTs = typeof cached?._rxTs === "number" ? cached._rxTs : NaN;
        if (cached && Number.isFinite(cachedRxTs) && (Date.now() - cachedRxTs) < MQTT_POLLING_CONFIG.CACHE_CHECK_INTERVAL) {
            return NextResponse.json(cached);
        }

        // Otherwise wait briefly for first message
        await new Promise((resolve) => setTimeout(resolve, MQTT_POLLING_CONFIG.DATA_WAIT_TIMEOUT));

        const data = mqttData[serialId] || {};
        return NextResponse.json({
            // Raw ADC values
            RawCH1: data.RawCH1 ?? null,
            RawCH2: data.RawCH2 ?? null,
            RawCH3: data.RawCH3 ?? null,
            RawCH4: data.RawCH4 ?? null,
            RawCH5: data.RawCH5 ?? null,
            RawCH6: data.RawCH6 ?? null,
            // Calibrated (engineered) values — these are what should be displayed
            CH1: data.CH1 ?? null,
            CH2: data.CH2 ?? null,
            CH3: data.CH3 ?? null,
            CH4: data.CH4 ?? null,
            CH5: data.CH5 ?? null,
            CH6: data.CH6 ?? null,
            // Timestamps & freshness
            _ts: data._ts ?? null,                // device UpdateTimeStamp (ms epoch)
            _rxTs: data._rxTs ?? null,            // server-receive time (0 = unknown for retained)
            _updateTs: data._updateTs ?? null,    // raw UpdateTimeStamp string for display
            _isRetained: data._isRetained ?? false,
            // Error flags
            _err: data._err ?? null,              // global ERR field (legacy)
            _errFlags: data._errFlags ?? {},      // per-channel { ERR1: bool, ERR2: bool, ... }
        });
    } catch (error) {
        console.error("[MQTT Readings] Error:", error.message);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}
