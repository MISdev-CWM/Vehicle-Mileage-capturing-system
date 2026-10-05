const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const Reading = require('../models/Reading');
const Vehicle = require('../models/Vehicle');
const CompanyDriver = require('../models/CompanyDriver');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// CRITICAL: Store file in memory only, never on disk
const upload = multer({ storage: multer.memoryStorage() });

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8000';

router.use(authenticate);

// GET /api/readings/options — Return vehicles and company drivers for driver login dropdowns
router.get('/options', async (req, res) => {
  try {
    const [vehicles, companyDrivers] = await Promise.all([
      Vehicle.find({ status: 'active' }).sort({ vehicleNumber: 1 }).select('vehicleNumber make name model ownership'),
      CompanyDriver.find().sort({ employeeName: 1 }).select('employeeId employeeName')
    ]);

    res.json({ vehicles, companyDrivers });
  } catch (error) {
    console.error('Options load error:', error);
    res.status(500).json({ error: 'Failed to load options' });
  }
});

// POST /api/readings/extract — Analyze image, return data, DON'T save yet
router.post('/extract', upload.single('meterImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Forward image buffer to Python EasyOCR service
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const ocrResponse = await axios.post(`${OCR_SERVICE_URL}/extract`, form, {
      headers: form.getHeaders(),
      timeout: 30000  // OCR can be slow on first run
    });

    const ocrData = ocrResponse.data;

    if (!ocrData.success || !ocrData.best_guess) {
      return res.status(422).json({
        error: 'Could not detect odometer reading',
        rawText: ocrData.raw_text,
        suggestion: 'Ensure the odometer is centered, well-lit, and glare-free'
      });
    }

    // Return extracted data for user verification — NOT saved yet
    res.json({
      success: true,
      extracted: {
        mileage: ocrData.best_guess.value,
        confidence: ocrData.best_guess.confidence,
        rawText: ocrData.raw_text,
        allCandidates: ocrData.candidates
      }
    });

  } catch (error) {
    console.error('OCR forwarding error:', error.message);
    res.status(500).json({ 
      error: 'OCR service unavailable',
      detail: error.message 
    });
  }
});

// POST /api/readings — Save after user confirms/corrects
router.post('/', async (req, res) => {
  try {
    const { vehicleId, mileage, rawText, confidence, isCorrected, originalMileage, location, driverName } = req.body;

    if (!vehicleId || mileage === undefined) {
      return res.status(400).json({ error: 'vehicleId and mileage are required' });
    }

    // Optional: Validate against last reading to prevent rollback
    const lastReading = await Reading.findOne({ vehicleId }).sort({ readingDate: -1 });
    if (lastReading && mileage < lastReading.extractedMileage) {
      return res.status(400).json({
        error: 'Mileage is less than last recorded reading',
        lastReading: lastReading.extractedMileage,
        hint: 'Odometer cannot decrease. Check for misread digits.'
      });
    }

    const reading = new Reading({
      vehicleId: vehicleId.toUpperCase().trim(),
      extractedMileage: mileage,
      rawOcrText: rawText || '',
      ocrConfidence: confidence || 0,
      isCorrected: isCorrected || false,
      originalMileage: originalMileage || null,
      location,
      submittedBy: req.user._id.toString(),
      driverName: driverName || ''
    });

    await reading.save();

    res.status(201).json({
      success: true,
      reading: {
        id: reading._id,
        vehicleId: reading.vehicleId,
        mileage: reading.extractedMileage,
        date: reading.readingDate
      }
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save reading' });
  }
});

// GET /api/readings — All readings (admin, filterable + paginated)
router.get('/', async (req, res) => {
  try {
    const { vehicleId, driverName, startDate, endDate, page = 1 } = req.query;
    const PAGE_SIZE = 50;

    const filter = {};
    if (vehicleId) filter.vehicleId = { $regex: vehicleId.trim(), $options: 'i' };
    if (driverName) filter.driverName = { $regex: driverName.trim(), $options: 'i' };
    if (startDate || endDate) {
      filter.readingDate = {};
      if (startDate) filter.readingDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.readingDate.$lte = end;
      }
    }

    const skip = (parseInt(page, 10) - 1) * PAGE_SIZE;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const todayFilter = { readingDate: { $gte: todayStart, $lt: tomorrowStart } };

    const [readings, total, todayTotalReadings, allVehicleCount, regularUserCount, companyDriverCount, todayCorrectedRecords] = await Promise.all([
      Reading.find(filter)
        .sort({ readingDate: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .select('-__v'),
      Reading.countDocuments(filter),
      Reading.countDocuments(todayFilter),
      Vehicle.countDocuments(),
      User.countDocuments({ role: { $ne: 'driver' } }),
      CompanyDriver.countDocuments(),
      Reading.countDocuments({ ...todayFilter, isCorrected: true })
    ]);
    const allUserCount = regularUserCount + companyDriverCount;

    const submittedByValues = [...new Set(readings.map(reading => String(reading.submittedBy || '')).filter(Boolean))];
    const objectIdValues = submittedByValues.filter(value => /^[a-f\d]{24}$/i.test(value));
    const users = await User.find({
      $or: [
        ...(objectIdValues.length ? [{ _id: { $in: objectIdValues } }] : []),
        { username: { $in: submittedByValues } },
        { employeeId: { $in: submittedByValues } }
      ]
    }).select('name username employeeId');
    const userMap = new Map();
    users.forEach(user => {
      userMap.set(user._id.toString(), user);
      if (user.username) userMap.set(user.username, user);
      if (user.employeeId) userMap.set(user.employeeId, user);
    });
    const readingsWithUserNames = readings.map(reading => ({
      ...reading.toObject(),
      submittedByName: userMap.get(String(reading.submittedBy))?.name || userMap.get(String(reading.submittedBy))?.username || 'Unknown User'
    }));

    res.json({
      readings: readingsWithUserNames,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / PAGE_SIZE),
      pageSize: PAGE_SIZE,
      stats: {
        todayTotalReadings,
        allVehicleCount,
        allUserCount,
        todayCorrectedRecords
      }
    });
  } catch (error) {
    console.error('Admin readings list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/readings/stats/:vehicleId — Aggregated stats (must be BEFORE /:vehicleId)
router.get('/stats/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase();

    const readings = await Reading.find({ vehicleId })
      .sort({ readingDate: 1 })
      .select('extractedMileage readingDate');

    if (readings.length === 0) {
      return res.json({ totalReadings: 0, totalDistance: 0, averageDaily: 0 });
    }

    const totalReadings = readings.length;
    const first = readings[0];
    const last = readings[readings.length - 1];
    const totalDistance = last.extractedMileage - first.extractedMileage;

    // Days between first and last reading (minimum 1 to avoid division by zero)
    const daysDiff = Math.max(
      1,
      Math.round((new Date(last.readingDate) - new Date(first.readingDate)) / (1000 * 60 * 60 * 24))
    );
    const averageDaily = totalReadings > 1 ? Math.round(totalDistance / daysDiff) : 0;

    res.json({ totalReadings, totalDistance: Math.max(0, totalDistance), averageDaily });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/readings/:id — Admin can correct only the saved mileage value
router.put('/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const mileage = Number(req.body.mileage);

    if (!Number.isFinite(mileage) || mileage < 0) {
      return res.status(400).json({ error: 'A valid mileage value is required' });
    }

    const reading = await Reading.findById(req.params.id);

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    const previousMileage = reading.extractedMileage;
    reading.extractedMileage = mileage;

    if (mileage !== previousMileage && reading.originalMileage == null) {
      reading.originalMileage = previousMileage;
    }

    reading.isCorrected = mileage !== previousMileage || reading.isCorrected;
    await reading.save();

    res.json({ success: true, reading });
  } catch (error) {
    console.error('Admin reading update error:', error);
    res.status(500).json({ error: 'Failed to update reading' });
  }
});

// DELETE /api/readings/:id — Admin can remove an incorrect reading
router.delete('/:id', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const reading = await Reading.findByIdAndDelete(req.params.id);

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Admin reading delete error:', error);
    res.status(500).json({ error: 'Failed to delete reading' });
  }
});

// GET /api/readings/:vehicleId — History
router.get('/:vehicleId', async (req, res) => {
  try {
    const readings = await Reading.find({ 
      vehicleId: req.params.vehicleId.toUpperCase() 
    })
    .sort({ readingDate: -1 })
    .limit(100)
    .select('-__v');  // Exclude version key
    
    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
