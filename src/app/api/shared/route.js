const { NextResponse } = require('next/server');
const connectDB = require('@/lib/db');
const { Project } = require('@/lib/models');

// GET /api/shared - Get projects shared with the user
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

        const sharedProjects = await Project.find({
            'sharedWith.username': username,
        }).lean();

        // Enrich with user's access level
        const enriched = (sharedProjects || []).map((project) => {
            const shareEntry = project.sharedWith.find(
                (s) => s.username === username
            );
            return {
                ...project,
                userRole: shareEntry ? shareEntry.accessLevel : 'read',
            };
        });

        return NextResponse.json({ sharedProjects: enriched });
    } catch (error) {
        console.error('Error fetching shared projects:', error);
        return NextResponse.json(
            { error: 'Failed to fetch shared projects' },
            { status: 500 }
        );
    }
}

// POST /api/shared - Share a project with another user
async function POST(request) {
    try {
        const username = request.headers.get('username');

        if (!username) {
            return NextResponse.json(
                { error: 'Username is required' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { projectId, targetUsername, accessLevel } = body;

        if (!projectId || !targetUsername) {
            return NextResponse.json(
                { error: 'Project ID and target username are required' },
                { status: 400 }
            );
        }

        await connectDB();

        const project = await Project.findById(projectId);

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            );
        }

        // Only owner can share
        if (project.owner !== username) {
            return NextResponse.json(
                { error: 'Only the project owner can share access' },
                { status: 403 }
            );
        }

        // Check if already shared
        const alreadyShared = project.sharedWith.some(
            (s) => s.username === targetUsername
        );

        if (alreadyShared) {
            // Update access level
            project.sharedWith = project.sharedWith.map((s) =>
                s.username === targetUsername
                    ? { ...s, accessLevel: accessLevel || 'read' }
                    : s
            );
        } else {
            project.sharedWith.push({
                username: targetUsername,
                accessLevel: accessLevel || 'read',
            });
        }

        project.updatedAt = new Date();
        await project.save();

        return NextResponse.json({
            message: 'Access granted successfully',
            project,
        });
    } catch (error) {
        console.error('Error sharing project:', error);
        return NextResponse.json(
            { error: 'Failed to share project' },
            { status: 500 }
        );
    }
}

// DELETE /api/shared - Revoke access
async function DELETE(request) {
    try {
        const username = request.headers.get('username');

        if (!username) {
            return NextResponse.json(
                { error: 'Username is required' },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const targetUsername = searchParams.get('targetUsername');

        if (!projectId || !targetUsername) {
            return NextResponse.json(
                { error: 'Project ID and target username are required' },
                { status: 400 }
            );
        }

        await connectDB();

        const project = await Project.findById(projectId);

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            );
        }

        if (project.owner !== username) {
            return NextResponse.json(
                { error: 'Only the project owner can revoke access' },
                { status: 403 }
            );
        }

        project.sharedWith = project.sharedWith.filter(
            (s) => s.username !== targetUsername
        );

        project.updatedAt = new Date();
        await project.save();

        return NextResponse.json({ message: 'Access revoked successfully' });
    } catch (error) {
        console.error('Error revoking access:', error);
        return NextResponse.json(
            { error: 'Failed to revoke access' },
            { status: 500 }
        );
    }
}

module.exports = { GET, POST, DELETE };
