const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  make: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    default: '',
    trim: true
  },
  engineCapacity: {
    type: String,
    required: true,
    trim: true
  },
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel', 'hybrid', 'electric'],
    default: null
  },
  manufacturingYear: {
    type: Number,
    required: true,
    min: 1900,
    max: 2100
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    index: true
  },
  ownership: {
    type: String,
    enum: ['company', 'personal', 'pool'],
    default: 'company'
  },
  allocatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  allocatedDrivers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  dateOfPurchasing: {
    type: Date,
    default: null
  },
  dateOfUserAllocation: {
    type: Date,
    default: null
  },
  allocationHistory: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    allocationType: {
      type: String,
      enum: ['user', 'driver'],
      required: true
    },
    assignedAt: {
      type: Date,
      required: true
    },
    unassignedAt: {
      type: Date,
      default: null
    }
  }]
}, { timestamps: true });
vehicleSchema.index({ vehicleNumber: 'text', make: 'text', name: 'text', model: 'text' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
