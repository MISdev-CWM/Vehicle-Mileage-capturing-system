const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  contactNumber: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['admin', 'employee', 'user', 'driver'],
    default: 'user',
    index: true
  },
  vehicleId: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  passwordSalt: {
    type: String,
    required: true,
    select: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

userSchema.index({ name: 'text', email: 'text', username: 'text', employeeId: 'text' });

module.exports = mongoose.model('User', userSchema);
