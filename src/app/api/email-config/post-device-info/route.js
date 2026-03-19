import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const body = await request.json();
    const { device, ...updateData } = body;

    if (!device) {
        return NextResponse.json(
            { message: 'Device ID is required' },
            { status: 400 }
        );
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        return NextResponse.json(
            { message: 'MongoDB connection string missing' },
            { status: 500 }
        );
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('reflowdb');
        const collection = database.collection('email-reports');

        const result = await collection.findOneAndUpdate(
            { device: device },
            { $set: updateData },
            {
                upsert: true,
                returnDocument: 'after'
            }
        );

        return NextResponse.json({
            message: 'Device configuration updated successfully',
            data: result.value
        });
    } catch (error) {
        console.error('MongoDB error:', error);
        return NextResponse.json(
            { message: 'Database operation failed', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
