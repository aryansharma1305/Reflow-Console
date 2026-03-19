const { NextResponse } = require('next/server');
const connectDB = require('@/lib/db');
const { Project } = require('@/lib/models');

// GET /api/projects - Get all projects for a user
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

    return NextResponse.json({
      ownProjects,
      sharedProjects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
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
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const project = new Project({
      name,
      owner: username,
      devices: [],
      sharedWith: [],
    });

    await project.save();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}

module.exports = { GET, POST };
