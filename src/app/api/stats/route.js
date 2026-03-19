const { NextResponse } = require('next/server');
const connectDB = require('@/lib/db');
const { Project } = require('@/lib/models');

// GET /api/stats - Get dashboard statistics for a user
async function GET(request) {
    try {
        const username = request.headers.get('username');

        if (!username) {
            return NextResponse.json(
                { error: 'Username is required' },
                { status: 400 }
            );
        }

        await connectDB();

        // Get projects owned by user
        const ownProjects = await Project.find({ owner: username }).lean();

        // Get projects shared with user
        const sharedProjects = await Project.find({
            'sharedWith.username': username,
        }).lean();

        const allOwned = ownProjects || [];
        const allShared = sharedProjects || [];

        // Calculate stats
        const totalProjects = allOwned.length;
        const totalDevices = allOwned.reduce(
            (acc, p) => acc + (p.devices ? p.devices.length : 0),
            0
        );
        const activeDevices = allOwned.reduce(
            (acc, p) =>
                acc +
                (p.devices
                    ? p.devices.filter((d) => d.status === 'active').length
                    : 0),
            0
        );
        const sharedProjectsCount = allShared.length;

        return NextResponse.json({
            totalProjects,
            totalDevices,
            activeDevices,
            sharedProjects: sharedProjectsCount,
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}

module.exports = { GET };
