const { NextResponse } = require('next/server');
const connectDB = require('@/lib/db');
const { Project } = require('@/lib/models');

// POST /api/projects/[id]/devices - Add a device to a project
async function POST(request, { params }) {
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
    const { serial_no, name, type } = body;

    if (!serial_no || !name) {
      return NextResponse.json(
        { error: 'Serial number and name are required' },
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

    // Check if user has write access
    const hasAccess = 
      project.owner === username ||
      project.sharedWith.some(
        (share) => share.username === username && 
        (share.accessLevel === 'write' || share.accessLevel === 'admin')
      );

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if device already exists
    const deviceExists = project.devices.some(
      (device) => device.serial_no === serial_no
    );

    if (deviceExists) {
      return NextResponse.json(
        { error: 'Device with this serial number already exists' },
        { status: 400 }
      );
    }

    // Add device
    project.devices.push({
      serial_no,
      name,
      type: type || 'generic',
      status: 'inactive',
      lastSeen: new Date(),
    });

    project.updatedAt = new Date();
    await project.save();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error adding device:', error);
    return NextResponse.json(
      { error: 'Failed to add device' },
      { status: 500 }
    );
  }
}

module.exports = { POST };
