import { useEffect, useMemo, useState } from 'react';
import api from '../api';

const formatNumber = (value) => Math.round(value || 0).toLocaleString();

const formatKm = (value) => `${formatNumber(value)} km`;

const formatUsageDate = (value) => {
  if (!value) {
    return '-';
  }

  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short'
  });
};

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

const getDateInputValue = (date) => date.toISOString().slice(0, 10);

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

const PeriodFilter = ({ value, onChange, label = 'Period' }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`${label} filter`}>
      {PERIODS.map(period => (
        <button
          key={period.value}
          type="button"
          onClick={() => onChange(period.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            value === period.value
              ? 'bg-white text-brand-700 border border-brand-500 shadow-sm'
              : 'border border-transparent text-slate-500 hover:text-slate-800 hover:bg-white'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  </div>
);

const getWeekInputValue = (date) => {
  const target = new Date(date.valueOf());
  const day = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - day);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const getDateFromWeek = (value) => {
  const [year, week] = value.split('-W').map(Number);
  const date = new Date(year, 0, 4);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + ((week - 1) * 7));
  return date;
};

const getSelectionRange = (selection) => {
  if (selection.type === 'daily') {
    return { start: selection.value, end: selection.value };
  }

  if (selection.type === 'weekly') {
    const start = getDateFromWeek(selection.value);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: getDateInputValue(start), end: getDateInputValue(end) };
  }

  const [year, month] = selection.value.split('-').map(Number);
  const end = new Date(year, month, 0);
  return { start: `${selection.value}-01`, end: getDateInputValue(end) };
};

const filterRowsBySelection = (rows, selection) => {
  const range = getSelectionRange(selection);
  return rows.filter(row => row.date >= range.start && row.date <= range.end);
};

const getDefaultSelection = (type = 'monthly') => {
  const today = new Date();
  return {
    type,
    value: type === 'daily'
      ? getDateInputValue(today)
      : type === 'weekly'
        ? getWeekInputValue(today)
        : getDateInputValue(today).slice(0, 7)
  };
};

const PeriodSelector = ({ selection, onChange, label }) => {
  const inputType = selection.type === 'daily' ? 'date' : selection.type === 'weekly' ? 'week' : 'month';
  const inputLabel = selection.type === 'daily' ? 'Date' : selection.type === 'weekly' ? 'Week' : 'Month';

  return (
    <div className="flex flex-nowrap items-end gap-3">
      <PeriodFilter value={selection.type} onChange={type => onChange({ type, value: getDefaultSelection(type).value })} label={label} />
      <label className="text-xs font-semibold text-slate-500">
        {inputLabel}
        <input
          type={inputType}
          value={selection.value}
          onChange={event => onChange({ ...selection, value: event.target.value })}
          className="input mt-1 h-10 min-w-36"
        />
      </label>
    </div>
  );
};

const exportUserReport = (rows, startDate, endDate) => {
  const headers = ['Date', 'User', 'Employee ID', 'Vehicle', 'Start mileage (km)', 'End mileage (km)', 'Daily mileage (km)'];
  const csvRows = rows.map(row => [
    row.date,
    row.name,
    row.employeeId,
    row.vehicleNumber,
    row.startMileage,
    row.endMileage,
    row.distance
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
        <EmptyState title="No contribution data" text="Select a period with recorded mileage to see the chart." />
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
              <div key={user.userId} className="flex items-center gap-4 text-sm">
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

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportSelection, setReportSelection] = useState(() => getDefaultSelection());
  const [driverSelection, setDriverSelection] = useState(() => getDefaultSelection());
  const [leaderboardSelection, setLeaderboardSelection] = useState(() => getDefaultSelection());

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/analytics');
      setAnalytics(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      try {
        const res = await api.get('/admin/analytics');

        if (isActive) {
          setAnalytics(res.data);
        }
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load analytics');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

  const kpis = analytics?.kpis || {};
  const driverVehicleUsage = analytics?.driverVehicleUsage || [];
  const userDailyUsage = useMemo(() => analytics?.userDailyUsage || [], [analytics]);
  const reportRows = useMemo(() => filterRowsBySelection(userDailyUsage, reportSelection), [userDailyUsage, reportSelection]);
  const periodUsage = reportRows;
  const userSummary = useMemo(() => {
    const summary = new Map();

    periodUsage.forEach(row => {
      const current = summary.get(row.userId) || {
        userId: row.userId,
        name: row.name,
        employeeId: row.employeeId,
        role: row.role,
        distance: 0,
        days: 0,
        vehicles: new Set(),
        lastDate: row.date
      };
      current.distance += row.distance;
      current.days += 1;
      current.vehicles.add(row.vehicleNumber);
      current.lastDate = current.lastDate > row.date ? current.lastDate : row.date;
      summary.set(row.userId, current);
    });

    return Array.from(summary.values())
      .map(row => ({ ...row, vehicles: Array.from(row.vehicles) }))
      .sort((left, right) => right.distance - left.distance);
  }, [periodUsage]);
  const periodDistance = periodUsage.reduce((total, row) => total + row.distance, 0);
  const reportUsers = userSummary.length;
  const reportVehicles = new Set(periodUsage.map(row => row.vehicleNumber)).size;
  const averageDailyDistance = periodUsage.length ? periodDistance / periodUsage.length : 0;
  const latestUsageDate = userDailyUsage.reduce((latest, row) => row.date > latest ? row.date : latest, '');
  const latestDailyRows = userDailyUsage.filter(row => row.date === latestUsageDate);
  const totalDailyKilometers = latestDailyRows.reduce((total, row) => total + row.distance, 0);
  const leaderboardRows = useMemo(() => filterRowsBySelection(userDailyUsage, leaderboardSelection), [userDailyUsage, leaderboardSelection]);

  const filteredUserSummary = useMemo(() => {
    const summary = new Map();
    leaderboardRows.forEach(row => {
      const current = summary.get(row.userId) || {
        userId: row.userId,
        name: row.name,
        employeeId: row.employeeId,
        role: row.role,
        distance: 0,
        days: 0,
        vehicles: new Set(),
        lastDate: row.date
      };
      current.distance += row.distance;
      current.days += 1;
      current.vehicles.add(row.vehicleNumber);
      current.lastDate = current.lastDate > row.date ? current.lastDate : row.date;
      summary.set(row.userId, current);
    });

    return Array.from(summary.values())
      .map(row => ({ ...row, vehicles: Array.from(row.vehicles) }))
      .sort((left, right) => right.distance - left.distance);
  }, [leaderboardRows]);
  const driverRange = getSelectionRange(driverSelection);
  const filteredDriverUsage = driverVehicleUsage.map(usage => {
    const dailyUsage = (usage.allDailyUsage || usage.dailyUsage)
      .filter(day => day.date >= driverRange.start && day.date <= driverRange.end);
    return {
      ...usage,
      dailyUsage: dailyUsage.slice(-7).reverse(),
      latestDailyUsage: dailyUsage.at(-1) || null,
      periodDistance: dailyUsage.reduce((total, day) => total + day.distance, 0)
    };
  }).filter(usage => usage.latestDailyUsage);

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
        <button onClick={fetchAnalytics} className="btn-primary mt-4">Retry</button>
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
          <button onClick={fetchAnalytics} className="btn-secondary self-start sm:self-auto">
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
          value={formatKm(totalDailyKilometers)}
          subtext={latestUsageDate ? `Latest recorded day: ${formatReportDate(latestUsageDate)}` : 'No daily usage recorded'}
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

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Primary view</p>
            <h3 className="text-xl font-semibold text-slate-950 mt-1">User mileage report</h3>
            <p className="text-sm text-slate-500 mt-1">Track accountable daily mileage by company user and assigned vehicle.</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-nowrap sm:items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <PeriodSelector selection={reportSelection} onChange={setReportSelection} label="Report period" />
            <button
              onClick={() => {
                const range = getSelectionRange(reportSelection);
                exportUserReport(periodUsage, range.start, range.end);
              }}
              disabled={!periodUsage.length}
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
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatKm(periodDistance)}</p><p className="text-xs text-slate-500 mt-1">Period mileage</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatNumber(reportUsers)}</p><p className="text-xs text-slate-500 mt-1">Active users</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatNumber(reportVehicles)}</p><p className="text-xs text-slate-500 mt-1">Vehicles used</p></div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-950">{formatKm(averageDailyDistance)}</p><p className="text-xs text-slate-500 mt-1">Average recorded day</p></div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Driver &amp; Vehicle Usage</h3>
            <p className="text-sm text-slate-500 mt-1">Daily, weekly, and monthly mileage by user and vehicle.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector selection={driverSelection} onChange={setDriverSelection} label="Usage period" />
            <span className="text-xs font-semibold text-slate-500">{filteredDriverUsage.length} user-vehicle records</span>
          </div>
        </div>

        {filteredDriverUsage.length === 0 ? (
          <EmptyState title="No daily usage yet" text="Consecutive daily readings for the same user and vehicle are required." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User / Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Selected Period</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Period km</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Days</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Daily Usage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDriverUsage.map(usage => (
                  <tr key={usage.key} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-950">{usage.name}</p>
                      <p className="text-xs text-slate-500 mt-1 capitalize">
                        {usage.employeeId || usage.username || usage.role}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm font-semibold text-slate-900">{usage.vehicleNumber}</td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-sm font-semibold text-brand-700">{formatKm(usage.periodDistance)}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatUsageDate(usage.latestDailyUsage?.date)}: {formatNumber(usage.latestDailyUsage?.startMileage)} to {formatNumber(usage.latestDailyUsage?.endMileage)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatKm(usage.periodDistance)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-slate-900">{formatNumber(usage.dailyUsage.length)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-sm">
                        {usage.dailyUsage.map(day => (
                          <span key={day.date} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            <span className="font-semibold">{formatUsageDate(day.date)}</span> {formatKm(day.distance)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">User mileage contribution</h3>
            <p className="text-sm text-slate-500 mt-1">Compare each user or driver&apos;s share of mileage for the selected period.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector selection={leaderboardSelection} onChange={setLeaderboardSelection} label="Contribution period" />
            <span className="text-xs font-semibold text-slate-500">{filteredUserSummary.length} users</span>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
          <div className="min-w-0 overflow-x-auto">
            {filteredUserSummary.length === 0 ? <EmptyState title="No user mileage in this period" text="Choose another period with recorded mileage." /> : (
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
                  <th className="px-2 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Days</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last activity</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{filteredUserSummary.map((user, index) => (
                  <tr key={user.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-4"><div className="flex items-center gap-2 min-w-0"><span className="w-6 h-6 rounded-md bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span><div className="min-w-0"><p className="text-sm font-semibold text-slate-950 truncate" title={user.name}>{user.name}</p><p className="text-xs text-slate-500 truncate">{user.employeeId || user.role}</p></div></div></td>
                    <td className="px-2 py-4 text-right font-mono text-sm font-bold text-brand-700 whitespace-nowrap">{formatKm(user.distance)}</td>
                    <td className="px-2 py-4 text-right text-sm text-slate-700">{user.days}</td>
                    <td className="px-2 py-4"><div className="flex flex-wrap gap-1">{user.vehicles.map(vehicle => <span key={vehicle} className="rounded-md bg-slate-100 px-1.5 py-1 text-[11px] font-mono font-semibold text-slate-600 truncate max-w-full">{vehicle}</span>)}</div></td>
                    <td className="px-2 py-4 text-xs text-slate-600 whitespace-nowrap">{formatReportDate(user.lastDate)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="bg-slate-50/60">
            <div className="px-6 pt-6">
              <h4 className="text-sm font-semibold text-slate-950">Mileage share</h4>
              <p className="text-xs text-slate-500 mt-1">Contribution by user for the selected period.</p>
            </div>
            <ContributionPieChart users={filteredUserSummary} />
          </div>
        </div>
      </section>

    </div>
  );
};

export default AnalyticsDashboard;
