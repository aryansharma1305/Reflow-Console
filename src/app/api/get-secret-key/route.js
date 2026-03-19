import { Client } from "pg";
import { NextResponse } from "next/server";

// POST handler function for verifying device secret key
export async function POST(req) {
    const client = new Client({
        host: process.env.POSTGRES_HOST,
        database: process.env.POSTGRES_DB_SECRET_KEY,
        user: process.env.POSTGRES_USER_SECRET_KEY,
        password: process.env.POSTGRES_PASSWORD_SECRET_KEY,
        port: process.env.POSTGRES_PORT,
    });

    const { device_serial_number, secret_key } = await req.json();

    if (!device_serial_number || !secret_key) {
        return NextResponse.json(
            { error: "device_serial_number and secret_key are required" },
            { status: 400 }
        );
    }

    try {
        await client.connect();

        const query = `SELECT 1 FROM myax3 WHERE device_serial_number = $1 AND secret_key = $2`;
        const result = await client.query(query, [device_serial_number, secret_key]);

        if (result.rows.length > 0) {
            return NextResponse.json({ status: "verified" }, { status: 200 });
        } else {
            return NextResponse.json({ status: "not verified" }, { status: 404 });
        }
    } catch (err) {
        console.error("Database query error:", err.stack);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    } finally {
        await client.end();
    }
}
