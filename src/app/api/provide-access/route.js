import { MongoClient, ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function POST(req) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        return NextResponse.json(
            { error: "MongoDB connection string missing" },
            { status: 500 }
        );
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db("reflowdb");
        const users = database.collection("users");

        const { username, projectID } = await req.json();

        if (!username || !projectID) {
            return NextResponse.json(
                { error: "Username and projectID are required" },
                { status: 400 }
            );
        }

        const result = await users.updateOne(
            { username },
            { $addToSet: { sharedAccess: new ObjectId(projectID) } }
        );

        if (result.modifiedCount === 0) {
            return NextResponse.json(
                { error: "Failed to update access" },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { message: "Access provided successfully" },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error providing access:", error);
        return NextResponse.json(
            { error: "Error providing access" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
