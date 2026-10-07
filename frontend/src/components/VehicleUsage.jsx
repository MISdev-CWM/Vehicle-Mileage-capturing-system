import { useEffect, useState } from 'react';
import api from '../api';

const emptyFilters = {
  vehicleId: '',
  userKey: '',
  startDate: '',
  endDate: ''
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatMileage = (value) => (
  Number.isFinite(Number(value)) ? `${Number(value).toLocaleString()} km` : '-'
);

const VehicleUsage = ({ onBack }) => {
  const [vehicles, setVehicles] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [readings, setReadings] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadFilterOptions = async () => {
      try {
        const [vehiclesRes, usersRes, companyDriversRes] = await Promise.all([
          api.get('/vehicles'),
          api.get('/users', { params: { active: true } }),
          api.get('/company-drivers')
        ]);

        if (!isActive) return;

        setVehicles(vehiclesRes.data);

        const accountUsers = usersRes.data
          .filter(user => user.role !== 'admin')
          .map(user => ({
            value: `user:${user._id}`,
            label: `${user.employeeId ? `${user.employeeId} - ` : ''}${user.name}`,
            isDriver: user.role === 'driver'
          }));
        const companyDrivers = companyDriversRes.data.map(driver => ({
          value: `driver:${driver.employeeName}`,
          label: `${driver.employeeId ? `${driver.employeeId} - ` : ''}${driver.employeeName}`,
          isDriver: true
        }));

        setUserOptions([...accountUsers, ...companyDrivers]
          .sort((left, right) => left.label.localeCompare(right.label)));
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load filter options.');
        }
      } finally {
        if (isActive) {
          setOptionsLoading(false);
        }
      }
    };

    loadFilterOptions();
    return () => { isActive = false; };
  }, []);

  const selectedVehicle = vehicles.find(vehicle => vehicle.vehicleNumber === filters.vehicleId);
  const visibleUserOptions = (() => {
    if (!selectedVehicle) {
      return userOptions;
    }

    if (selectedVehicle.ownership === 'company') {
      return userOptions.filter(option => option.isDriver);
    }

    const allocatedUser = selectedVehicle.allocatedUser;
    if (!allocatedUser?._id) {
      return [];
    }

    const allocatedUserKey = `user:${allocatedUser._id}`;
    const existingOption = userOptions.find(option => option.value === allocatedUserKey);
    return [existingOption || {
      value: allocatedUserKey,
      label: `${allocatedUser.employeeId ? `${allocatedUser.employeeId} - ` : ''}${allocatedUser.name || 'Allocated user'}`,
      isDriver: false
    }];
  })();
  const userPlaceholder = selectedVehicle?.ownership === 'company'
    ? 'All drivers'
    : selectedVehicle?.ownership === 'personal' && visibleUserOptions.length === 0
      ? 'No user assigned'
      : 'All users';

  const fetchUsage = async (nextFilters, nextPage = 1) => {
    setSearching(true);
    setError('');

    try {
      const params = { page: nextPage };
      if (nextFilters.vehicleId) params.vehicleId = nextFilters.vehicleId;
      if (nextFilters.userKey) params.userKey = nextFilters.userKey;
      if (nextFilters.startDate) params.startDate = nextFilters.startDate;
      if (nextFilters.endDate) params.endDate = nextFilters.endDate;

      const response = await api.get('/readings', { params });
      setReadings(response.data.readings || []);
      setTotal(response.data.total || 0);
      setPage(response.data.page || 1);
      setPages(response.data.pages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load vehicle usage.');
      setReadings([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      setError('The end date must be the same as or after the start date.');
      return;
    }

    setAppliedFilters(filters);
    setSearched(true);
    await fetchUsage(filters, 1);
  };

  const handleClear = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setReadings([]);
    setTotal(0);
    setPage(1);
    setPages(1);
    setSearched(false);
    setError('');
  };

  const changePage = async (nextPage) => {
    await fetchUsage(appliedFilters, nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vehicle Management</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">Vehicle Usage</h2>
          <p className="text-sm text-slate-500 mt-1">Search odometer readings by vehicle, user, and date range.</p>
        </div>
        <button type="button" onClick={onBack} className="btn-secondary self-start sm:self-auto">
          Back to Vehicles
        </button>
      </div>

      <form onSubmit={handleSearch} className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label htmlFor="usageVehicle" className="block text-sm font-medium text-slate-700 mb-1.5">Vehicle name</label>
            <select
              id="usageVehicle"
              value={filters.vehicleId}
              onChange={(event) => setFilters(previous => ({
                ...previous,
                vehicleId: event.target.value,
                userKey: ''
              }))}
              className="input"
              disabled={optionsLoading}
            >
              <option value="">All vehicles</option>
              {vehicles.map(vehicle => (
                <option key={vehicle._id} value={vehicle.vehicleNumber}>
                  {vehicle.vehicleNumber} - {[vehicle.make, vehicle.name, vehicle.model].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="usageUser" className="block text-sm font-medium text-slate-700 mb-1.5">User's name</label>
            <select
              id="usageUser"
              value={filters.userKey}
              onChange={(event) => setFilters(previous => ({ ...previous, userKey: event.target.value }))}
              className="input"
              disabled={optionsLoading || (selectedVehicle?.ownership === 'personal' && visibleUserOptions.length === 0)}
            >
              <option value="">{userPlaceholder}</option>
              {visibleUserOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="usageStartDate" className="block text-sm font-medium text-slate-700 mb-1.5">Start date</label>
            <input
              id="usageStartDate"
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters(previous => ({ ...previous, startDate: event.target.value }))}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="usageEndDate" className="block text-sm font-medium text-slate-700 mb-1.5">End date</label>
            <input
              id="usageEndDate"
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters(previous => ({ ...previous, endDate: event.target.value }))}
              className="input"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 mt-5">
          <button type="button" onClick={handleClear} className="btn-secondary">Clear</button>
          <button type="submit" disabled={optionsLoading || searching} className="btn-primary min-w-28">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {searched && !searching && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Meter Readings</h3>
              <p className="text-xs text-slate-500 mt-1">{total} reading{total === 1 ? '' : 's'} found</p>
            </div>
          </div>

          {readings.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No meter readings match the selected filters.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Date &amp; Time</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Vehicle</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">User / Driver</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Meter Reading</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readings.map(reading => (
                      <tr key={reading._id} className="hover:bg-slate-50">
                        <td className="py-3 text-sm text-slate-700 whitespace-nowrap">{formatDateTime(reading.readingDate)}</td>
                        <td className="py-3 text-sm font-mono font-semibold text-slate-900">{reading.vehicleId}</td>
                        <td className="py-3 text-sm text-slate-700">{reading.driverName || reading.submittedByName || 'Unknown user'}</td>
                        <td className="py-3 text-sm text-right font-semibold text-slate-900">{formatMileage(reading.extractedMileage)}</td>
                        <td className="py-3 text-sm text-slate-600">{reading.isCorrected ? 'Corrected' : 'OCR verified'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1 || searching} className="btn-secondary">
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">Page {page} of {pages}</span>
                  <button type="button" onClick={() => changePage(page + 1)} disabled={page >= pages || searching} className="btn-secondary">
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VehicleUsage;
