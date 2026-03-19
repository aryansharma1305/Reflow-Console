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
// mqttData[serialId] = { RawCH1..6, _ts: Date.now() }
let mqttData = globalForMqtt.mqttReadingsData || {};
let subscribedTopics = globalForMqtt.mqttReadingsTopics || new Set();

if (process.env.NODE_ENV !== "production") {
    globalForMqtt.mqttReadingsData = mqttData;
    globalForMqtt.mqttReadingsTopics = subscribedTopics;
}

// generateMqttTopic now uses constants from mqtt.constants.js
const generateMqttTopic = buildMqttTopic;

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
            client.subscribe(topic, (err) => {
                if (err) console.error(`[MQTT] Re-subscribe failed for ${topic}:`, err.message);
            });
        }
    });

    client.on("message", (topic, message) => {
        try {
            const parsed = JSON.parse(message.toString());
            // Reconstruct the serialId from topic  e.g. "ABC/12/OUTPUT" → "ABC12"
            const serialId = extractSerialFromTopic(topic);
            const channelData = { _ts: Date.now() };
            // Dynamically extract channel data using constants
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

        // If we already have fresh data (< 5s old), return it immediately
        const cached = mqttData[serialId];
        if (cached && (Date.now() - cached._ts) < MQTT_POLLING_CONFIG.CACHE_CHECK_INTERVAL) {
            return NextResponse.json(cached);
        }

        // Otherwise wait briefly for first message
        await new Promise((resolve) => setTimeout(resolve, MQTT_POLLING_CONFIG.DATA_WAIT_TIMEOUT));

        const data = mqttData[serialId] || {};
        return NextResponse.json({
            RawCH1: data.RawCH1 ?? null,
            RawCH2: data.RawCH2 ?? null,
            RawCH3: data.RawCH3 ?? null,
            RawCH4: data.RawCH4 ?? null,
            RawCH5: data.RawCH5 ?? null,
            RawCH6: data.RawCH6 ?? null,
            _ts: data._ts ?? null,
        });
    } catch (error) {
        console.error("[MQTT Readings] Error:", error.message);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}
