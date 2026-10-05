const express = require('express');
const Reading = require('../models/Reading');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const CompanyDriver = require('../models/CompanyDriver');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin'));

router.get('/summary', async (req, res) => {
  try {
    const [
      totalReadings,
      totalVehicles,
      vehicleNumbers,
      totalUsers,
      activeUsers,
      correctedReadings,
      confidenceAgg,
      recentReadings
    ] = await Promise.all([
      Reading.countDocuments(),
      Vehicle.countDocuments(),
      Vehicle.distinct('vehicleNumber'),
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Reading.countDocuments({ isCorrected: true }),
      Reading.aggregate([
        { $group: { _id: null, averageConfidence: { $avg: '$ocrConfidence' } } }
      ]),
      Reading.find()
        .sort({ readingDate: -1 })
        .limit(10)
        .select('-__v')
    ]);

    res.json({
      totals: {
        readings: totalReadings,
        vehicles: totalVehicles,
        users: totalUsers,
        activeUsers,
        correctedReadings,
        averageConfidence: confidenceAgg[0]?.averageConfidence || 0
      },
      vehicles: vehicleNumbers.sort(),
      recentReadings
    });
  } catch (error) {
    console.error('Admin summary error:', error);
    res.status(500).json({ error: 'Failed to load admin summary' });
  }
});

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const monthLabel = (date) => date.toLocaleString('en-US', { month: 'short', year: 'numeric' });

const getRecentMonths = (count = 6) => {
  const current = new Date();
  current.setDate(1);
  current.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const month = new Date(current);
    month.setMonth(current.getMonth() - (count - 1 - index));

    return {
      key: monthKey(month),
      label: monthLabel(month),
      distance: 0,
      readings: 0
    };
  });
};

const createVehicleAnalyticsRow = (vehicle) => ({
  vehicleNumber: vehicle.vehicleNumber,
  make: vehicle.make || '',
  name: vehicle.name || '',
  model: vehicle.model || '',
  status: vehicle.status,
  ownership: vehicle.ownership,
  readingCount: 0,
  totalDistance: 0,
  monthDistance: 0,
  lastMileage: null,
  lastReadingDate: null,
  correctionCount: 0,
  confidenceTotal: 0,
  averageConfidence: 0
});

const getOperatorKey = (reading) => {
  if (reading.driverName) {
    return `driver:${reading.driverName.trim().toLowerCase()}`;
  }

  return `user:${reading.submittedBy}`;
};

const createOperatorAnalyticsRow = (reading, userMap) => {
  const user = userMap.get(reading.submittedBy);

  return {
    key: getOperatorKey(reading),
    name: reading.driverName || user?.name || 'Unknown User',
    employeeId: user?.employeeId || '',
    username: user?.username || '',
    role: reading.driverName ? 'driver' : user?.role || 'user',
    readingCount: 0,
    totalDistance: 0,
    lastReadingDate: null,
    vehicles: []
  };
};

const analyticsTimeZone = 'Asia/Colombo';

const calendarDateKey = (value) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: analyticsTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const getPart = (type) => parts.find(part => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const addCalendarDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const weekKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);

  return date.toISOString().slice(0, 10);
};

const createDriverVehicleUsage = (readings, userMap) => {
  const usageMap = new Map();

  readings.forEach(reading => {
    const vehicleNumber = reading.vehicleId?.toUpperCase();
    const readingDate = new Date(reading.readingDate);

    if (!vehicleNumber || Number.isNaN(readingDate.getTime())) {
      return;
    }

    const operator = createOperatorAnalyticsRow(reading, userMap);
    const key = `${operator.key}:${vehicleNumber}`;
    const day = calendarDateKey(readingDate);

    if (!usageMap.has(key)) {
      usageMap.set(key, {
        key,
        operator,
        vehicleNumber,
        firstReadings: new Map()
      });
    }

    const usage = usageMap.get(key);
    const firstReading = usage.firstReadings.get(day);

    if (!firstReading || readingDate < firstReading.readingDate) {
      usage.firstReadings.set(day, {
        mileage: reading.extractedMileage,
        confidence: reading.ocrConfidence,
        readingDate
      });
    }
  });

  const today = calendarDateKey(new Date());
  const currentWeek = weekKey(today);
  const currentMonth = today.slice(0, 7);

  return Array.from(usageMap.values())
    .map(usage => {
      const dailyUsage = Array.from(usage.firstReadings.keys())
        .sort()
        .flatMap(day => {
          const nextDay = addCalendarDays(day, 1);
          const firstReading = usage.firstReadings.get(day);
          const nextDayFirstReading = usage.firstReadings.get(nextDay);

          if (!nextDayFirstReading) {
            return [];
          }

          const distance = nextDayFirstReading.mileage - firstReading.mileage;

          if (distance < 0) {
            return [];
          }

          return [{
            date: day,
            nextDate: nextDay,
            startMileage: firstReading.mileage,
            endMileage: nextDayFirstReading.mileage,
            distance: Math.round(distance)
          }];
        });
      const latestDailyUsage = dailyUsage.at(-1) || null;

      return {
        key: usage.key,
        name: usage.operator.name,
        employeeId: usage.operator.employeeId,
        username: usage.operator.username,
        role: usage.operator.role,
        vehicleNumber: usage.vehicleNumber,
        latestDailyUsage,
        weekDistance: Math.round(dailyUsage
          .filter(day => weekKey(day.date) === currentWeek)
          .reduce((total, day) => total + day.distance, 0)),
        monthDistance: Math.round(dailyUsage
          .filter(day => day.date.startsWith(currentMonth))
          .reduce((total, day) => total + day.distance, 0)),
        allDailyUsage: dailyUsage,
        dailyUsage: dailyUsage.slice(-7).reverse()
      };
    })
    .filter(usage => usage.latestDailyUsage)
    .sort((left, right) => (
      right.monthDistance - left.monthDistance ||
      right.weekDistance - left.weekDistance ||
      left.name.localeCompare(right.name) ||
      left.vehicleNumber.localeCompare(right.vehicleNumber)
    ));
};

const createUserDailyUsage = (readings, userMap) => {
  const usageMap = new Map();

  readings.forEach(reading => {
    const vehicleNumber = reading.vehicleId?.toUpperCase();
    const readingDate = new Date(reading.readingDate);

    if (!vehicleNumber || !reading.submittedBy || Number.isNaN(readingDate.getTime())) {
      return;
    }

    const key = `user:${reading.submittedBy}:${vehicleNumber}`;
    const day = calendarDateKey(readingDate);

    if (!usageMap.has(key)) {
      usageMap.set(key, {
        key,
        userId: reading.submittedBy,
        vehicleNumber,
        firstReadings: new Map()
      });
    }

    const usage = usageMap.get(key);
    const firstReading = usage.firstReadings.get(day);

    if (!firstReading || readingDate < firstReading.readingDate) {
      usage.firstReadings.set(day, {
        mileage: reading.extractedMileage,
        confidence: reading.ocrConfidence,
        readingDate
      });
    }
  });

  return Array.from(usageMap.values()).flatMap(usage => {
    const user = userMap.get(usage.userId);
    const days = Array.from(usage.firstReadings.keys()).sort();

    return days.flatMap(day => {
      const nextDay = addCalendarDays(day, 1);
      const start = usage.firstReadings.get(day);
      const end = usage.firstReadings.get(nextDay);

      if (!end) {
        return [];
      }

      const distance = end.mileage - start.mileage;

      if (distance < 0) {
        return [];
      }

      return [{
        key: `${usage.key}:${day}`,
        userId: usage.userId,
        name: user?.name || user?.username || 'Unknown User',
        employeeId: user?.employeeId || '',
        username: user?.username || '',
        role: user?.role || 'user',
        vehicleNumber: usage.vehicleNumber,
        date: day,
        startMileage: start.mileage,
        endMileage: end.mileage,
        confidence: start.confidence,
        distance: Math.round(distance)
      }];
    });
  }).sort((left, right) => right.date.localeCompare(left.date) || left.name.localeCompare(right.name));
};

router.get('/analytics', async (req, res) => {
  try {
    const [readings, vehicles, users, companyDriverCount] = await Promise.all([
      Reading.find()
        .sort({ vehicleId: 1, readingDate: 1 })
        .select('vehicleId extractedMileage ocrConfidence readingDate isCorrected submittedBy driverName'),
      Vehicle.find().sort({ vehicleNumber: 1 }).select('-__v'),
      User.find().select('name employeeId username role isActive'),
      CompanyDriver.countDocuments()
    ]);

    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const recentMonths = getRecentMonths(6);
    const monthlyMap = new Map(recentMonths.map(month => [month.key, month]));
    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    const vehicleMap = new Map();

    vehicles.forEach(vehicle => {
      vehicleMap.set(vehicle.vehicleNumber, createVehicleAnalyticsRow(vehicle));
    });

    const operatorMap = new Map();
    const lastReadingByVehicle = new Map();
    let totalDistance = 0;
    let monthDistance = 0;
    let correctionCount = 0;
    let confidenceTotal = 0;
    let confidenceCount = 0;
    let suspiciousReadings = 0;

    readings.forEach(reading => {
      const vehicleNumber = reading.vehicleId?.toUpperCase();
      const readingDate = new Date(reading.readingDate);

      if (!vehicleNumber) {
        return;
      }

      if (!vehicleMap.has(vehicleNumber)) {
        vehicleMap.set(vehicleNumber, createVehicleAnalyticsRow({
          vehicleNumber,
          make: '',
          name: '',
          model: '',
          status: 'active',
          ownership: 'unknown'
        }));
      }

      const vehicleStats = vehicleMap.get(vehicleNumber);
      vehicleStats.readingCount += 1;
      vehicleStats.lastMileage = reading.extractedMileage;
      vehicleStats.lastReadingDate = reading.readingDate;

      if (reading.isCorrected) {
        correctionCount += 1;
        vehicleStats.correctionCount += 1;
      }

      if (typeof reading.ocrConfidence === 'number') {
        confidenceTotal += reading.ocrConfidence;
        confidenceCount += 1;
        vehicleStats.confidenceTotal += reading.ocrConfidence;
      }

      const month = monthlyMap.get(monthKey(readingDate));
      if (month) {
        month.readings += 1;
      }

      const operatorKey = getOperatorKey(reading);
      if (!operatorMap.has(operatorKey)) {
        operatorMap.set(operatorKey, createOperatorAnalyticsRow(reading, userMap));
      }

      const operatorStats = operatorMap.get(operatorKey);
      operatorStats.readingCount += 1;
      operatorStats.lastReadingDate = reading.readingDate;
      if (!operatorStats.vehicles.includes(vehicleNumber)) {
        operatorStats.vehicles.push(vehicleNumber);
      }

      const previousReading = lastReadingByVehicle.get(vehicleNumber);
      if (previousReading) {
        const distance = reading.extractedMileage - previousReading.extractedMileage;

        if (distance < 0) {
          suspiciousReadings += 1;
        } else {
          totalDistance += distance;
          vehicleStats.totalDistance += distance;
          operatorStats.totalDistance += distance;

          if (readingDate >= currentMonthStart) {
            monthDistance += distance;
            vehicleStats.monthDistance += distance;
          }

          if (month) {
            month.distance += distance;
          }
        }
      }

      lastReadingByVehicle.set(vehicleNumber, reading);
    });

    const vehicleUsage = Array.from(vehicleMap.values())
      .map(vehicle => ({
        ...vehicle,
        totalDistance: Math.round(vehicle.totalDistance),
        monthDistance: Math.round(vehicle.monthDistance),
        averageConfidence: vehicle.readingCount ? vehicle.confidenceTotal / vehicle.readingCount : 0
      }))
      .sort((a, b) => b.totalDistance - a.totalDistance || a.vehicleNumber.localeCompare(b.vehicleNumber));

    const operatorUsage = Array.from(operatorMap.values())
      .map(operator => ({
        ...operator,
        totalDistance: Math.round(operator.totalDistance),
        vehicles: operator.vehicles.sort()
      }))
      .sort((a, b) => b.totalDistance - a.totalDistance || b.readingCount - a.readingCount);
    const driverVehicleUsage = createDriverVehicleUsage(readings, userMap);
    const userDailyUsage = createUserDailyUsage(readings, userMap);

    const activeVehicles = vehicles.filter(vehicle => vehicle.status === 'active').length;
    const unassignedVehicles = vehicles.filter(vehicle => {
      const hasPersonalUser = Boolean(vehicle.allocatedUser);
      const hasCompanyDrivers = Array.isArray(vehicle.allocatedDrivers) && vehicle.allocatedDrivers.length > 0;
      return !hasPersonalUser && !hasCompanyDrivers;
    }).length;

    res.json({
      generatedAt: new Date(),
      kpis: {
        totalVehicles: vehicles.length,
        activeVehicles,
        totalUsers: users.filter(user => user.role !== 'driver').length + companyDriverCount,
        totalDrivers: users.filter(user => user.role === 'driver').length,
        totalReadings: readings.length,
        totalDistance: Math.round(totalDistance),
        monthDistance: Math.round(monthDistance),
        averageConfidence: confidenceCount ? confidenceTotal / confidenceCount : 0,
        correctionRate: readings.length ? correctionCount / readings.length : 0,
        unassignedVehicles,
        suspiciousReadings
      },
      monthlyTrend: recentMonths.map(month => ({
        ...month,
        distance: Math.round(month.distance)
      })),
      vehicleUsage,
      operatorUsage,
      driverVehicleUsage,
      userDailyUsage
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('name email employeeId username contactNumber role vehicleId isActive createdAt');

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

module.exports = router;
