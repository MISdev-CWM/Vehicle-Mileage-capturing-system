const express = require('express');
const Reading = require('../models/Reading');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const CompanyDriver = require('../models/CompanyDriver');
const { authenticate, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorizeRoles('admin', 'superadmin', 'super_admin', 'super admin', 'super-admin'));

router.get('/summary', async (req, res) => {
  try {
    const [
      totalReadings,
      totalVehicles,
      vehicleNumbers,
      totalUsers,
      activeUsers,
      correctedReadings,
      recentReadings
    ] = await Promise.all([
      Reading.countDocuments(),
      Vehicle.countDocuments(),
      Vehicle.distinct('vehicleNumber'),
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Reading.countDocuments({ isCorrected: true }),
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
        correctedReadings
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
  firstMileage: null,
  firstReadingDate: null,
  totalDistance: 0,
  monthDistance: 0,
  monthUsageDates: new Set(),
  lastMileage: null,
  lastReadingDate: null,
  correctionCount: 0
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

/*
 * Legacy daily analytics (kept for reference).
 * This implementation compared the first reading of one day with the first
 * reading of the next available day. The active implementation below uses the
 * first and last recordings inside the selected date range instead.
 *
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

const weekKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);

  return date.toISOString().slice(0, 10);
};

const createVehicleAssignmentSessions = (readings, userMap) => {
  const readingsByVehicle = new Map();

  readings.forEach(reading => {
    const vehicleNumber = reading.vehicleId?.toUpperCase();
    const readingDate = new Date(reading.readingDate);

    if (!vehicleNumber || Number.isNaN(readingDate.getTime())) {
      return;
    }

    const entry = {
      reading,
      readingDate,
      vehicleNumber,
      operator: createOperatorAnalyticsRow(reading, userMap)
    };
    const vehicleReadings = readingsByVehicle.get(vehicleNumber) || [];
    vehicleReadings.push(entry);
    readingsByVehicle.set(vehicleNumber, vehicleReadings);
  });

  return Array.from(readingsByVehicle.values()).flatMap(vehicleReadings => {
    const sessions = [];
    let currentSession = null;

    vehicleReadings
      .sort((left, right) => left.readingDate - right.readingDate)
      .forEach(entry => {
        // A different submitter marks a vehicle handover. Starting a new
        // session prevents us from assigning another user's mileage to the
        // previous user when that vehicle is later reassigned.
        if (!currentSession || currentSession.operator.key !== entry.operator.key) {
          currentSession = {
            key: `${entry.operator.key}:${entry.vehicleNumber}:session:${sessions.length + 1}`,
            operator: entry.operator,
            userId: entry.reading.submittedBy || '',
            vehicleNumber: entry.vehicleNumber,
            firstReadings: new Map(),
            latestReading: null
          };
          sessions.push(currentSession);
        }

        const day = calendarDateKey(entry.readingDate);
        const firstReading = currentSession.firstReadings.get(day);

        if (!firstReading || entry.readingDate < firstReading.readingDate) {
          currentSession.firstReadings.set(day, {
            mileage: entry.reading.extractedMileage,
            readingDate: entry.readingDate
          });
        }

        if (!currentSession.latestReading || entry.readingDate > currentSession.latestReading.readingDate) {
          currentSession.latestReading = {
            mileage: entry.reading.extractedMileage,
            readingDate: entry.readingDate
          };
        }
      });

    return sessions;
  });
};

const createSessionDailyUsage = (firstReadings) => {
  const days = Array.from(firstReadings.keys()).sort();

  return days.flatMap((day, index) => {
    const nextDay = days[index + 1];
    const start = firstReadings.get(day);
    const end = firstReadings.get(nextDay);

    if (!end) {
      return [];
    }

    const distance = end.mileage - start.mileage;
    if (distance < 0) {
      return [];
    }

    return [{
      date: day,
      nextDate: nextDay,
      startMileage: start.mileage,
      endMileage: end.mileage,
      distance: Math.round(distance)
    }];
  });
};

const createDriverVehicleUsage = (readings, userMap) => {
  const usageMap = new Map();
  const today = calendarDateKey(new Date());
  const currentWeek = weekKey(today);
  const currentMonth = today.slice(0, 7);

  createVehicleAssignmentSessions(readings, userMap).forEach(session => {
    const key = `${session.operator.key}:${session.vehicleNumber}`;
    const usage = usageMap.get(key) || {
      key,
      operator: session.operator,
      vehicleNumber: session.vehicleNumber,
      allDailyUsage: [],
      latestReading: null
    };

    usage.allDailyUsage.push(...createSessionDailyUsage(session.firstReadings));
    if (!usage.latestReading || session.latestReading.readingDate > usage.latestReading.readingDate) {
      usage.latestReading = session.latestReading;
    }
    usageMap.set(key, usage);
  });

  return Array.from(usageMap.values())
    .map(usage => {
      const allDailyUsage = usage.allDailyUsage.sort((left, right) => left.date.localeCompare(right.date));
      const latestDailyUsage = allDailyUsage.at(-1) || null;

      return {
        key: usage.key,
        name: usage.operator.name,
        employeeId: usage.operator.employeeId,
        username: usage.operator.username,
        role: usage.operator.role,
        vehicleNumber: usage.vehicleNumber,
        currentMileage: usage.latestReading?.mileage ?? null,
        currentReadingAt: usage.latestReading?.readingDate ?? null,
        latestDailyUsage,
        weekDistance: Math.round(allDailyUsage
          .filter(day => weekKey(day.date) === currentWeek)
          .reduce((total, day) => total + day.distance, 0)),
        monthDistance: Math.round(allDailyUsage
          .filter(day => day.date.startsWith(currentMonth))
          .reduce((total, day) => total + day.distance, 0)),
        allDailyUsage,
        dailyUsage: allDailyUsage.slice(-7).reverse()
      };
    })
    .filter(usage => usage.latestDailyUsage || usage.currentMileage !== null)
    .sort((left, right) => (
      right.monthDistance - left.monthDistance ||
      right.weekDistance - left.weekDistance ||
      left.name.localeCompare(right.name) ||
      left.vehicleNumber.localeCompare(right.vehicleNumber)
    ));
};

const createUserDailyUsage = (readings, userMap) => createVehicleAssignmentSessions(readings, userMap)
  .filter(session => session.operator.key.startsWith('user:') && session.userId)
  .flatMap(session => createSessionDailyUsage(session.firstReadings).map(day => ({
    key: `${session.key}:${day.date}`,
    userId: session.userId,
    name: session.operator.name,
    employeeId: session.operator.employeeId,
    username: session.operator.username,
    role: session.operator.role,
    vehicleNumber: session.vehicleNumber,
    ...day
  })))
  .sort((left, right) => right.date.localeCompare(left.date) || left.name.localeCompare(right.name));
*/

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthInputPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const parseRangeBoundary = (value, endOfDay = false) => {
  if (!value || !dateInputPattern.test(value)) {
    return null;
  }

  const calendarDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value) {
    return null;
  }

  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  const date = new Date(`${value}T${time}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createRangeUsage = (readings, userMap, { includeSingleReadingSessions = false } = {}) => {
  const readingsByVehicle = new Map();

  readings.forEach(reading => {
    const vehicleNumber = reading.vehicleId?.toUpperCase();
    const readingDate = new Date(reading.readingDate);

    if (!vehicleNumber || Number.isNaN(readingDate.getTime())) {
      return;
    }

    const vehicleReadings = readingsByVehicle.get(vehicleNumber) || [];
    vehicleReadings.push({
      reading,
      readingDate,
      vehicleNumber,
      operator: createOperatorAnalyticsRow(reading, userMap)
    });
    readingsByVehicle.set(vehicleNumber, vehicleReadings);
  });

  return Array.from(readingsByVehicle.values()).flatMap(vehicleReadings => {
    const sessions = [];
    let currentSession = null;

    vehicleReadings
      .sort((left, right) => left.readingDate - right.readingDate)
      .forEach(entry => {
        if (!currentSession || currentSession.operator.key !== entry.operator.key) {
          currentSession = {
            key: `${entry.operator.key}:${entry.vehicleNumber}:range:${sessions.length + 1}`,
            operator: entry.operator,
            userId: entry.reading.submittedBy || '',
            vehicleNumber: entry.vehicleNumber,
            firstReading: entry,
            lastReading: entry,
            readingCount: 1,
            readings: [entry]
          };
          sessions.push(currentSession);
          return;
        }

        currentSession.lastReading = entry;
        currentSession.readingCount += 1;
        currentSession.readings.push(entry);
      });

    return sessions;
  })
    .filter(session => includeSingleReadingSessions || session.readingCount >= 2)
    .map(session => {
      const isPending = session.readingCount < 2;

      return {
        key: session.key,
        operatorKey: session.operator.key,
        userId: session.userId,
        name: session.operator.name,
        employeeId: session.operator.employeeId,
        username: session.operator.username,
        role: session.operator.role,
        vehicleNumber: session.vehicleNumber,
        startMileage: session.firstReading.reading.extractedMileage,
        endMileage: isPending ? null : session.lastReading.reading.extractedMileage,
        startReadingAt: session.firstReading.readingDate,
        endReadingAt: isPending ? null : session.lastReading.readingDate,
        daysBetween: isPending
          ? null
          : getCalendarDayDifference(
            session.firstReading.readingDate,
            session.lastReading.readingDate
          ),
        isPending,
        readingCount: session.readingCount,
        readings: session.readings.map((entry, index) => {
          const previousEntry = session.readings[index - 1];

          return {
            id: entry.reading._id,
            readingAt: entry.readingDate,
            mileage: entry.reading.extractedMileage,
            gapFromPrevious: previousEntry
              ? Math.round(entry.reading.extractedMileage - previousEntry.reading.extractedMileage)
              : null,
            ocrConfidence: entry.reading.ocrConfidence,
            isCorrected: entry.reading.isCorrected,
            originalMileage: entry.reading.originalMileage,
            divisionName: entry.reading.divisionName || '',
            reason: entry.reading.reason || '',
            meterType: entry.reading.meterType || null
          };
        }),
        distance: isPending
          ? null
          : Math.round(
            session.lastReading.reading.extractedMileage
            - session.firstReading.reading.extractedMileage
          )
      };
    })
    .filter(usage => usage.isPending || usage.distance >= 0)
    .sort((left, right) => (right.distance ?? -1) - (left.distance ?? -1)
      || left.name.localeCompare(right.name));
};

const createOwnershipUserMileage = (readings, userMap, vehicleMap) => {
  const ownershipGroups = {
    pool: new Map(),
    company: new Map(),
    personal: new Map()
  };

  createRangeUsage(readings, userMap).forEach(usage => {
    const ownership = vehicleMap.get(usage.vehicleNumber)?.ownership;
    const group = ownershipGroups[ownership];

    if (!group) {
      return;
    }

    const current = group.get(usage.operatorKey) || {
      operatorKey: usage.operatorKey,
      name: usage.name,
      employeeId: usage.employeeId,
      username: usage.username,
      role: usage.role,
      distance: 0,
      readingCount: 0,
      vehicles: new Set(),
      vehicleMileage: new Map()
    };

    current.distance += usage.distance;
    current.readingCount += usage.readingCount;
    current.vehicles.add(usage.vehicleNumber);
    const vehicleMileage = current.vehicleMileage.get(usage.vehicleNumber) || {
      vehicleNumber: usage.vehicleNumber,
      distance: 0,
      readingCount: 0
    };
    vehicleMileage.distance += usage.distance;
    vehicleMileage.readingCount += usage.readingCount;
    current.vehicleMileage.set(usage.vehicleNumber, vehicleMileage);
    group.set(usage.operatorKey, current);
  });

  return Object.fromEntries(Object.entries(ownershipGroups).map(([ownership, group]) => [
    ownership,
    Array.from(group.values())
      .map(({ vehicleMileage, ...row }) => ({
        ...row,
        distance: Math.round(row.distance),
        vehicles: Array.from(row.vehicles).sort(),
        vehicleMileage: Array.from(vehicleMileage.values())
          .map(vehicle => ({ ...vehicle, distance: Math.round(vehicle.distance) }))
          .sort((left, right) => left.vehicleNumber.localeCompare(right.vehicleNumber))
      }))
      .sort((left, right) => right.distance - left.distance || left.name.localeCompare(right.name))
  ]));
};

function getColomboDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const getPart = (type) => parts.find(part => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

const getCalendarDayDifference = (startValue, endValue) => {
  const [startYear, startMonth, startDay] = getColomboDateKey(startValue).split('-').map(Number);
  const [endYear, endMonth, endDay] = getColomboDateKey(endValue).split('-').map(Number);
  const startDate = Date.UTC(startYear, startMonth - 1, startDay);
  const endDate = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.max(0, Math.round((endDate - startDate) / 86400000));
};

// All YYYY-MM-DD dates from start to end inclusive, to calculate number of days per month for pool vehicle in Analytics.
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

const getLatestRecordingDaySummary = (readings) => {
  const lastReadingByVehicle = new Map();
  const distanceByDate = new Map();

  readings.forEach(reading => {
    const vehicleNumber = reading.vehicleId?.toUpperCase();
    const readingDate = new Date(reading.readingDate);

    if (!vehicleNumber || Number.isNaN(readingDate.getTime())) {
      return;
    }

    const previousReading = lastReadingByVehicle.get(vehicleNumber);
    if (previousReading) {
      const distance = reading.extractedMileage - previousReading.extractedMileage;

      if (distance >= 0) {
        const date = getColomboDateKey(readingDate);
        distanceByDate.set(date, (distanceByDate.get(date) || 0) + distance);
      }
    }

    lastReadingByVehicle.set(vehicleNumber, reading);
  });

  const latestDate = Array.from(distanceByDate.keys()).sort().at(-1) || '';
  return {
    date: latestDate,
    distance: latestDate ? Math.round(distanceByDate.get(latestDate)) : 0
  };
};

router.get('/analytics', async (req, res) => {
  try {
    const requestedStartDate = req.query.startDate?.trim();
    const requestedEndDate = req.query.endDate?.trim();
    const hasRequestedRange = Boolean(requestedStartDate || requestedEndDate);
    const rangeStart = requestedStartDate ? parseRangeBoundary(requestedStartDate) : null;
    const rangeEnd = requestedEndDate ? parseRangeBoundary(requestedEndDate, true) : null;

    if (hasRequestedRange && (!rangeStart || !rangeEnd)) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    if (hasRequestedRange && rangeStart > rangeEnd) {
      return res.status(400).json({ error: 'End date must be on or after start date' });
    }

    if (hasRequestedRange) {
      const [startYear, startMonth, startDay] = requestedStartDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = requestedEndDate.split('-').map(Number);
      const dateCount = (
        Date.UTC(endYear, endMonth - 1, endDay)
        - Date.UTC(startYear, startMonth - 1, startDay)
      ) / 86400000 + 1;

      if (dateCount > 60) {
        return res.status(400).json({ error: 'Date range cannot exceed 60 days' });
      }
    }

    const requestedMonth = req.query.month?.trim();
    const requestedRangeMode = req.query.rangeMode?.trim().toLowerCase();
    const requestedCategory = req.query.category?.trim().toLowerCase();
    const requestedVehicleNumber = req.query.vehicleNumber?.trim().toUpperCase();

    if (requestedMonth && !monthInputPattern.test(requestedMonth)) {
      return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
    }

    if (requestedRangeMode && !['monthly', 'custom'].includes(requestedRangeMode)) {
      return res.status(400).json({ error: 'Range mode must be monthly or custom' });
    }

    if (requestedRangeMode === 'monthly' && (!hasRequestedRange || !requestedMonth)) {
      return res.status(400).json({ error: 'Monthly range reports require a month, start date, and end date' });
    }

    const [readings, vehicles, users, companyDriverCount] = await Promise.all([
      Reading.find({ isRental: { $ne: true } })
        .sort({ vehicleId: 1, readingDate: 1 })
        .select('vehicleId extractedMileage ocrConfidence readingDate isCorrected submittedBy driverName meterType'),
      Vehicle.find().sort({ vehicleNumber: 1 }).select('-__v'),
      User.find().select('name employeeId username role isActive'),
      CompanyDriver.countDocuments()
    ]);

    const vehicleCategoryByNumber = new Map(
      vehicles.map(vehicle => [vehicle.vehicleNumber, vehicle.ownership || 'unknown'])
    );
    const selectedMonth = requestedMonth || getColomboDateKey(new Date()).slice(0, 7);
    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-').map(Number);
    const selectedMonthStart = parseRangeBoundary(`${selectedMonth}-01`);
    const nextMonthStart = parseRangeBoundary(new Date(Date.UTC(selectedYear, selectedMonthNumber, 1)).toISOString().slice(0, 10));
    const monthAfterNextStart = parseRangeBoundary(new Date(Date.UTC(selectedYear, selectedMonthNumber + 1, 1)).toISOString().slice(0, 10));

    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    const vehicleMap = new Map();

    vehicles.forEach(vehicle => {
      vehicleMap.set(vehicle.vehicleNumber, createVehicleAnalyticsRow(vehicle));
    });

    const operatorMap = new Map();
    const lastReadingByVehicle = new Map();
    const openTripByVehicle = new Map();
    let totalDistance = 0;
    let monthDistance = 0;
    let correctionCount = 0;
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

      const isInSelectedMonth = readingDate >= selectedMonthStart && readingDate < nextMonthStart;

      // Pool vehicles: monthly mileage is the sum of (IN meter - OUT meter) for every trip, credited to the month in which the trip's IN reading was recorded.
      const isPoolVehicle = vehicleStats.ownership === 'pool';
      if (isPoolVehicle) {
        if (reading.meterType === 'out') {
          openTripByVehicle.set(vehicleNumber, reading);
        } else if (reading.meterType === 'in' && openTripByVehicle.has(vehicleNumber)) {
          const outReading = openTripByVehicle.get(vehicleNumber);
          const tripDistance = reading.extractedMileage - outReading.extractedMileage;
          openTripByVehicle.delete(vehicleNumber);

          if (tripDistance >= 0 && isInSelectedMonth) {
            monthDistance += tripDistance;
            vehicleStats.monthDistance += tripDistance;
          }

          // Days used: every calendar date from OUT to IN (inclusive) that falls in the selected month.
          // A same-day trip counts only if the vehicle actually moved.
          // If many trips fall on the same day, that day is counted only once.
          const outDateKey = getColomboDateKey(new Date(outReading.readingDate));
          const inDateKey = getColomboDateKey(readingDate);

          if (outDateKey === inDateKey) {
            if (tripDistance !== 0 && inDateKey.startsWith(selectedMonth)) {
              vehicleStats.monthUsageDates.add(inDateKey);
            }
          } else {
            getDateKeysBetween(outDateKey, inDateKey)
              .filter(dateKey => dateKey.startsWith(selectedMonth))
              .forEach(dateKey => vehicleStats.monthUsageDates.add(dateKey));
          }
        }
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

          if (isInSelectedMonth) {
            if (!isPoolVehicle) {
              monthDistance += distance;
              vehicleStats.monthDistance += distance;
            }

            if (distance > 0 && !isPoolVehicle) {
              vehicleStats.monthUsageDates.add(getColomboDateKey(readingDate));
            }
          }
        }
      }

      lastReadingByVehicle.set(vehicleNumber, reading);
    });

    const vehicleUsage = Array.from(vehicleMap.values())
      .map(({ monthUsageDates, ...vehicle }) => ({
        ...vehicle,
        totalDistance: Math.round(vehicle.totalDistance),
        monthDistance: Math.round(vehicle.monthDistance),
        monthDaysUsed: monthUsageDates.size
      }))
      .sort((a, b) => b.totalDistance - a.totalDistance || a.vehicleNumber.localeCompare(b.vehicleNumber));

    const operatorUsage = Array.from(operatorMap.values())
      .map(operator => ({
        ...operator,
        totalDistance: Math.round(operator.totalDistance),
        vehicles: operator.vehicles.sort()
      }))
      .sort((a, b) => b.totalDistance - a.totalDistance || b.readingCount - a.readingCount);
    const matchesRangeVehicleFilters = reading => {
      const vehicleNumber = reading.vehicleId?.toUpperCase();
      const category = vehicleCategoryByNumber.get(vehicleNumber) || 'unknown';

      return (!requestedVehicleNumber || vehicleNumber === requestedVehicleNumber)
        && (!requestedCategory || category.toLowerCase() === requestedCategory);
    };
    const selectedRangeReadings = hasRequestedRange
      ? readings.filter(reading => {
        const readingDate = new Date(reading.readingDate);
        return readingDate >= rangeStart
          && readingDate <= rangeEnd
          && matchesRangeVehicleFilters(reading);
      })
      : [];
    let rangeReadings = selectedRangeReadings;

    if (requestedRangeMode === 'monthly') {
      const selectedOperatorVehicleKeys = new Set(selectedRangeReadings.map(reading => (
        `${reading.vehicleId?.toUpperCase()}:${getOperatorKey(reading)}`
      )));
      const firstFollowingMonthReadingByKey = new Map();

      readings.forEach(reading => {
        const readingDate = new Date(reading.readingDate);
        if (readingDate < nextMonthStart
          || readingDate >= monthAfterNextStart
          || !matchesRangeVehicleFilters(reading)) {
          return;
        }

        const key = `${reading.vehicleId?.toUpperCase()}:${getOperatorKey(reading)}`;
        if (selectedOperatorVehicleKeys.has(key) && !firstFollowingMonthReadingByKey.has(key)) {
          firstFollowingMonthReadingByKey.set(key, reading);
        }
      });

      rangeReadings = [
        ...selectedRangeReadings,
        ...firstFollowingMonthReadingByKey.values()
      ];
    }
    const rangeUsage = createRangeUsage(rangeReadings, userMap, {
      includeSingleReadingSessions: requestedRangeMode === 'monthly'
    });
    const rangeDistance = rangeUsage.reduce((total, usage) => total + usage.distance, 0);
    const monthReadings = readings.filter(reading => {
      const readingDate = new Date(reading.readingDate);
      return readingDate >= selectedMonthStart && readingDate < nextMonthStart;
    });
    const ownershipUserMileage = createOwnershipUserMileage(monthReadings, userMap, vehicleMap);
    const ownershipVehicleNumbers = { pool: [], company: [], personal: [] };
    vehicles.forEach(vehicle => {
      if (ownershipVehicleNumbers[vehicle.ownership]) {
        ownershipVehicleNumbers[vehicle.ownership].push(vehicle.vehicleNumber);
      }
    });
    Object.values(ownershipVehicleNumbers).forEach(vehicleNumbers => vehicleNumbers.sort());
    const latestRecordingDay = getLatestRecordingDaySummary(readings);

    const activeVehicles = vehicles.filter(vehicle => vehicle.status === 'active').length;
    const unassignedVehicles = vehicles.filter(vehicle => {
      const hasPersonalUser = Boolean(vehicle.allocatedUser);
      const hasCompanyDrivers = Array.isArray(vehicle.allocatedDrivers) && vehicle.allocatedDrivers.length > 0;
      return !hasPersonalUser && !hasCompanyDrivers;
    }).length;

    res.json({
      generatedAt: new Date(),
      dateRange: {
        startDate: requestedStartDate || null,
        endDate: requestedEndDate || null
      },
      selectedMonth,
      kpis: {
        totalVehicles: vehicles.length,
        activeVehicles,
        totalUsers: users.filter(user => user.role !== 'driver').length + companyDriverCount,
        totalDrivers: users.filter(user => user.role === 'driver').length,
        totalReadings: readings.length,
        totalDistance: Math.round(totalDistance),
        monthDistance: Math.round(monthDistance),
        rangeDistance: Math.round(rangeDistance),
        latestDailyKilometers: latestRecordingDay.distance,
        latestUsageDate: latestRecordingDay.date,
        correctionRate: readings.length ? correctionCount / readings.length : 0,
        unassignedVehicles,
        suspiciousReadings
      },
      vehicleUsage,
      operatorUsage,
      ownershipUserMileage,
      ownershipVehicleNumbers,
      rangeUsage
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
