import { useCallback, useEffect, useState } from 'react';
import api from '../api';

// Pair each OUT reading with the IN reading that follows it into a single trip.
// Trips are returned newest first.
const buildTrips = (readings) => {
  const trips = [];
  let openTrip = null;

  [...readings]
    .sort((a, b) => new Date(a.readingDate) - new Date(b.readingDate))
    .forEach((reading) => {
      if (reading.meterType === 'out') {
        openTrip = { id: reading._id, out: reading, in: null };
        trips.push(openTrip);
      } else if (reading.meterType === 'in' && openTrip) {
        openTrip.in = reading;
        openTrip = null;
      }
    });

  return trips.reverse();
};

// Month keys are 'YYYY-MM', the value format of <input type="month">.
const toMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getCurrentMonth = () => toMonthKey(new Date());

// 'YYYY-MM' -> 'November 2026'
const formatMonthLabel = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// A trip belongs to the month in which the vehicle was returned (its IN reading).
// Trips that haven't been returned yet have no IN date and are left out.
const isInMonth = (trip, monthKey) => (
  Boolean(trip.in) && toMonthKey(new Date(trip.in.readingDate)) === monthKey
);

const columns = [
  'Driver Name',
  'Division',
  'Reason',
  'Date Taken',
  'Date Returned',
  'Meter Reading when Taken',
  'Meter Reading when Returned',
  'Total km'
];

const DateTimeCell = ({ value }) => (
  <>
    <p className="text-sm font-medium text-slate-900 whitespace-nowrap">
      {new Date(value).toLocaleDateString()}
    </p>
    <p className="text-xs text-slate-500 whitespace-nowrap">
      {new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </>
);

const MeterCell = ({ value }) => (
  <span className="whitespace-nowrap">
    <span className="text-sm font-mono font-semibold text-slate-900">{value.toLocaleString()}</span>
    <span className="text-xs text-slate-400 ml-1">km</span>
  </span>
);

const Empty = () => <span className="text-sm text-slate-400">—</span>;

const PoolVehicleTable = ({ vehicleNumber, trips, monthLabel }) => (
  <div className="card overflow-hidden">
    <div className="mb-5">
      <h3 className="text-lg font-semibold text-slate-900">{vehicleNumber}</h3>
      <p className="text-xs text-slate-500 mt-1">{trips.length} trips for the month of {monthLabel}</p>
    </div>

    {trips.length === 0 ? (
      <div className="text-center py-12 text-slate-500">No trips recorded for the month of {monthLabel}</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-slate-200">
              {columns.map(label => (
                <th
                  key={label}
                  className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 px-2 first:pl-0 last:pr-0 whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trips.map(trip => {
              const returned = trip.in;

              return (
                <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-2 text-sm font-medium text-slate-900 whitespace-nowrap">{trip.out.driverName || <Empty />}</td>
                  <td className="py-3 px-2 text-sm text-slate-600 whitespace-nowrap">{trip.out.divisionName || returned?.divisionName || <Empty />}</td>
                  <td className="py-3 px-2 text-sm text-slate-600 min-w-48 max-w-xs whitespace-normal break-words">{trip.out.reason || returned?.reason || <Empty />}</td>
                  <td className="py-3 px-2"><DateTimeCell value={trip.out.readingDate} /></td>
                  <td className="py-3 px-2">{returned ? <DateTimeCell value={returned.readingDate} /> : <Empty />}</td>
                  <td className="py-3 px-2"><MeterCell value={trip.out.extractedMileage} /></td>
                  <td className="py-3 px-2">{returned ? <MeterCell value={returned.extractedMileage} /> : <Empty />}</td>
                  <td className="py-3 pl-2">
                    {returned
                      ? <MeterCell value={returned.extractedMileage - trip.out.extractedMileage} />
                      : <Empty />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const PoolVehicleUsage = () => {
  const [vehicles, setVehicles] = useState([]); // [{ vehicleNumber, trips }] — trips across all months
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const monthLabel = formatMonthLabel(selectedMonth);

  const loadPoolVehicles = useCallback(async () => {
    const vehiclesRes = await api.get('/vehicles');
    const poolVehicles = vehiclesRes.data
      .filter(vehicle => vehicle.ownership === 'pool')
      .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber));

    const readingResponses = await Promise.all(
      poolVehicles.map(vehicle => api.get(`/readings/${vehicle.vehicleNumber}`))
    );

    return poolVehicles.map((vehicle, index) => ({
      vehicleNumber: vehicle.vehicleNumber,
      trips: buildTrips(readingResponses[index].data)
    }));
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError('');

    try {
      setVehicles(await loadPoolVehicles());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load pool vehicle usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    loadPoolVehicles()
      .then(data => {
        if (isActive) setVehicles(data);
      })
      .catch(err => {
        if (isActive) setError(err.response?.data?.error || 'Failed to load pool vehicle usage');
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [loadPoolVehicles]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pool Vehicle Usage</h2>
          <p className="text-sm text-slate-500 mt-1">Browse and filter all pool vehicle usage records for a certain month.</p>
        </div>
        <div className="flex items-end gap-3">
          <button onClick={refresh} className="btn-secondary">
            Refresh
          </button>
          <label className="text-sm font-medium text-slate-600">
            Select month
            <input
              type="month"
              value={selectedMonth}
              max={getCurrentMonth()}
              onChange={(event) => {
                
                if (event.target.value) setSelectedMonth(event.target.value);
              }}
              className="input mt-1"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card space-y-3 animate-pulse">
          {[1, 2, 3].map(item => <div key={item} className="h-12 bg-slate-100 rounded-lg" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No pool vehicles found</div>
      ) : (
        vehicles.map(vehicle => (
          <PoolVehicleTable
            key={vehicle.vehicleNumber}
            vehicleNumber={vehicle.vehicleNumber}
            trips={vehicle.trips.filter(trip => isInMonth(trip, selectedMonth))}
            monthLabel={monthLabel}
          />
        ))
      )}
    </div>
  );
};

export default PoolVehicleUsage;
