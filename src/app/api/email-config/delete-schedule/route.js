import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

export async function DELETE(request) {
    const device = request.headers.get('device');

    if (!device) {
        return NextResponse.json(
            { message: 'Device ID is required in headers' },
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

        const result = await collection.findOneAndDelete({ device: device });

        if (!result) {
            return NextResponse.json(
                { message: 'Device not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: 'Report Schedule deleted successfully',
            deletedDevice: result
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
