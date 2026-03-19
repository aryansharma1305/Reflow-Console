import { NextResponse } from "next/server";
import mqtt from "mqtt";

let client = null;
let mqttData = {};
const subscribedTopics = new Set();

const generateMqttTopic = (serialId) => {
    const prefix = serialId.slice(0, 3);
    const suffix = serialId.slice(3, 5);
    return `${prefix}/${suffix}/OUTPUT`;
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
    });

    client.on("connect", () => {
        console.log("MQTT Output: Connected to broker");
    });

    client.on("message", (topic, message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const fullSerialId = topic.split("/")[0] + topic.split("/")[1];
            mqttData[fullSerialId] = [parsedMessage];
        } catch (error) {
            console.error("Failed to parse MQTT output message:", error);
        }
    });

    client.on("error", (err) => {
        console.error("MQTT Output connection error:", err.message);
    });

    return client;
}

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

        const topic = generateMqttTopic(serialId);
        if (!subscribedTopics.has(topic)) {
            mqttClient.subscribe(topic);
            subscribedTopics.add(topic);
        }

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
