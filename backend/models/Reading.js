const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  extractedMileage: {
    type: Number,
    required: true,
    min: 0
  },
  meterImageDriveId: {
    type: String,
    default: null,
    select: false
  },
  meterImageContentType: {
    type: String,
    select: false
  },
  hasMeterImage: {
    type: Boolean,
    default: false
  },
  readingDate: {
    type: Date,
    default: Date.now
  },
  // An administrator can mark a correction to the saved value
  isCorrected: {
    type: Boolean,
    default: false
  },
  originalMileage: {
    type: Number,
    default: null
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  submittedBy: {
    type: String,  // or ObjectId if you have auth
    required: true
  },
  driverName: {
    type: String,
    default: ''
  },
  // Store division and reason (specifically for pool vehicles)
  division: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Division',
    default: null
  },
  divisionName: {
    type: String,
    trim: true,
    default: ''
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ''
  },
  // Pool vehicle hires: 'out' when the vehicle leaves, 'in' when it is returned
  meterType: {
    type: String,
    enum: ['out', 'in', null],
    default: null
  },
  isRental: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Prevent duplicate readings for same vehicle on same day (optional)
readingSchema.index({ vehicleId: 1, readingDate: 1 });

module.exports = mongoose.model('Reading', readingSchema);