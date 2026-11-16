const Vehicle = require('../models/Vehicle');
const Reading = require('../models/Reading');
require('../models/User');
const { isMailConfigured, getMissingMailConfiguration, sendMail } = require('./mailer');

// At 7:00 pm on the 2nd of each month, email every user with a personal or company vehicle that has no reading yet this month.
const CHECK_DAY = 2;
const CHECK_HOUR = 19;
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

// Sri Lanka is UTC+05:30 all year
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DEFAULT_APP_URL = 'https://vehicle-mileage-capturing-system.vercel.app';

const getColomboYearMonth = (date) => {
  const shifted = new Date(date.getTime() + COLOMBO_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
};

// Turn date and hour in Sri Lankan time to a Date object in UTC. 
const colomboTime = (year, month, day, hour = 0) => new Date(Date.UTC(year, month - 1, day, hour) - COLOMBO_OFFSET_MS);

const getNextCheckTime = (now) => {
  const { year, month } = getColomboYearMonth(now);
  const thisMonth = colomboTime(year, month, CHECK_DAY, CHECK_HOUR);
  return now < thisMonth ? thisMonth : colomboTime(year, month + 1, CHECK_DAY, CHECK_HOUR);
};

const getAppUrl = () => (
  process.env.APP_URL
  || (process.env.CLIENT_URLS || process.env.CLIENT_URL || '').split(',')[0].trim()
  || DEFAULT_APP_URL
);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const buildReminderEmail = ({ name, vehicleNumber, monthLabel }) => {
  const appUrl = getAppUrl();

  return {
    subject: `Reminder: mileage reading for ${vehicleNumber}`,
    text: [
      `Hi ${name},`,
      '',
      `This is a reminder that the ${monthLabel} mileage reading for your vehicle ${vehicleNumber} has not been recorded yet.`,
      'Please log in and enter the current mileage within one day.',
      '',
      appUrl,
      '',
      'Thank you.'
    ].join('\n'),
    html: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>This is a reminder that the ${escapeHtml(monthLabel)} mileage reading for your vehicle
        <strong>${escapeHtml(vehicleNumber)}</strong> has not been recorded yet.</p>
      <p>Please log in and enter the current mileage <b>within one day.</b></p>
      <p><a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>
      <p>Thank you.</p>
    `
  };
};

// Nodemailer error codes meaning the mail server could not be reached. These are retried two hours later.
const SERVER_UNREACHABLE_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET']);
const RETRY_DELAY_MS = 2 * 60 * 60 * 1000;


// Finds who hasn't recorded a reading this month, emails them, and returns a summary
const runMonthlyMileageReminder = async ({ now = new Date(), dryRun = false, onlyVehicles = null } = {}) => {
  const { year, month } = getColomboYearMonth(now);
  const monthStart = colomboTime(year, month, 1); // Midnight on the first of month.
  const monthLabel = monthStart.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', month: 'long', year: 'numeric' }); //Month name for email.

  // Find all active personal or company vehicles with an allocated user, and check if they have a reading this month.
  const vehicles = await Vehicle.find({
    ownership: { $in: ['personal', 'company'] },
    status: 'active',
    allocatedUser: { $ne: null },
    ...(onlyVehicles ? { vehicleNumber: { $in: onlyVehicles } } : {})
  })
    .select('vehicleNumber allocatedUser')
    .populate('allocatedUser', 'name email isActive');

  const summary = { dryRun, month: monthLabel, sent: [], noEmail: [], failed: [] };

  for (const { vehicleNumber, allocatedUser: user } of vehicles) {
    // Skip inactive users.
    if (!user || !user.isActive) {
      continue;
    }

    // Skip vehicles that already have a reading this month.
    const hasReading = await Reading.exists({
      vehicleId: vehicleNumber,
      readingDate: { $gte: monthStart, $lte: now }
    });

    if (hasReading) {
      continue;
    }

    const entry = { vehicleNumber, user: user.name, email: user.email || '' };

    // Skip users with no email or a driver-local email address.
    if (!user.email || user.email.endsWith('@driver.local')) {
      summary.noEmail.push(entry);
      continue;
    }

    if (dryRun) {
      summary.sent.push(entry);
      continue;
    }

    // Actually send the email and record success or failure.
    try {
      await sendMail({ to: user.email, ...buildReminderEmail({ name: user.name, vehicleNumber, monthLabel }) });
      summary.sent.push(entry);
    } catch (error) {
      summary.failed.push({ ...entry, error: error.message, serverUnreachable: SERVER_UNREACHABLE_CODES.has(error.code) });
    }
  }

  return summary;
};

const runAndLog = async ({ isRetry = false, onlyVehicles = null } = {}) => {
  try {
    const summary = await runMonthlyMileageReminder({ onlyVehicles });
    console.log(
      `Mileage reminders${isRetry ? ' retry' : ''} (${summary.month}): sent ${summary.sent.length}, `
      + `failed ${summary.failed.length}, no email ${summary.noEmail.length}`
    );
    summary.failed.forEach(item => console.error(`Mileage reminder failed for ${item.vehicleNumber}: ${item.error}`));

    // If the mail server was unreachable, try those emails once more two hours later. The retry re-checks readings, so anyone who recorded in between is skipped.
    const retryVehicles = summary.failed.filter(item => item.serverUnreachable).map(item => item.vehicleNumber);

    if (!isRetry && retryVehicles.length > 0) {
      console.log(`Mail server unreachable for ${retryVehicles.length} reminder(s); retrying in 2 hours`);
      setTimeout(() => runAndLog({ isRetry: true, onlyVehicles: retryVehicles }), RETRY_DELAY_MS).unref();
    }
  } catch (error) {
    console.error('Mileage reminder error:', error);
  }
};

// Node timers can't wait a whole month, so wake at least daily and re-plan.
const scheduleNextCheck = () => {
  const nextCheck = getNextCheckTime(new Date());

  setTimeout(async () => {
    if (Date.now() >= nextCheck.getTime()) {
      await runAndLog();
    }
    scheduleNextCheck();
  }, Math.max(Math.min(nextCheck - Date.now(), MAX_TIMER_MS), 0)).unref();
};

const startMonthlyMileageReminder = () => {

  if (!isMailConfigured()) {
    console.warn(`Missing mail configuration: ${getMissingMailConfiguration().join(', ')}`);
    return;
  }

  scheduleNextCheck();
  console.log(`Next mileage reminder check: ${getNextCheckTime(new Date()).toISOString()}`);
};

module.exports = {
  runMonthlyMileageReminder,
  startMonthlyMileageReminder,
  getNextCheckTime
};
