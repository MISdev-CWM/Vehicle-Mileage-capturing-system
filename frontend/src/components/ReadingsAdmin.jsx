import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatBadge = ({ label, value, icon, accent = 'text-slate-900' }) => (
  <div className="card flex items-center gap-4 p-4">
    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
      {icon}
    </div>
    <div className="min-w-0">
      <p className={`text-xl font-bold ${accent} leading-tight`}>{value}</p>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5 truncate">{label}</p>
    </div>
  </div>
);

const CorrectedBadge = ({ value }) =>
  value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
      Corrected
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
      Auto
    </span>
  );

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportToCSV(readings) {
  const headers = [
    'Date',
    'Vehicle',
    'User',
    'Mileage (km)',
    'Corrected',
    'Original Mileage',
    'Submitted By',
  ];
  const rows = readings.map(r => [
    new Date(r.readingDate).toLocaleString(),
    r.vehicleId,
    r.driverName ? `${r.driverName} (Driver)` : r.submittedByName || r.submittedBy,
    r.extractedMileage,
    r.isCorrected ? 'Yes' : 'No',
    r.originalMileage ?? '',
    r.submittedByName || 'Unknown User',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `readings_export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ReadingsAdmin = () => {
  const [readings, setReadings] = useState([]);
  const [stats, setStats] = useState({
    todayTotalReadings: 0,
    allVehicleCount: 0,
    allUserCount: 0,
    todayCorrectedRecords: 0
  });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [editingReading, setEditingReading] = useState(null);
  const [editMileage, setEditMileage] = useState('');
  const [deletingReading, setDeletingReading] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const debounceRef = useRef(null);

  const buildParams = useCallback(
    (overridePage) => {
      const params = { page: overridePage ?? page };
      if (vehicleFilter) params.vehicleId = vehicleFilter;
      if (driverFilter) params.driverName = driverFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return params;
    },
    [page, vehicleFilter, driverFilter, startDate, endDate]
  );

  const fetchReadings = useCallback(async (overridePage) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/readings', { params: buildParams(overridePage) });
      setReadings(res.data.readings);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(res.data.page);
      setStats(res.data.stats || {
        todayTotalReadings: 0,
        allVehicleCount: 0,
        allUserCount: 0,
        todayCorrectedRecords: 0
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load readings.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Debounced re-fetch when filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchReadings(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleFilter, driverFilter, startDate, endDate]);

  const handlePageChange = (newPage) => {
    fetchReadings(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearFilters = () => {
    setVehicleFilter('');
    setDriverFilter('');
    setStartDate('');
    setEndDate('');
  };

  const openEditModal = (reading) => {
    setEditingReading(reading);
    setEditMileage(String(reading.extractedMileage ?? ''));
    setError('');
  };

  const closeEditModal = () => {
    setEditingReading(null);
    setEditMileage('');
  };

  const handleUpdateReading = async (event) => {
    event.preventDefault();
    setActionLoading(true);
    setError('');

    try {
      await api.put(`/readings/${editingReading._id}`, { mileage: Number(editMileage) });
      closeEditModal();
      await fetchReadings(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update reading');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteReading = async () => {
    setActionLoading(true);
    setError('');

    try {
      await api.delete(`/readings/${deletingReading._id}`);
      setDeletingReading(null);
      await fetchReadings(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete reading');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      let allReadings = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        const params = buildParams(currentPage);
        const res = await api.get('/readings', { params });
        allReadings = [...allReadings, ...res.data.readings];
        totalPages = res.data.pages;
        currentPage++;
      } while (currentPage <= totalPages);
      exportToCSV(allReadings);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const startEntry = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endEntry = Math.min(page * PAGE_SIZE, total);

  const hasActiveFilter = vehicleFilter || driverFilter || startDate || endDate;

  // Build pagination page numbers (max 7 buttons)
  const paginationPages = (() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
    if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
    return [1, '…', page - 1, page, page + 1, '…', pages];
  })();

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">Readings</h2>
          <p className="text-sm text-slate-500 mt-1">
            Browse and filter all odometer readings across the fleet.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fetchReadings(page)}
            className="btn-secondary"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582M20 20v-5h-.581M5.635 15A8 8 0 1118.364 8.636"
              />
            </svg>
            <span className="ml-1.5">Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export filtered readings to CSV"
          >
            {exporting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="ml-1.5">Exporting…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="ml-1.5">Export CSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBadge
          label="Today Total Readings"
          value={stats.todayTotalReadings.toLocaleString()}
          accent="text-brand-700"
          icon={
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
        />
        <StatBadge
          label="All Vehicles"
          value={stats.allVehicleCount.toLocaleString()}
          accent="text-emerald-700"
          icon={
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1"
              />
            </svg>
          }
        />
        <StatBadge
          label="All Users"
          value={stats.allUserCount.toLocaleString()}
          accent="text-amber-700"
          icon={
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          }
        />
        <StatBadge
          label="Today Corrected Records"
          value={stats.todayCorrectedRecords.toLocaleString()}
          accent="text-indigo-700"
          icon={
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>

      {/* ── Filter Bar ── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707l-6.414 6.414A1 1 0 0014 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586a1 1 0 00-.293-.707L1.293 6.707A1 1 0 011 6V4z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-slate-700">Filters</h3>
          {hasActiveFilter && (
            <button
              onClick={handleClearFilters}
              className="ml-auto text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="readingsVehicleFilter"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              Vehicle ID
            </label>
            <input
              id="readingsVehicleFilter"
              type="text"
              value={vehicleFilter}
              onChange={e => setVehicleFilter(e.target.value)}
              placeholder="e.g. ABC-123"
              className="input text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="readingsDriverFilter"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              Driver Name
            </label>
            <input
              id="readingsDriverFilter"
              type="text"
              value={driverFilter}
              onChange={e => setDriverFilter(e.target.value)}
              placeholder="Search driver…"
              className="input text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="readingsStartDate"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              From Date
            </label>
            <input
              id="readingsStartDate"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="readingsEndDate"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              To Date
            </label>
            <input
              id="readingsEndDate"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="input text-sm"
            />
          </div>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="card overflow-hidden p-0">
        {/* Table meta bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">
            {loading
              ? 'Loading…'
              : total === 0
              ? 'No readings found'
              : `Showing ${startEntry}–${endEntry} of ${total.toLocaleString()} readings`}
          </h3>
          {pages > 1 && !loading && (
            <span className="text-xs text-slate-400 font-medium">
              Page {page} of {pages}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 py-10 text-center">
            <svg className="w-10 h-10 text-red-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
            <button onClick={() => fetchReadings(page)} className="btn-secondary text-sm">
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="divide-y divide-slate-100 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-slate-100 rounded w-28" />
                  <div className="h-2.5 bg-slate-100 rounded w-16" />
                </div>
                <div className="h-6 bg-slate-100 rounded w-20" />
                <div className="h-3.5 bg-slate-100 rounded w-24" />
                <div className="h-3.5 bg-slate-100 rounded w-20 ml-auto" />
                <div className="h-5 bg-slate-100 rounded-full w-12" />
                <div className="h-5 bg-slate-100 rounded-full w-16" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && readings.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-14 h-14 text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-slate-500 font-semibold">No readings match your filters</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting or clearing your search criteria.</p>
            {hasActiveFilter && (
              <button onClick={handleClearFilters} className="btn-secondary mt-4 text-sm">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Data table */}
        {!loading && !error && readings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3 whitespace-nowrap">
                    Date &amp; Time
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Vehicle
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    User
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Mileage
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((reading, idx) => (
                  <tr
                    key={reading._id}
                    className={`hover:bg-indigo-50/20 transition-colors duration-100 ${
                      idx % 2 !== 0 ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    {/* Date */}
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span className="block text-sm font-semibold text-slate-900">
                        {new Date(reading.readingDate).toLocaleDateString(undefined, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {new Date(reading.readingDate).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* Vehicle */}
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {reading.vehicleId}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-4 py-3.5 text-sm text-slate-700 max-w-[10rem] truncate">
                      {reading.driverName ? `${reading.driverName} (Driver)` : reading.submittedByName || reading.submittedBy || <span className="text-slate-400">—</span>}
                    </td>

                    {/* Mileage */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {reading.extractedMileage?.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">km</span>
                      {reading.isCorrected && reading.originalMileage != null && (
                        <span className="block text-xs text-slate-400 line-through mt-0.5">
                          {reading.originalMileage?.toLocaleString()} km
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      <CorrectedBadge value={reading.isCorrected} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditModal(reading)} className="btn-secondary px-3 py-1.5 text-xs">Edit</button>
                        <button onClick={() => setDeletingReading(reading)} className="btn-danger px-3 py-1.5 text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-1">
              {paginationPages.map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="w-8 text-center text-slate-400 text-sm select-none">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                      p === page
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pages}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {editingReading && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Edit Reading</h3>
                <p className="text-xs text-slate-500 mt-1">{editingReading.vehicleId} · {new Date(editingReading.readingDate).toLocaleString()}</p>
              </div>
              <button type="button" onClick={closeEditModal} className="btn-secondary px-3 py-1.5 text-sm">Close</button>
            </div>
            <form onSubmit={handleUpdateReading} className="p-6 space-y-5">
              <div>
                <label htmlFor="editReadingMileage" className="block text-sm font-medium text-slate-700 mb-1.5">Mileage (km)</label>
                <input id="editReadingMileage" type="number" min="0" step="1" value={editMileage} onChange={event => setEditMileage(event.target.value)} className="input" required />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeEditModal} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={actionLoading} className="btn-primary">{actionLoading ? 'Updating...' : 'Update Reading'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {deletingReading && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Delete reading?</h3>
            <p className="text-sm text-slate-500 mt-2">This will permanently remove the {deletingReading.vehicleId} reading of {deletingReading.extractedMileage?.toLocaleString()} km.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeletingReading(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleDeleteReading} disabled={actionLoading} className="btn-danger">{actionLoading ? 'Deleting...' : 'Delete Reading'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ReadingsAdmin;
