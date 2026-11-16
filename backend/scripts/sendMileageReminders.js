// For testing
// Runs the monthly mileage reminder check once (right now) and prints the result.



/* HOW TO USE THIS SCRIPT (run in the backend folder)

Get a list of users who would get reminder emails/ haven't uploaded a reading since the beginning of the month until the current time:
npm run reminders:mileage -- --dry-run

Get a list of users who haven't uploaded a reading since the beginning of the month until 7pm on the second day of the month:
npm run reminders:mileage -- --dry-run --date=2026-05-02

Get a list of users who haven't uploaded a reading since the beginning of the month until 9:30pm on the second day of the month:
npm run reminders:mileage -- --dry-run --date=2026-05-02T21:30

Actually send the reminders to users who haven't uploaded a reading since the beginning of the month until the current time:
npm run reminders:mileage
*/

require('dotenv').config(); // For MongoDB URI and SMTP settings
const mongoose = require('mongoose');
const { runMonthlyMileageReminder } = require('../utils/monthlyMileageReminder');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run'); // TRUE id --dry-run was given
const dateArg = args.find(arg => arg.startsWith('--date='))?.split('=')[1];

const main = async () => {
  let now = new Date();

  if (dateArg) {
    // Check format
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dateArg)) {
      throw new Error('--date must look like YYYY-MM-DD or YYYY-MM-DDTHH:mm');
    }
    // Splits date from time. Uses 7:00 pm if no time is given.
    const [datePart, timePart = '19:00'] = dateArg.split('T');
    now = new Date(`${datePart}T${timePart}:00+05:30`);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle-mileage');
  const summary = await runMonthlyMileageReminder({ now, dryRun });
  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
