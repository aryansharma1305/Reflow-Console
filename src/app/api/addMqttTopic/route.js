import mqtt from "mqtt";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASSWORD,
        });

        const { topic, ...data } = await req.json();

        return new Promise((resolve) => {
            client.on("connect", () => {
                client.publish(topic, JSON.stringify(data), (err) => {
                    client.end();
                    if (err) {
                        resolve(
                            NextResponse.json(
                                { success: false, error: err.message },
                                { status: 500 }
                            )
                        );
                    } else {
                        resolve(
                            NextResponse.json(
                                { success: true, topic, data },
                                { status: 200 }
                            )
                        );
                    }
                });
            });

            client.on("error", (err) => {
                client.end();
                resolve(
                    NextResponse.json(
                        { success: false, error: err.message },
                        { status: 500 }
                    )
                );
            });
        });
    } catch (err) {
        return NextResponse.json(
            { success: false, error: err.message },
            { status: 500 }
        );
    }
}
