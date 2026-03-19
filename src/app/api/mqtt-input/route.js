import mqtt from "mqtt";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { deviceInput, topic } = await request.json();

        const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASSWORD,
        });

        return new Promise((resolve) => {
            client.on("connect", () => {
                client.publish(
                    topic,
                    JSON.stringify(deviceInput),
                    { retain: true },
                    (err) => {
                        client.end();
                        if (err) {
                            resolve(
                                NextResponse.json(
                                    { message: "Failed to publish" },
                                    { status: 500 }
                                )
                            );
                        } else {
                            resolve(
                                NextResponse.json(
                                    { message: "Data published successfully" },
                                    { status: 200 }
                                )
                            );
                        }
                    }
                );
            });

            client.on("error", () => {
                client.end();
                resolve(
                    NextResponse.json(
                        { message: "Connection error" },
                        { status: 500 }
                    )
                );
            });
        });
    } catch (error) {
        return NextResponse.json(
            { message: "Error parsing request body" },
            { status: 400 }
        );
    }
}
