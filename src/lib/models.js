const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Device Schema
const DeviceSchema = new mongoose.Schema({
  serial_no: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: 'generic',
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'offline'],
    default: 'inactive',
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
});

// Project Schema
const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  owner: {
    type: String,
    required: true,
  },
  devices: [DeviceSchema],
  sharedWith: [{
    username: String,
    accessLevel: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read',
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Check if models already exist to avoid recompilation
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

module.exports = { User, Project };
