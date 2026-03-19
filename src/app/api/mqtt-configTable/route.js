import { NextResponse } from "next/server";
import mqtt from "mqtt";

// Preserve MQTT connection across Next.js hot reloads
const globalForMqtt = global;
let client = globalForMqtt.mqttConfigClient || null;
let mqttData = globalForMqtt.mqttConfigData || {};
let subscribedTopics = globalForMqtt.mqttConfigTopics || new Set();

if (process.env.NODE_ENV !== "production") {
    globalForMqtt.mqttConfigData = mqttData;
    globalForMqtt.mqttConfigTopics = subscribedTopics;
}

const generateMqttTopic = (serialId) => {
    const prefix = serialId.slice(0, 3);
    const suffix = serialId.slice(3, 5);
    return `${prefix}/${suffix}/INPUT`;
};

function getClient() {
    if (client && client.connected) return client;

    const brokerUrl = process.env.MQTT_BROKER_URL;
    if (!brokerUrl) return null;

    client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        connectTimeout: 5000,
        reconnectPeriod: 5000,
        keepalive: 60,
        clientId: `config_${Math.random().toString(16).slice(2, 8)}`,
    });

    if (process.env.NODE_ENV !== "production") {
        globalForMqtt.mqttConfigClient = client;
    }

    client.on("connect", () => {
        console.log("MQTT ConfigTable: Connected to broker");
    });

    client.on("message", (topic, message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const fullSerialId = topic.split("/")[0] + topic.split("/")[1];
            if (!mqttData[fullSerialId]) mqttData[fullSerialId] = [];
            mqttData[fullSerialId] = [parsedMessage];
        } catch (error) {
            console.error("Failed to parse MQTT message:", error);
        }
    });

    client.on("error", (err) => {
        console.error("MQTT ConfigTable connection error:", err.message);
    });

    return client;
}

const subscribeToTopic = async (mqttClient, serialId) => {
    const topic = generateMqttTopic(serialId);
    if (!subscribedTopics.has(topic)) {
        return new Promise((resolve, reject) => {
            mqttClient.subscribe(topic, (err) => {
                if (err) reject(err);
                else { subscribedTopics.add(topic); resolve(); }
            });
        });
    }
};

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const serialId = searchParams.get("serialId");

    if (!serialId) {
        return NextResponse.json(
            { error: "serialId parameter is required" },
            { status: 400 }
        );
    }

    const mqttClient = getClient();
    if (!mqttClient) {
        return NextResponse.json(
            { error: "MQTT broker not configured" },
            { status: 503 }
        );
    }

    try {
        if (!mqttClient.connected) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
                mqttClient.once("connect", () => { clearTimeout(timeout); resolve(); });
                mqttClient.once("error", (err) => { clearTimeout(timeout); reject(err); });
            });
        }

        await subscribeToTopic(mqttClient, serialId);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const data = mqttData[serialId] || [];
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error processing request:", error);
        return NextResponse.json(
            { error: "Failed to fetch data" },
            { status: 500 }
        );
    }
}
