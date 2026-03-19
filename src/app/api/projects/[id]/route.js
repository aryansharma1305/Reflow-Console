const { NextResponse } = require('next/server');
const connectDB = require('@/lib/db');
const { Project } = require('@/lib/models');
const mongoose = require('mongoose');

// GET /api/projects/[id] - Get a specific project
async function GET(request, { params }) {
  try {
    const { id } = params;
    const username = request.headers.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const project = await Project.findById(id).lean();

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if user has access
    const hasAccess = 
      project.owner === username ||
      project.sharedWith.some((share) => share.username === username);

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update a project
async function PUT(request, { params }) {
  try {
    const { id } = params;
    const username = request.headers.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    await connectDB();

    const project = await Project.findById(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (project.owner !== username) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Update fields
    if (body.name) project.name = body.name;
    if (body.devices) project.devices = body.devices;
    if (body.sharedWith) project.sharedWith = body.sharedWith;
    
    project.updatedAt = new Date();
    await project.save();

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project
async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const username = request.headers.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const project = await Project.findById(id);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Only owner can delete
    if (project.owner !== username) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    await Project.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}

module.exports = { GET, PUT, DELETE };
