import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';

const formatNumber = (value) => Math.round(value || 0).toLocaleString();

const formatKm = (value) => `${formatNumber(value)} km`;

const formatReportDate = (value) => {
  if (!value) {
    return '-';
  }

  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatReadingTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    startDate: getDateInputValue(start),
    endDate: getDateInputValue(today)
  };
};

const exportUserReport = (rows, startDate, endDate) => {
  const headers = ['User', 'Employee ID', 'Vehicle', 'First recording', 'Last recording', 'Start mileage (km)', 'End mileage (km)', 'Mileage gap (km)', 'Recordings'];
  const csvRows = rows.map(row => [
    row.name,
    row.employeeId,
    row.vehicleNumber,
    new Date(row.startReadingAt).toLocaleString(),
    new Date(row.endReadingAt).toLocaleString(),
    row.startMileage,
    row.endMileage,
    row.distance,
    row.readingCount
  ]);
  const csv = [headers, ...csvRows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `user_mileage_report_${startDate}_to_${endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const KpiCard = ({ label, value, subtext, tone = 'brand', icon }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100'
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-950 mt-2">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ title, text }) => (
  <div className="text-center py-14">
    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 mx-auto mb-3 flex items-center justify-center">
      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M11 3v18m8-14v10M5 9v6" />
      </svg>
    </div>
    <p className="font-semibold text-slate-700">{title}</p>
    <p className="text-sm text-slate-500 mt-1">{text}</p>
  </div>
);

const contributionColors = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#64748b'
];

const ContributionPieChart = ({ users }) => {
  const totalDistance = users.reduce((total, user) => total + user.distance, 0);
  const segments = users.reduce((result, user, index) => {
    const percentage = totalDistance ? user.distance / totalDistance : 0;
    const startAngle = result.angle;
    const endAngle = startAngle + (percentage * 360);

    return {
      angle: endAngle,
      segments: [...result.segments, {
        ...user,
        percentage,
        color: contributionColors[index % contributionColors.length],
        startAngle,
        endAngle
      }]
    };
  }, { angle: 0, segments: [] }).segments;
  const gradient = segments.length
    ? `conic-gradient(${segments.map(segment => `${segment.color} ${segment.startAngle}deg ${segment.endAngle}deg`).join(', ')})`
    : 'conic-gradient(#e2e8f0 0deg 360deg)';

  return (
    <div className="h-full min-h-[360px] flex flex-col items-center justify-start p-5 sm:p-6">
      {users.length === 0 ? (
        <EmptyState title="No contribution data" text="Select a date range containing at least two recordings." />
      ) : (
        <>
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 shrink-0 mt-1" aria-label="Mileage contribution pie chart" role="img">
            <div className="w-full h-full rounded-full" style={{ background: gradient }} />
            <div className="absolute inset-1/4 rounded-full bg-white border border-slate-100 flex flex-col items-center justify-center shadow-inner">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total</span>
              <span className="text-xl font-bold text-slate-950 mt-1">{formatKm(totalDistance)}</span>
            </div>
          </div>
          <div className="w-full max-w-[260px] mt-5 space-y-2.5 mx-auto">
            {segments.map(user => (
              <div key={user.userKey} className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: user.color }} />
                  <span className="font-medium text-slate-700 truncate">{user.name}</span>
                </div>
                <span className="shrink-0 font-semibold text-slate-950">{Math.round(user.percentage * 100)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const summarizeUsage = (rows) => {
  const summary = new Map();

  rows.forEach(row => {
    const current = summary.get(row.operatorKey) || {
      userKey: row.operatorKey,
      name: row.name,
      employeeId: row.employeeId,
      role: row.role,
      distance: 0,
      gaps: 0,
      recordings: 0,
      vehicles: new Set(),
      lastReadingAt: row.endReadingAt
    };
    current.distance += row.distance;
    current.gaps += 1;
    current.recordings += row.readingCount;
    current.vehicles.add(row.vehicleNumber);
    current.lastReadingAt = current.lastReadingAt > row.endReadingAt
      ? current.lastReadingAt
      : row.endReadingAt;
    summary.set(row.operatorKey, current);
  });

  return Array.from(summary.values())
    .map(row => ({ ...row, vehicles: Array.from(row.vehicles) }))
    .sort((left, right) => right.distance - left.distance);
};

const DateRangeFilter = ({ filters, onChange, onSubmit, error, searching }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <label className="text-xs font-semibold text-slate-600">
        Start date
        <input
          type="date"
          value={filters.startDate}
          max={filters.endDate || undefined}
          onChange={event => onChange(previous => ({ ...previous, startDate: event.target.value }))}
          className="input mt-1 h-10 sm:w-40"
          required
        />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        End date
        <input
          type="date"
          value={filters.endDate}
          min={filters.startDate || undefined}
          onChange={event => onChange(previous => ({ ...previous, endDate: event.target.value }))}
          className="input mt-1 h-10 sm:w-40"
          required
        />
      </label>
      <button type="submit" className="btn-primary h-10 px-5" disabled={searching}>
        {searching ? 'Searching...' : 'Search'}
      </button>
    </form>
    {error && <p className="text-xs font-medium text-red-600 mt-2">{error}</p>}
  </div>
);

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportFilters, setReportFilters] = useState(() => getDefaultDateRange());
  const [reportRange, setReportRange] = useState(() => getDefaultDateRange());
  const [reportUsage, setReportUsage] = useState([]);
  const [reportError, setReportError] = useState('');
  const [operatorFilters, setOperatorFilters] = useState(() => getDefaultDateRange());
  const [operatorUsage, setOperatorUsage] = useState([]);
  const [operatorError, setOperatorError] = useState('');
  const [contributionFilters, setContributionFilters] = useState(() => getDefaultDateRange());
  const [contributionUsage, setContributionUsage] = useState([]);
  const [contributionError, setContributionError] = useState('');
  const [searchingSection, setSearchingSection] = useState('');

  const fetchAnalytics = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
      setError('');
    }

    try {
      const res = await api.get('/admin/analytics');
      setAnalytics(res.data);
    } catch (err) {
      if (!background) {
        setError(err.response?.data?.error || 'Failed to load analytics');
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  const fetchRangeUsage = useCallback(async (range) => {
    const res = await api.get('/admin/analytics', { params: range });
    return res.data.rangeUsage || [];
  }, []);

  useEffect(() => {
    const initialRange = getDefaultDateRange();
    const loadTimer = window.setTimeout(() => {
      fetchAnalytics();
      fetchRangeUsage(initialRange)
        .then(rows => {
          setReportUsage(rows);
          setOperatorUsage(rows);
          setContributionUsage(rows);
        })
        .catch(err => {
          const message = err.response?.data?.error || 'Failed to load date range analytics';
          setReportError(message);
          setOperatorError(message);
          setContributionError(message);
        });
    }, 0);
    const refreshTimer = window.setInterval(() => fetchAnalytics({ background: true }), 15000);

    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [fetchAnalytics, fetchRangeUsage]);

  const searchRange = async (event, section, filters, setRows, setSectionError, setAppliedRange) => {
    event.preventDefault();

    if (!filters.startDate || !filters.endDate) {
      setSectionError('Select both a start date and an end date.');
      return;
    }

    if (filters.startDate > filters.endDate) {
      setSectionError('End date must be on or after start date.');
      return;
    }

    setSectionError('');
    setSearchingSection(section);
    try {
      const rows = await fetchRangeUsage(filters);
      setRows(rows);
      if (setAppliedRange) {
        setAppliedRange({ ...filters });
      }
    } catch (err) {
      setSectionError(err.response?.data?.error || 'Failed to load analytics for this date range');
    } finally {
      setSearchingSection('');
    }
  };

  const kpis = analytics?.kpis || {};
  const currentVehicleMileage = useMemo(() => (
    [...(analytics?.vehicleUsage || [])]
      .sort((left, right) => left.vehicleNumber.localeCompare(right.vehicleNumber))
  ), [analytics]);
  const reportSummary = useMemo(() => summarizeUsage(reportUsage), [reportUsage]);
  const contributionSummary = useMemo(() => summarizeUsage(contributionUsage), [contributionUsage]);
  const reportDistance = reportUsage.reduce((total, row) => total + row.distance, 0);
  const reportUsers = reportSummary.length;
  const reportVehicles = new Set(reportUsage.map(row => row.vehicleNumber)).size;
  const averageGapDistance = reportUsage.length ? reportDistance / reportUsage.length : 0;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-32 bg-white border border-slate-200 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 h-96 bg-white border border-slate-200 rounded-xl" />
          <div className="h-96 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={() => fetchAnalytics()} className="btn-primary mt-4">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
          <h2 className="text-2xl font-bold text-slate-950 mt-0.5">Fleet Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">
            Executive mileage insights across vehicles, drivers, usage, and OCR quality.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-slate-400">
            Updated {analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleString() : '-'}
          </p>
          <button onClick={() => fetchAnalytics()} className="btn-secondary self-start sm:self-auto">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 15A8 8 0 1118.364 8.636" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <KpiCard
          label="Total Daily Kilometers"
          value={formatKm(kpis.latestDailyKilometers)}
          subtext={kpis.latestUsageDate ? `Latest recorded day: ${formatReportDate(kpis.latestUsageDate)}` : 'No daily usage recorded'}
          tone="brand"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 7-8" />
            </svg>
          }
        />
        <KpiCard
          label="Registered Vehicles"
          value={formatNumber(kpis.totalVehicles)}
          subtext="Vehicles registered in the system"
          tone="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
            </svg>
          }
        />
        <KpiCard
          label="System Users"
          value={formatNumber(kpis.totalUsers)}
          subtext="Users registered in the system"
          tone="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
          }
        />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-slate-950">Current vehicle mileage</h3>
            </div>
            <p className="text-sm text-slate-500 mt-1">Latest odometer value and last reading time for every registered vehicle.</p>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5">
            Refreshes every 15 seconds
          </span>
        </div>

        {currentVehicleMileage.length === 0 ? (
          <EmptyState title="No registered vehicles" text="Registered vehicles will appear here automatically." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-100">
            {currentVehicleMileage.map(vehicle => (
              <article key={vehicle.vehicleNumber} className="bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-brand-700 truncate">{vehicle.vehicleNumber}</p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{[vehicle.make, vehicle.name, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details unavailable'}</p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${vehicle.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {vehicle.status || 'unknown'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-slate-950 mt-4">{vehicle.lastMileage == null ? 'No reading' : formatKm(vehicle.lastMileage)}</p>
                <p className="text-xs text-slate-500 mt-1">{vehicle.lastReadingDate ? `Last reading: ${formatReadingTime(vehicle.lastReadingDate)}` : 'No reading submitted yet'}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Primary view</p>
            <h3 className="text-xl font-semibold text-slate-950 mt-1">User mileage report</h3>
            <p className="text-sm text-slate-500 mt-1">Compare the first and last recordings made by each user and vehicle.</p>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <DateRangeFilter
              filters={reportFilters}
              onChange={setReportFilters}
              onSubmit={event => searchRange(event, 'report', reportFilters, setReportUsage, setReportError, setReportRange)}
              error={reportError}
              searching={searchingSection === 'report'}
            />
            <button
              onClick={() => exportUserReport(reportUsage, reportRange.startDate, reportRange.endDate)}
              disabled={!reportUsage.length}
              className="btn-primary h-9 px-3 text-sm whitespace-nowrap disabled:opacity-50"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Excel CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatKm(reportDistance)}</p><p className="text-xs text-slate-500 mt-1">Attributed mileage</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatNumber(reportUsers)}</p><p className="text-xs text-slate-500 mt-1">Active operators</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatNumber(reportVehicles)}</p><p className="text-xs text-slate-500 mt-1">Vehicles used</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatKm(averageGapDistance)}</p><p className="text-xs text-slate-500 mt-1">Average recording gap</p></div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Operator &amp; Vehicle Recording Gaps</h3>
            <p className="text-sm text-slate-500 mt-1">First-to-last odometer difference for each continuous operator and vehicle session.</p>
            <p className="text-xs font-semibold text-slate-500 mt-2">{operatorUsage.length} recording gaps</p>
          </div>
          <DateRangeFilter
            filters={operatorFilters}
            onChange={setOperatorFilters}
            onSubmit={event => searchRange(event, 'operator', operatorFilters, setOperatorUsage, setOperatorError)}
            error={operatorError}
            searching={searchingSection === 'operator'}
          />
        </div>

        {operatorUsage.length === 0 ? (
          <EmptyState title="No mileage gaps in this range" text="At least two recordings from the same operator and vehicle are required." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User / Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">First recording</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last recording</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Start km</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">End km</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Gap</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Recordings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operatorUsage.map(usage => (
                  <tr key={usage.key} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-950">{usage.name}</p>
                      <p className="text-xs text-slate-500 mt-1 capitalize">
                        {usage.employeeId || usage.username || usage.role}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm font-semibold text-slate-900">{usage.vehicleNumber}</td>
                    <td className="px-4 py-4 text-xs text-slate-600 whitespace-nowrap">{formatReadingTime(usage.startReadingAt)}</td>
                    <td className="px-4 py-4 text-xs text-slate-600 whitespace-nowrap">{formatReadingTime(usage.endReadingAt)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm text-slate-700">{formatNumber(usage.startMileage)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm text-slate-700">{formatNumber(usage.endMileage)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-bold text-brand-700">{formatKm(usage.distance)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatNumber(usage.readingCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">User mileage contribution</h3>
            <p className="text-sm text-slate-500 mt-1">Compare each user or driver&apos;s share of first-to-last mileage gaps.</p>
            <p className="text-xs font-semibold text-slate-500 mt-2">{contributionSummary.length} operators</p>
          </div>
          <DateRangeFilter
            filters={contributionFilters}
            onChange={setContributionFilters}
            onSubmit={event => searchRange(event, 'contribution', contributionFilters, setContributionUsage, setContributionError)}
            error={contributionError}
            searching={searchingSection === 'contribution'}
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
          <div className="min-w-0 overflow-x-auto">
            {contributionSummary.length === 0 ? <EmptyState title="No operator mileage in this range" text="Choose a date range containing at least two recordings." /> : (
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[22%]" />
                  <col className="w-[21%]" />
                </colgroup>
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-2 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Km</th>
                  <th className="px-2 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gaps</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last activity</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{contributionSummary.map((user, index) => (
                  <tr key={user.userKey} className="hover:bg-slate-50">
                    <td className="px-4 py-4"><div className="flex items-center gap-2 min-w-0"><span className="w-6 h-6 rounded-md bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span><div className="min-w-0"><p className="text-sm font-semibold text-slate-950 truncate" title={user.name}>{user.name}</p><p className="text-xs text-slate-500 truncate">{user.employeeId || user.role}</p></div></div></td>
                    <td className="px-2 py-4 text-right font-mono text-sm font-bold text-brand-700 whitespace-nowrap">{formatKm(user.distance)}</td>
                    <td className="px-2 py-4 text-right text-sm text-slate-700">{user.gaps}</td>
                    <td className="px-2 py-4"><div className="flex flex-wrap gap-1">{user.vehicles.map(vehicle => <span key={vehicle} className="rounded-md bg-slate-100 px-1.5 py-1 text-[11px] font-mono font-semibold text-slate-600 truncate max-w-full">{vehicle}</span>)}</div></td>
                    <td className="px-2 py-4 text-xs text-slate-600 whitespace-nowrap">{formatReadingTime(user.lastReadingAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="bg-slate-50/60">
            <div className="px-6 pt-6">
              <h4 className="text-sm font-semibold text-slate-950">Mileage share</h4>
              <p className="text-xs text-slate-500 mt-1">Contribution by operator for the selected date range.</p>
            </div>
            <ContributionPieChart users={contributionSummary} />
          </div>
        </div>
      </section>

    </div>
  );
};

export default AnalyticsDashboard;
