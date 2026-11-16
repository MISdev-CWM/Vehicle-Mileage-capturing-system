const express = require('express');
const router = express.Router();
const multer = require('multer');
const Reading = require('../models/Reading');
const Vehicle = require('../models/Vehicle');
const CompanyDriver = require('../models/CompanyDriver');
const Division = require('../models/Division');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { uploadMeterPhoto, downloadMeterPhoto, deleteMeterPhoto } = require('../utils/googleDrive');

// Calendar date (YYYY-MM-DD) in Sri Lankan time.
const getColomboDateKey = (value) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const getPart = (type) => parts.find(part => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

// All YYYY-MM-DD keys from start to end, inclusive, to count the days a pool vehicle was used for the daily avg.
const getDateKeysBetween = (startKey, endKey) => {
  const keys = [];
  const cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
};

const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin', 'super admin', 'super-admin'];

const MAX_METER_IMAGE_SIZE = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_METER_IMAGE_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Meter photo must be a JPEG, PNG, or WebP image'));
    }
    callback(null, true);
  }
});

const MAX_POOL_IN_TO_OUT_GAP_KM = 1;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const uploadMeterImage = (req, res, next) => {
  upload.single('meterImage')(req, res, error => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    next();
  });
};

router.use(authenticate);

// GET /api/readings/options — Return vehicles, company drivers, divisions, and users for driver login dropdowns
router.get('/options', async (req, res) => {
  try {
    const vehicleFilter = { status: 'active' };
    if (req.user.role === 'driver') {
      vehicleFilter.ownership = 'pool';
    }

    const [vehicles, companyDrivers, divisions, users] = await Promise.all([
      Vehicle.find(vehicleFilter).sort({ vehicleNumber: 1 }).select('vehicleNumber make name model ownership'),
      CompanyDriver.find().sort({ employeeName: 1 }).select('employeeId employeeName'),
      Division.find().sort({ name: 1 }).select('name'),
      User.find({ role: 'user', isActive: true }).sort({ name: 1 }).select('name')
    ]);

    res.json({ vehicles, companyDrivers, divisions, users });
  } catch (error) {
    console.error('Options load error:', error);
    res.status(500).json({ error: 'Failed to load options' });
  }
});

// POST /api/readings — Save a manually entered reading with its camera photo
router.post('/', uploadMeterImage, async (req, res) => {
  try {
    const { vehicleId, mileage, location, driverName, division, divisionName, reason } = req.body;
    const rentalRequested = req.body.isRental === 'true';

    if (!req.file) {
      return res.status(400).json({ error: 'A camera photo is required' });
    }

    const mileageNumber = Number(mileage);
    if (!vehicleId || mileage === undefined || String(mileage).trim() === ''
      || !Number.isSafeInteger(mileageNumber) || mileageNumber < 0) {
      return res.status(400).json({ error: 'A valid vehicle ID and mileage are required' });
    }

    let parsedLocation = null;
    if (location) {
      try {
        parsedLocation = JSON.parse(location);
      } catch {
        return res.status(400).json({ error: 'Invalid location data' });
      }
    }

    const normalizedVehicleId = vehicleId.toUpperCase().trim();

    // Optional: Validate against last reading to prevent rollback
    const [lastReading, lastRentalReading] = await Promise.all([
      Reading.findOne({ vehicleId: normalizedVehicleId }).sort({ readingDate: -1 }),
      Reading.findOne({ vehicleId: normalizedVehicleId, isRental: true }).sort({ readingDate: -1 })
    ]);

    const rentalIsOpen = lastRentalReading?.meterType === 'out';
    if (rentalIsOpen && !rentalRequested) {
      return res.status(409).json({
        error: 'This vehicle is checked out as a rental. Record its IN return reading before using normal vehicle readings.'
      });
    }

    if (rentalRequested && !rentalIsOpen && lastReading?.meterType === 'out' && !lastReading.isRental) {
      return res.status(409).json({
        error: 'This vehicle is already checked out. Record its IN return reading before starting a rental.'
      });
    }

    // Driver login on a pool vehicle: readings alternate between OUT and IN
    let meterType = null;
    if (rentalRequested) {
      meterType = rentalIsOpen ? 'in' : 'out';
    } else if (req.user.role === 'driver') {
      const vehicle = await Vehicle.findOne({ vehicleNumber: vehicleId.toUpperCase().trim() }).select('ownership');

      if (vehicle?.ownership === 'pool') {
        const isVehicleOut = lastReading?.meterType === 'out';
        const isSamePerson = (lastReading?.driverName || '').trim().toLowerCase() === (driverName || '').trim().toLowerCase();

        if (isVehicleOut && !isSamePerson) {
          return res.status(409).json({
            error: `This vehicle is currently out with ${lastReading.driverName}. Only they can return it.`
          });
        }

        meterType = isVehicleOut ? 'in' : 'out';
      }
    }

    if (lastReading && mileageNumber < lastReading.extractedMileage) {
      return res.status(400).json({
        error: 'Mileage is less than last recorded reading',
        lastReading: lastReading.extractedMileage,
        hint: 'Odometer cannot decrease. Check for misread digits.'
      });
    }

    // Pool vehicles: last IN and next OUT should be at most 1km apart.
    // A larger gap is informational only; the reading is still saved.
    const exceedsPoolGap = !rentalRequested
      && meterType === 'out'
      && lastReading?.meterType === 'in'
      && mileageNumber - lastReading.extractedMileage > MAX_POOL_IN_TO_OUT_GAP_KM;

    let driveFileId;
    try {
      const fileExtension = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
      }[req.file.mimetype];
      const fileNamePart = value => value.replace(/[^a-zA-Z0-9_-]/g, '_');
      const vehicleNumber = vehicleId.toUpperCase().trim();
      const timestamp = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-');
      const fileName = [
        fileNamePart(vehicleNumber),
        fileNamePart(req.user.username),
        timestamp
      ].join('_');

      driveFileId = await uploadMeterPhoto({
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        fileName: `${fileName}.${fileExtension}`
      });
    } catch (error) {
      console.error('Google Drive meter photo upload error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status
      });
      return res.status(502).json({
        error: error.message.startsWith('Google Drive configuration is missing:')
          ? error.message
          : 'Could not upload the meter photo to Google Drive. Check backend logs and Drive permissions.'
      });
    }

    const reading = new Reading({
      vehicleId: vehicleId.toUpperCase().trim(),
      extractedMileage: mileageNumber,
      meterImageDriveId: driveFileId,
      meterImageContentType: req.file.mimetype,
      hasMeterImage: true,
      isCorrected: false,
      location: parsedLocation,
      submittedBy: req.user._id.toString(),
      driverName: driverName || '',
      division: division || null,
      divisionName: divisionName || '',
      reason: reason || '',
      meterType,
      isRental: rentalRequested
    });

    try {
      await reading.save();
    } catch (error) {
      try {
        await deleteMeterPhoto(driveFileId);
      } catch (cleanupError) {
        console.error('Google Drive orphaned meter photo cleanup error:', cleanupError);
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      reading: {
        id: reading._id,
        vehicleId: reading.vehicleId,
        mileage: reading.extractedMileage,
        date: reading.readingDate,
        meterType: reading.meterType,
        isRental: reading.isRental,
        hasMeterImage: true
      },
      ...(exceedsPoolGap && {
        warning: `Your OUT meter is more than ${MAX_POOL_IN_TO_OUT_GAP_KM} km larger than the last IN meter reading for this vehicle.`
      })
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save reading' });
  }
});

// GET /api/readings — All readings (admin, filterable + paginated)
router.get('/', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { vehicleId, driverName, userKey, startDate, endDate, ownership, month, page = 1 } = req.query;
    const PAGE_SIZE = 50;

    const filter = {};
    if (vehicleId) filter.vehicleId = { $regex: vehicleId.trim(), $options: 'i' };
    else if (ownership) {
      const ownershipVehicles = await Vehicle.find({ ownership }).select('vehicleNumber');
      const vehicleNumbers = ownershipVehicles.map(v => v.vehicleNumber);
      filter.vehicleId = vehicleNumbers.length ? { $in: vehicleNumbers } : { $in: [] };
    }
    if (driverName) filter.driverName = { $regex: driverName.trim(), $options: 'i' };
    if (userKey) {
      const [type, ...valueParts] = userKey.split(':');
      const value = valueParts.join(':').trim();

      if (type === 'user' && value) {
        // New readings store the authenticated user's id in submittedBy.
        filter.submittedBy = value;
      }

      if (type === 'driver' && value) {
        // Company-driver readings are identified by the driver name selected at capture time.
        filter.driverName = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
      }
    }
    if (startDate || endDate) {
      filter.readingDate = {};
      if (startDate) filter.readingDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.readingDate.$lte = end;
      }
    } else if (month) {
      const [year, monthIndex] = String(month).split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
        filter.readingDate = {
          $gte: new Date(Date.UTC(year, monthIndex - 1, 1)),
          $lt: new Date(Date.UTC(year, monthIndex, 1))
        };
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

// GET /api/readings/irregular-pool — Pool OUT readings too far above the previous IN (must be BEFORE /:vehicleId)
router.get('/irregular-pool', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const vehicleIds = await Reading.distinct('vehicleId', { meterType: 'in' });
    const readings = await Reading.find({ vehicleId: { $in: vehicleIds } })
      .sort({ vehicleId: 1, readingDate: 1 })
      .select('vehicleId extractedMileage readingDate driverName meterType')
      .lean();

    const rows = [];
    readings.forEach((outReading, index) => {
      const inReading = readings[index - 1];
      if (
        inReading?.vehicleId === outReading.vehicleId
        && inReading.meterType === 'in'
        && outReading.meterType === 'out'
        && outReading.extractedMileage - inReading.extractedMileage > MAX_POOL_IN_TO_OUT_GAP_KM
      ) {
        rows.push({
          _id: outReading._id,
          vehicleId: outReading.vehicleId,
          inMeter: inReading.extractedMileage,
          inTime: inReading.readingDate,
          inDriver: inReading.driverName,
          outMeter: outReading.extractedMileage,
          outTime: outReading.readingDate,
          outDriver: outReading.driverName,
          gap: outReading.extractedMileage - inReading.extractedMileage
        });
      }
    });

    rows.sort((left, right) => new Date(right.outTime) - new Date(left.outTime));
    res.json(rows);
  } catch (error) {
    console.error('Irregular pool readings error:', error);
    res.status(500).json({ error: 'Failed to load irregular pool readings' });
  }
});

// GET /api/readings/stats/:vehicleId — Aggregated stats (must be BEFORE /:vehicleId)
router.get('/stats/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase();

    const [readings, vehicle] = await Promise.all([
      Reading.find({ vehicleId })
        .sort({ readingDate: 1 })
        .select('extractedMileage readingDate meterType'),
      Vehicle.findOne({ vehicleNumber: vehicleId }).select('ownership')
    ]);

    if (readings.length === 0) {
      return res.json({ totalReadings: 0, totalDistance: 0, averageDaily: 0 });
    }

    const totalReadings = readings.length;
    const first = readings[0];
    const last = readings[readings.length - 1];
    let totalDistance = last.extractedMileage - first.extractedMileage;
    let averageDaily;

    if (vehicle?.ownership === 'pool') {
      // Pool vehicles, per completed trip:
      // - total km adds up (IN meter - OUT meter)
      // - days used collects every calendar date from OUT to IN (inclusive); a same-day
      //   trip counts only if the vehicle moved. Each date is counted once.
      totalDistance = 0;
      const usedDates = new Set();
      let openOut = null;

      readings.forEach(reading => {
        if (reading.meterType === 'out') {
          openOut = reading;
        } else if (reading.meterType === 'in' && openOut) {
          const tripDistance = reading.extractedMileage - openOut.extractedMileage;
          totalDistance += Math.max(0, tripDistance);

          const outDateKey = getColomboDateKey(new Date(openOut.readingDate));
          const inDateKey = getColomboDateKey(new Date(reading.readingDate));

          if (outDateKey !== inDateKey) {
            getDateKeysBetween(outDateKey, inDateKey).forEach(dateKey => usedDates.add(dateKey));
          } else if (tripDistance !== 0) {
            usedDates.add(inDateKey);
          }

          openOut = null;
        }
      });

      averageDaily = usedDates.size > 0 ? Math.round(totalDistance / usedDates.size) : 0;
    } else {
      // Days between first and last reading (minimum 1 to avoid division by zero)
      const daysDiff = Math.max(
        1,
        Math.round((new Date(last.readingDate) - new Date(first.readingDate)) / (1000 * 60 * 60 * 24))
      );
      averageDaily = totalReadings > 1 ? Math.round(totalDistance / daysDiff) : 0;
    }

    res.json({ totalReadings, totalDistance: Math.max(0, totalDistance), averageDaily });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/readings/:id — Admin can correct only the saved mileage value
router.put('/:id', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
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
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const reading = await Reading.findById(req.params.id).select('+meterImageDriveId');

    if (!reading) {
      return res.status(404).json({ error: 'Reading not found' });
    }

    await Reading.findByIdAndDelete(req.params.id);

    if (reading.meterImageDriveId) {
      try {
        await deleteMeterPhoto(reading.meterImageDriveId);
      } catch (error) {
        console.error('Google Drive meter photo deletion error:', error);
        return res.status(502).json({ error: 'Reading deleted, but its Google Drive photo could not be deleted.' });
      }
    }

    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Admin reading delete error:', error);
    res.status(500).json({ error: 'Failed to delete reading' });
  }
});

// GET /api/readings/:id/image — Saved odometer photo
router.get('/:id/image', authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const reading = await Reading.findById(req.params.id)
      .select('+meterImageDriveId +meterImageContentType');
    if (!reading?.meterImageDriveId) {
      return res.status(404).json({ error: 'Meter photo not found' });
    }

    const image = await downloadMeterPhoto(reading.meterImageDriveId);
    res.set('Cache-Control', 'private, no-store');
    res.type(reading.meterImageContentType || 'application/octet-stream').send(image);
  } catch (error) {
    console.error('Meter photo load error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    res.status(502).json({
      error: error.message.startsWith('Google Drive configuration is missing:')
        ? error.message
        : 'Failed to load meter photo from Google Drive. Check backend logs and Drive permissions.'
    });
  }
});

// GET /api/readings/rental-status/:vehicleId — Current rental checkout state
router.get('/rental-status/:vehicleId', async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId.toUpperCase().trim();
    const latestRentalReading = await Reading.findOne({ vehicleId, isRental: true })
      .sort({ readingDate: -1 })
      .select('meterType');

    res.json({ isOut: latestRentalReading?.meterType === 'out' });
  } catch (error) {
    console.error('Rental status load error:', error);
    res.status(500).json({ error: 'Failed to load rental status' });
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
