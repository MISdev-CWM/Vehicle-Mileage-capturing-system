import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

const formatNumber = (value) => Math.round(value || 0).toLocaleString();

const formatFuelNumber = (value) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2
}).format(value || 0);

const formatFuelAmount = (value) => new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(value || 0);

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

const formatReadingDetailTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatConfidence = (value) => (
  typeof value === 'number' ? `${Math.round(value * 100)}%` : '-'
);

const getDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getCurrentMonth = () => getDateInputValue(new Date()).slice(0, 7);

const isSelectableMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= getCurrentMonth();

const formatMonthLabel = (value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) {
    return '';
  }

  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
};

const getFollowingMonth = (value) => {
  const [year, month] = value.split('-').map(Number);
  const followingMonth = new Date(year, month, 1);

  return `${followingMonth.getFullYear()}-${String(followingMonth.getMonth() + 1).padStart(2, '0')}`;
};

const getDefaultDateRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    startDate: getDateInputValue(start),
    endDate: getDateInputValue(today)
  };
};

const getMonthDateRange = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  const today = new Date();

  if (end > today) {
    end.setTime(today.getTime());
  }

  return {
    startDate: getDateInputValue(start),
    endDate: getDateInputValue(end)
  };
};

const getInclusiveDateCount = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0;
  }

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.floor((end - start) / 86400000) + 1;
};

const getMaximumRangeEndDate = (startDate) => {
  if (!startDate) {
    return undefined;
  }

  const [year, month, day] = startDate.split('-').map(Number);
  const maximumDate = new Date(Date.UTC(year, month - 1, day + 59));
  return maximumDate.toISOString().slice(0, 10);
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

const ownershipChartStyles = {
  pool: {
    label: 'Pool',
    badge: 'border-blue-100 bg-blue-50 text-blue-700',
    accent: 'bg-blue-600',
    surface: 'from-blue-50/80'
  },
  company: {
    label: 'Company',
    badge: 'border-teal-100 bg-teal-50 text-teal-700',
    accent: 'bg-teal-600',
    surface: 'from-teal-50/80'
  },
  personal: {
    label: 'Personal',
    badge: 'border-violet-100 bg-violet-50 text-violet-700',
    accent: 'bg-violet-600',
    surface: 'from-violet-50/80'
  }
};

const professionalUserColors = [
  '#1d4ed8', '#0f766e', '#4338ca', '#0369a1', '#047857', '#6d28d9',
  '#9f1239', '#a16207', '#334155', '#0e7490', '#5b21b6', '#be123c',
  '#166534', '#c2410c', '#1e40af', '#115e59', '#3730a3', '#075985',
  '#15803d', '#7e22ce', '#9f1239', '#92400e', '#475569', '#155e75'
];

const getStableUserColor = (userKey = '') => {
  const hash = Array.from(String(userKey)).reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    0
  );

  return professionalUserColors[hash % professionalUserColors.length];
};

const getFirstName = (name = '') => String(name).trim().split(/\s+/)[0] || 'Unknown';

const flattenOwnershipMileage = (rows) => rows
  .flatMap(row => (row.vehicleMileage || []).map(vehicle => ({
    operatorKey: row.operatorKey,
    name: row.name,
    employeeId: row.employeeId,
    username: row.username,
    role: row.role,
    vehicleNumber: vehicle.vehicleNumber,
    distance: vehicle.distance,
    readingCount: vehicle.readingCount
  })))
  .sort((left, right) => right.distance - left.distance
    || left.name.localeCompare(right.name)
    || left.vehicleNumber.localeCompare(right.vehicleNumber));

const OwnershipMileageChart = ({ ownership, rows, onExpand, expanded = false }) => {
  const style = ownershipChartStyles[ownership];
  const [searchTerm, setSearchTerm] = useState('');
  const [recordLimit, setRecordLimit] = useState(expanded ? '20' : '10');
  const records = useMemo(() => flattenOwnershipMileage(rows), [rows]);
  const totalDistance = records.reduce((total, record) => total + record.distance, 0);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRecords = records.filter(record => (
    !normalizedSearch
    || record.name?.toLowerCase().includes(normalizedSearch)
    || record.employeeId?.toLowerCase().includes(normalizedSearch)
    || record.username?.toLowerCase().includes(normalizedSearch)
    || record.vehicleNumber?.toLowerCase().includes(normalizedSearch)
  ));
  const visibleRecords = recordLimit === 'all'
    ? filteredRecords
    : filteredRecords.slice(0, Number(recordLimit));
  const maximumDistance = Math.max(...filteredRecords.map(record => record.distance), 1);

  return (
    <article className={`min-w-0 bg-gradient-to-b ${style.surface} to-white ${expanded ? 'px-7 py-6' : 'px-5 py-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${style.accent}`} aria-hidden="true" />
            <h4 className="text-base font-semibold text-slate-950">{style.label} vehicles</h4>
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>{records.length} records</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatKm(totalDistance)} total monthly mileage</p>
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={onExpand}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            aria-label={`Open ${style.label} chart in full screen`}
            title="Open full screen"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H3v5m13-5h5v5M8 21H3v-5m18 0v5h-5" />
            </svg>
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className={`flex items-center justify-center text-center ${expanded ? 'h-[calc(100vh-13rem)] min-h-[420px]' : 'h-80'}`}>
          <div>
            <p className="text-sm font-semibold text-slate-700">No mileage recorded</p>
            <p className="mt-1 text-xs text-slate-500">No user has two readings for this ownership type.</p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search {style.label} users or vehicles</span>
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                type="search"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search user or vehicle"
                className="input h-9 w-full pl-9 text-xs"
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
              Show
              <select value={recordLimit} onChange={event => setRecordLimit(event.target.value)} className="input h-9 w-24 py-1 text-xs">
                <option value="10">Top 10</option>
                <option value="20">Top 20</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-400">
            <span>{visibleRecords.length} of {filteredRecords.length} records</span>
            <span>Monthly mileage</span>
          </div>

          {visibleRecords.length === 0 ? (
            <div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/70 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-700">No matching records</p>
                <p className="mt-1 text-xs text-slate-500">Try a different user or vehicle number.</p>
              </div>
            </div>
          ) : (
            <div className={`mt-2 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm ${expanded ? 'max-h-[calc(100vh-17rem)]' : 'max-h-[390px]'}`}>
              <div className={`sticky top-0 z-10 grid items-center gap-3 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur ${expanded ? 'grid-cols-[minmax(9rem,13rem)_minmax(14rem,1fr)_7rem]' : 'grid-cols-[minmax(5.5rem,7rem)_minmax(5rem,1fr)_6rem]'}`}>
                <span>User</span>
                <span className="flex justify-between"><span>0</span><span>{formatNumber(maximumDistance / 2)}</span><span>{formatNumber(maximumDistance)} km</span></span>
                <span className="text-right">Distance / vehicle</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleRecords.map(record => {
                  const userColor = getStableUserColor(record.operatorKey || record.employeeId || record.name);
                  const percentage = Math.min(98.5, Math.max(1.5, (record.distance / maximumDistance) * 100));
                  const detailText = `${record.name} | ${record.vehicleNumber} | ${formatKm(record.distance)} | ${record.readingCount} readings`;

                  return (
                    <div
                      key={`${record.operatorKey}-${record.vehicleNumber}`}
                      className={`group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-slate-50 ${expanded ? 'grid-cols-[minmax(9rem,13rem)_minmax(14rem,1fr)_7rem]' : 'grid-cols-[minmax(5.5rem,7rem)_minmax(5rem,1fr)_6rem]'}`}
                      title={detailText}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: userColor }} aria-hidden="true" />
                          <span className="truncate text-xs font-semibold text-slate-900" title={record.name}>{getFirstName(record.name)}</span>
                        </div>
                      </div>
                      <div className="relative h-7" aria-label={detailText}>
                        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
                        <div className="absolute left-1/2 top-1 h-5 border-l border-dashed border-slate-200" />
                        <div
                          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%`, backgroundColor: userColor }}
                        />
                        <span
                          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-slate-200 transition-transform group-hover:scale-125"
                          style={{ left: `${percentage}%`, backgroundColor: userColor }}
                        />
                      </div>
                      <div className="text-right">
                        <span className="block whitespace-nowrap font-mono text-xs font-bold text-slate-900">{formatNumber(record.distance)} km</span>
                        <span className="mt-1 block truncate font-mono text-[10px] font-semibold text-slate-500" title={record.vehicleNumber}>{record.vehicleNumber}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </article>
  );
};

const OwnershipMileageModal = ({ ownership, rows, month, onClose }) => {
  const style = ownershipChartStyles[ownership];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal((
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="ownership-chart-modal-title">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 id="ownership-chart-modal-title" className="text-lg font-semibold text-slate-950">{style.label} vehicle mileage ranking</h3>
            <p className="mt-1 text-sm text-slate-500">Ranked user and vehicle mileage for {month}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary shrink-0 px-3 py-1.5 text-sm">Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <OwnershipMileageChart ownership={ownership} rows={rows} expanded />
        </div>
      </div>
    </div>
  ), document.body);
};

const ReadingDetailsModal = ({ usage, onClose }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const readings = usage.readings || [];

  return createPortal((
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="reading-details-title">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="reading-details-title" className="text-lg font-semibold text-slate-950">{usage.name}</h3>
              <span className="rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-semibold text-brand-700">{usage.vehicleNumber}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {usage.employeeId || usage.username || usage.role} | {usage.isPending ? 'Reading received; awaiting the next monthly reading' : 'Complete reading history for this recording gap'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary shrink-0 px-3 py-1.5 text-sm">Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total gap</p>
              {usage.isPending ? (
                <span className="mt-1 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">Pending</span>
              ) : (
                <p className="mt-1 text-xl font-bold text-brand-700">{formatKm(usage.distance)}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recordings</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{formatNumber(usage.readingCount)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reading period</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatReadingDetailTime(usage.startReadingAt)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{usage.isPending ? 'Awaiting next reading' : `to ${formatReadingDetailTime(usage.endReadingAt)}`}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-white">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reading</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Recorded at</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Odometer</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Gap</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">OCR confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((reading, index) => {
                  const context = [
                    reading.meterType ? `Meter ${reading.meterType}` : '',
                    reading.divisionName,
                    reading.reason
                  ].filter(Boolean);

                  return (
                    <tr key={reading.id || `${reading.readingAt}-${index}`} className="align-top hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-100 px-2 text-xs font-bold text-slate-700">{index + 1}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-800">{formatReadingDetailTime(reading.readingAt)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-sm font-semibold text-slate-950">{formatKm(reading.mileage)}</td>
                      <td className={`whitespace-nowrap px-4 py-4 text-right font-mono text-sm font-semibold ${reading.gapFromPrevious < 0 ? 'text-red-600' : 'text-brand-700'}`}>
                        {reading.gapFromPrevious == null ? '-' : formatKm(reading.gapFromPrevious)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm text-slate-700">{formatConfidence(reading.ocrConfidence)}</td>
                      <td className="px-4 py-4">
                        <p className={`text-xs font-semibold ${reading.isCorrected ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {reading.isCorrected ? 'Corrected' : 'OCR reading'}
                        </p>
                        {reading.isCorrected && reading.originalMileage != null && (
                          <p className="mt-1 text-xs text-slate-500">Original: {formatKm(reading.originalMileage)}</p>
                        )}
                        {context.length > 0 && <p className="mt-1 text-xs text-slate-500">{context.join(' | ')}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
};

const SearchableDropdown = ({ label, value, options, placeholder, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const selectedOption = options.find(option => option.value === value);
  const filteredOptions = options.filter(option => (
    option.label.toLowerCase().includes(search.trim().toLowerCase())
  ));

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  const selectOption = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="relative text-xs font-semibold text-slate-600" ref={dropdownRef}>
      <span className="block">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="input mt-1 flex h-10 w-full items-center justify-between gap-2 text-left text-sm font-normal"
      >
        <span className={selectedOption ? 'truncate text-slate-900' : 'truncate text-slate-500'}>
          {selectedOption?.label || placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  setIsOpen(false);
                  setSearch('');
                }
              }}
              placeholder={`Search ${label.toLowerCase()}...`}
              aria-label={`Search ${label.toLowerCase()}`}
              autoFocus
              className="input h-9 w-full text-sm font-normal"
            />
          </div>
          <div role="listbox" aria-label={label} className="max-h-52 overflow-y-auto p-1">
            {filteredOptions.length ? filteredOptions.map(option => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value || 'all'}
                onClick={() => selectOption(option.value)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-normal hover:bg-slate-100 ${
                  option.value === value ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                }`}
              >
                {option.label}
              </button>
            )) : (
              <p className="px-3 py-2 text-sm font-normal text-slate-500">No matches found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [fuelTypeMonth, setFuelTypeMonth] = useState(() => getCurrentMonth());
  const [fuelTypeSummary, setFuelTypeSummary] = useState(null);
  const [fuelTypeLoading, setFuelTypeLoading] = useState(true);
  const [fuelTypeError, setFuelTypeError] = useState('');
  const fuelTypeRequestId = useRef(0);
  const [poolVehicleUsage, setPoolVehicleUsage] = useState([]);
  const [poolMonth, setPoolMonth] = useState(() => getCurrentMonth());
  const [poolMonthInput, setPoolMonthInput] = useState(() => getCurrentMonth());
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState('');
  const poolRequestId = useRef(0);
  const [ownershipMileage, setOwnershipMileage] = useState({ pool: [], company: [], personal: [] });
  const [ownershipMonth, setOwnershipMonth] = useState(() => getCurrentMonth());
  const [ownershipMonthInput, setOwnershipMonthInput] = useState(() => getCurrentMonth());
  const [ownershipLoading, setOwnershipLoading] = useState(true);
  const [ownershipError, setOwnershipError] = useState('');
  const [expandedOwnership, setExpandedOwnership] = useState(null);
  const ownershipRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportFilters, setReportFilters] = useState(() => getDefaultDateRange());
  const [reportRange, setReportRange] = useState(() => getDefaultDateRange());
  const [reportUsage, setReportUsage] = useState([]);
  const [reportError, setReportError] = useState('');
  const [operatorFilters, setOperatorFilters] = useState(() => ({
    category: '',
    vehicleNumber: '',
    period: 'monthly',
    month: getCurrentMonth(),
    ...getDefaultDateRange()
  }));
  const [appliedOperatorPeriod, setAppliedOperatorPeriod] = useState(() => ({
    period: 'monthly',
    month: getCurrentMonth()
  }));
  const [operatorUsage, setOperatorUsage] = useState([]);
  const [operatorError, setOperatorError] = useState('');
  const [contributionFilters, setContributionFilters] = useState(() => getDefaultDateRange());
  const [contributionUsage, setContributionUsage] = useState([]);
  const [contributionError, setContributionError] = useState('');
  const [searchingSection, setSearchingSection] = useState('');
  const [selectedUsage, setSelectedUsage] = useState(null);

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

  useEffect(() => {
    const requestId = ++fuelTypeRequestId.current;
    let active = true;

    api.get('/fuel-usage/summary', { params: { month: fuelTypeMonth } })
      .then(res => {
        if (active && requestId === fuelTypeRequestId.current) {
          setFuelTypeSummary(res.data);
          setFuelTypeError('');
        }
      })
      .catch(err => {
        if (active && requestId === fuelTypeRequestId.current) {
          setFuelTypeError(err.response?.data?.error || 'Failed to load fuel usage by type');
        }
      })
      .finally(() => {
        if (active && requestId === fuelTypeRequestId.current) {
          setFuelTypeLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [fuelTypeMonth]);

  const fetchPoolVehicleUsage = useCallback(async (month) => {
    const requestId = ++poolRequestId.current;
    setPoolLoading(true);
    setPoolError('');

    try {
      const res = await api.get('/admin/analytics', { params: { month } });
      if (requestId !== poolRequestId.current) {
        return;
      }
      setPoolVehicleUsage(
        (res.data.vehicleUsage || [])
          .filter(vehicle => vehicle.ownership === 'pool')
          .sort((left, right) => left.vehicleNumber.localeCompare(right.vehicleNumber))
      );
    } catch (err) {
      if (requestId === poolRequestId.current) {
        setPoolError(err.response?.data?.error || 'Failed to load pool vehicle usage');
      }
    } finally {
      if (requestId === poolRequestId.current) {
        setPoolLoading(false);
      }
    }
  }, []);

  const fetchOwnershipMileage = useCallback(async (month) => {
    const requestId = ++ownershipRequestId.current;
    setOwnershipLoading(true);
    setOwnershipError('');

    try {
      const res = await api.get('/admin/analytics', { params: { month } });
      if (requestId !== ownershipRequestId.current) {
        return;
      }

      setOwnershipMileage(res.data.ownershipUserMileage || { pool: [], company: [], personal: [] });
    } catch (err) {
      if (requestId === ownershipRequestId.current) {
        setOwnershipError(err.response?.data?.error || 'Failed to load mileage by vehicle type');
      }
    } finally {
      if (requestId === ownershipRequestId.current) {
        setOwnershipLoading(false);
      }
    }
  }, []);

  const refreshAnalytics = () => {
    fetchAnalytics();
    fetchPoolVehicleUsage(poolMonth);
    fetchOwnershipMileage(ownershipMonth);
  };

  const fetchRangeUsage = useCallback(async (filters) => {
    const res = await api.get('/admin/analytics', { params: filters });
    return res.data.rangeUsage || [];
  }, []);

  useEffect(() => {
    const initialRange = getDefaultDateRange();
    const loadTimer = window.setTimeout(() => {
      fetchAnalytics();
      fetchRangeUsage(initialRange)
        .then(rows => {
          setReportUsage(rows);
          setContributionUsage(rows);
        })
        .catch(err => {
          const message = err.response?.data?.error || 'Failed to load date range analytics';
          setReportError(message);
          setContributionError(message);
        });
      fetchRangeUsage({
        ...initialRange,
        month: getCurrentMonth(),
        rangeMode: 'monthly'
      })
        .then(setOperatorUsage)
        .catch(err => {
          setOperatorError(err.response?.data?.error || 'Failed to load monthly recording gaps');
        });
    }, 0);
    const refreshTimer = window.setInterval(() => fetchAnalytics({ background: true }), 15000);

    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [fetchAnalytics, fetchRangeUsage]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => fetchPoolVehicleUsage(poolMonth), 0);

    return () => window.clearTimeout(loadTimer);
  }, [fetchPoolVehicleUsage, poolMonth]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => fetchOwnershipMileage(ownershipMonth), 0);

    return () => window.clearTimeout(loadTimer);
  }, [fetchOwnershipMileage, ownershipMonth]);

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

    if (getInclusiveDateCount(filters.startDate, filters.endDate) > 60) {
      setSectionError('Date range cannot exceed 60 days.');
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

  const searchOperatorUsage = async (event) => {
    event.preventDefault();

    if (operatorFilters.period === 'monthly' && !operatorFilters.month) {
      setOperatorError('Select a month.');
      return;
    }

    const range = operatorFilters.period === 'custom'
      ? { startDate: operatorFilters.startDate, endDate: operatorFilters.endDate }
      : getMonthDateRange(operatorFilters.month);

    if (!range.startDate || !range.endDate) {
      setOperatorError(operatorFilters.period === 'custom'
        ? 'Select both a start date and an end date.'
        : 'Select a month.');
      return;
    }

    if (range.startDate > range.endDate) {
      setOperatorError('End date must be on or after start date.');
      return;
    }

    if (getInclusiveDateCount(range.startDate, range.endDate) > 60) {
      setOperatorError('Date range cannot exceed 60 days.');
      return;
    }

    setOperatorError('');
    setSearchingSection('operator');
    try {
      const rows = await fetchRangeUsage({
        ...range,
        category: operatorFilters.category,
        vehicleNumber: operatorFilters.vehicleNumber,
        rangeMode: operatorFilters.period,
        ...(operatorFilters.period === 'monthly' && { month: operatorFilters.month })
      });
      setOperatorUsage(rows);
      setAppliedOperatorPeriod({
        period: operatorFilters.period,
        month: operatorFilters.month,
        startDate: range.startDate,
        endDate: range.endDate
      });
    } catch (err) {
      setOperatorError(err.response?.data?.error || 'Failed to load analytics for this date range');
    } finally {
      setSearchingSection('');
    }
  };

  const kpis = analytics?.kpis || {};
  const operatorCategories = [...new Set(
    (analytics?.vehicleUsage || []).map(vehicle => vehicle.ownership).filter(Boolean)
  )].sort();
  const operatorVehicleNumbers = (analytics?.vehicleUsage || [])
    .filter(vehicle => !operatorFilters.category || vehicle.ownership === operatorFilters.category)
    .map(vehicle => vehicle.vehicleNumber)
    .sort((left, right) => left.localeCompare(right));
  const isCurrentOperatorMonth = appliedOperatorPeriod.period === 'monthly'
    && appliedOperatorPeriod.month === getCurrentMonth();
  const currentOperatorMonthLabel = formatMonthLabel(appliedOperatorPeriod.month);
  const followingOperatorMonthLabel = appliedOperatorPeriod.month
    ? formatMonthLabel(getFollowingMonth(appliedOperatorPeriod.month))
    : '';
  const completedOperatorGaps = operatorUsage.filter(usage => !usage.isPending).length;
  const pendingOperatorReadings = operatorUsage.filter(usage => usage.isPending).length;
  const reportSummary = useMemo(() => summarizeUsage(reportUsage), [reportUsage]);
  const contributionSummary = useMemo(() => summarizeUsage(contributionUsage), [contributionUsage]);
  const reportDistance = reportUsage.reduce((total, row) => total + row.distance, 0);
  const reportUsers = reportSummary.length;
  const reportVehicles = new Set(reportUsage.map(row => row.vehicleNumber)).size;
  const averageGapDistance = reportUsage.length ? reportDistance / reportUsage.length : 0;
  const divisionFuelUsage = useMemo(() => {
    const divisions = new Map();

    (fuelTypeSummary?.perVehicle || []).forEach(row => {
      const division = row.division || 'Unassigned';
      const current = divisions.get(division) || {
        division,
        liters: 0,
        amount: 0,
        vehicles: new Set()
      };

      current.liters += Number(row.liters) || 0;
      current.amount += Number(row.amount) || 0;
      current.vehicles.add(row.vehicleNumber);
      divisions.set(division, current);
    });

    return Array.from(divisions.values())
      .map(row => ({ ...row, vehicles: row.vehicles.size }))
      .sort((left, right) => right.liters - left.liters || left.division.localeCompare(right.division));
  }, [fuelTypeSummary]);
  const fuelTypePanel = (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Monthly fuel usage</h3>
          <p className="text-sm text-slate-500 mt-1">Fuel totals by type and division from the uploaded fuel report.</p>
        </div>
        <label className="text-xs font-semibold text-slate-500">
          Report month
          <input
            type="month"
            value={fuelTypeMonth}
            onChange={event => {
              setFuelTypeMonth(event.target.value);
              setFuelTypeLoading(true);
              setFuelTypeError('');
            }}
            className="input mt-1 min-w-40"
          />
        </label>
      </div>

      {fuelTypeError ? (
        <p className="px-6 py-5 text-sm text-red-700" role="alert">{fuelTypeError}</p>
      ) : fuelTypeLoading && !fuelTypeSummary ? (
        <p className="px-6 py-5 text-sm text-slate-500">Loading fuel report...</p>
      ) : !fuelTypeSummary?.fuelTypeTotals?.length ? (
        <p className="px-6 py-5 text-sm text-slate-500">No fuel-type report imported for {fuelTypeMonth}.</p>
      ) : (
        <div className={`overflow-x-auto transition-opacity ${fuelTypeLoading ? 'opacity-50' : ''}`}>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Fuel</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Liters</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fuelTypeSummary.fuelTypeTotals.map(item => (
                <tr key={item.fuelType} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-sm font-medium text-slate-900">{item.fuelType}</td>
                  <td className="px-6 py-3 text-right font-mono text-sm text-slate-700">{formatFuelNumber(item.liters)}</td>
                  <td className="px-6 py-3 text-right font-mono text-sm text-slate-700">{formatFuelAmount(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Total</th>
                <th className="px-6 py-3 text-right font-mono text-sm font-semibold text-slate-900">{formatFuelNumber(fuelTypeSummary.totals.totalUsage)}</th>
                <th className="px-6 py-3 text-right font-mono text-sm font-semibold text-slate-900">{formatFuelAmount(fuelTypeSummary.totals.totalAmount)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!fuelTypeError && !(fuelTypeLoading && !fuelTypeSummary) && (
        <div className="border-t border-slate-200">
          <div className="px-6 py-4">
            <h4 className="text-base font-semibold text-slate-950">Fuel usage by division</h4>
            <p className="text-sm text-slate-500 mt-1">Liters and amount summed from vehicle-level fuel transactions.</p>
          </div>
          {divisionFuelUsage.length === 0 ? (
            <p className="px-6 pb-5 text-sm text-slate-500">No vehicle-level fuel usage recorded for {fuelTypeMonth}.</p>
          ) : (
            <div className={`overflow-x-auto transition-opacity ${fuelTypeLoading ? 'opacity-50' : ''}`}>
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Division</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicles</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Liters</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divisionFuelUsage.map(item => (
                    <tr key={item.division} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">{item.division}</td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-slate-700">{formatNumber(item.vehicles)}</td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-slate-700">{formatFuelNumber(item.liters)}</td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-slate-700">{formatFuelAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Total</th>
                    <th className="px-6 py-3 text-right font-mono text-sm font-semibold text-slate-900">
                      {formatNumber(divisionFuelUsage.reduce((total, item) => total + item.vehicles, 0))}
                    </th>
                    <th className="px-6 py-3 text-right font-mono text-sm font-semibold text-slate-900">
                      {formatFuelNumber(divisionFuelUsage.reduce((total, item) => total + item.liters, 0))}
                    </th>
                    <th className="px-6 py-3 text-right font-mono text-sm font-semibold text-slate-900">
                      {formatFuelAmount(divisionFuelUsage.reduce((total, item) => total + item.amount, 0))}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {fuelTypePanel}
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
      <div className="space-y-6">
        {fuelTypePanel}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-red-700 font-medium">{error}</p>
          <button onClick={refreshAnalytics} className="btn-primary mt-4">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin</p>
          <h2 className="text-2xl font-bold text-slate-950 mt-0.5">AutoInsights Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">
            Executive mileage insights across vehicles, drivers, and usage.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-slate-400">
            Updated {analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleString() : '-'}
          </p>
          <button onClick={refreshAnalytics} className="btn-secondary self-start sm:self-auto">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.635 15A8 8 0 1118.364 8.636" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {fuelTypePanel}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <KpiCard
          label="Total Daily Kilometers"
          value={formatKm(kpis.latestDailyKilometers)}
          subtext={kpis.latestUsageDate ? `Last recorded day: ${formatReportDate(kpis.latestUsageDate)}` : 'No daily usage recorded'}
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

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Monthly vehicle mileage rankings</h3>
            <p className="mt-1 text-sm text-slate-500">Compare user and vehicle mileage across Pool, Company, and Personal ownership categories.</p>
          </div>
          <form
            onSubmit={event => {
              event.preventDefault();

              if (!isSelectableMonth(ownershipMonthInput)) {
                setOwnershipError('Select a valid month that is not in the future.');
                return;
              }

              setOwnershipError('');
              if (ownershipMonthInput === ownershipMonth) {
                fetchOwnershipMileage(ownershipMonthInput);
              } else {
                setOwnershipMonth(ownershipMonthInput);
              }
            }}
            className="flex items-end gap-3"
          >
            <label className="text-xs font-semibold text-slate-600">
              Report month
              <input
                type="month"
                value={ownershipMonthInput}
                max={getCurrentMonth()}
                onChange={event => setOwnershipMonthInput(event.target.value)}
                className="input mt-1 h-10 min-w-40"
                required
              />
            </label>
            <button type="submit" className="btn-primary h-10 px-5" disabled={ownershipLoading}>Search</button>
          </form>
        </div>

        {ownershipError ? (
          <p className="px-6 py-5 text-sm text-red-700" role="alert">{ownershipError}</p>
        ) : ownershipLoading && !Object.values(ownershipMileage).some(rows => rows.length > 0) ? (
          <div className="grid min-w-[1180px] grid-cols-3 divide-x divide-slate-200 p-5">
            {[1, 2, 3].map(item => <div key={item} className="mx-4 h-80 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${ownershipLoading ? 'opacity-50' : ''}`}>
            <div className="grid min-w-[1180px] grid-cols-3 divide-x divide-slate-200">
              {Object.keys(ownershipChartStyles).map(ownership => (
                <OwnershipMileageChart
                  key={ownership}
                  ownership={ownership}
                  rows={ownershipMileage[ownership] || []}
                  onExpand={() => setExpandedOwnership(ownership)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {
      // Monthly pool vehicle usage section
      }
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-950">Monthly pool vehicle usage</h3>
            </div>
            <p className="text-sm text-slate-500 mt-1">Total mileage, number of days used, and average mileage per day for each pool vehicle in the selected month.</p>
          </div>
          <label className="text-xs font-semibold text-slate-500 shrink-0">
            Select month
            <input
              type="month"
              value={poolMonthInput}
              max={getCurrentMonth()}
              onChange={event => {
                setPoolMonthInput(event.target.value);
                if (isSelectableMonth(event.target.value)) {
                  setPoolMonth(event.target.value);
                }
              }}
              onBlur={() => setPoolMonthInput(poolMonth)}
              className="input mt-1 min-w-40"
            />
          </label>
        </div>

        {poolError ? (
          <p className="px-6 py-5 text-sm text-red-700">{poolError}</p>
        ) : poolLoading && poolVehicleUsage.length === 0 ? (
          <p className="px-6 py-5 text-sm text-slate-500">Loading pool vehicle usage...</p>
        ) : poolVehicleUsage.length === 0 ? (
          <EmptyState title="No pool vehicles" text="Registered pool vehicles will appear here automatically." />
        ) : (
          <div className={`grid grid-cols-2 gap-y-4 gap-x-10 p-6 transition-opacity ${poolLoading ? 'opacity-50' : ''}`}>
            {poolVehicleUsage.map(vehicle => (
              <div key={vehicle.vehicleNumber} className="min-w-0 rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="font-mono text-sm font-bold text-brand-700 truncate">{vehicle.vehicleNumber}</p>
                <p className="text-xs text-slate-500 mt-1 truncate">{[vehicle.make, vehicle.name, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details unavailable'}</p>
                <p className="text-2xl font-bold text-slate-950 mt-4">{formatKm(vehicle.monthDistance)}</p>
                <p className="text-xs text-slate-500 mt-1">Total mileage for the month</p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{formatNumber(vehicle.monthDaysUsed)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Days used</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{formatKm(vehicle.monthDaysUsed ? vehicle.monthDistance / vehicle.monthDaysUsed : 0)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Average per day</p>
                  </div>
                </div>
              </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-950">Operator &amp; Vehicle Recording Gaps</h3>
              {isCurrentOperatorMonth && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                  Month in progress
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">First-to-last odometer difference for each continuous operator and vehicle session.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="text-slate-500">{completedOperatorGaps} completed {completedOperatorGaps === 1 ? 'gap' : 'gaps'}</span>
              {pendingOperatorReadings > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  {pendingOperatorReadings} awaiting next reading
                </span>
              )}
            </div>
          </div>
          <form onSubmit={searchOperatorUsage} className="w-full xl:max-w-4xl rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <SearchableDropdown
                label="Category"
                value={operatorFilters.category}
                placeholder="All categories"
                options={[
                  { value: '', label: 'All categories' },
                  ...operatorCategories.map(category => ({
                    value: category,
                    label: category.charAt(0).toUpperCase() + category.slice(1)
                  }))
                ]}
                onChange={category => setOperatorFilters(previous => ({
                    ...previous,
                    category,
                    vehicleNumber: ''
                  }))}
              />
              <SearchableDropdown
                label="Select Vehicle No"
                value={operatorFilters.vehicleNumber}
                placeholder="All vehicles"
                options={[
                  { value: '', label: 'All vehicles' },
                  ...operatorVehicleNumbers.map(vehicleNumber => ({
                    value: vehicleNumber,
                    label: vehicleNumber
                  }))
                ]}
                onChange={vehicleNumber => setOperatorFilters(previous => ({
                  ...previous,
                  vehicleNumber
                }))}
              />
              {operatorFilters.period === 'monthly' ? (
                <label className="text-xs font-semibold text-slate-600">
                  Monthly
                  <input
                    type="month"
                    value={operatorFilters.month}
                    max={getCurrentMonth()}
                    onChange={event => setOperatorFilters(previous => ({
                      ...previous,
                      month: event.target.value
                    }))}
                    className="input mt-1 h-10 w-full"
                  />
                </label>
              ) : (
                <div className="sm:col-span-2 xl:col-span-1 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    From date
                    <input
                      type="date"
                      value={operatorFilters.startDate}
                      max={operatorFilters.endDate || getDateInputValue(new Date())}
                      onChange={event => setOperatorFilters(previous => ({
                        ...previous,
                        startDate: event.target.value
                      }))}
                      className="input mt-1 h-10 w-full"
                      required
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    To date
                    <input
                      type="date"
                      value={operatorFilters.endDate}
                      min={operatorFilters.startDate || undefined}
                      max={operatorFilters.startDate
                        ? [getMaximumRangeEndDate(operatorFilters.startDate), getDateInputValue(new Date())].sort()[0]
                        : getDateInputValue(new Date())}
                      onChange={event => setOperatorFilters(previous => ({
                        ...previous,
                        endDate: event.target.value
                      }))}
                      className="input mt-1 h-10 w-full"
                      required
                    />
                  </label>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setOperatorFilters(previous => ({
                    ...previous,
                    period: previous.period === 'monthly' ? 'custom' : 'monthly'
                  }))}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  {operatorFilters.period === 'monthly' ? 'Custom' : 'Monthly'}
                </button>
                <button
                  type="submit"
                  className="btn-primary h-10 px-4 text-sm whitespace-nowrap"
                  disabled={searchingSection === 'operator'}
                >
                  {searchingSection === 'operator' ? 'Searching...' : 'Apply'}
                </button>
              </div>
            </div>
            {operatorFilters.period === 'monthly' ? (
              <p className="mt-2 text-xs text-slate-500">
                Monthly results include all readings from the selected month and the first available reading from the following month for the same user and vehicle.
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Custom date range is limited to 60 days and does not include readings outside the selected dates.</p>
            )}
            {operatorError && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{operatorError}</p>}
          </form>
        </div>

        {isCurrentOperatorMonth && (
          <div className="border-b border-blue-100 bg-blue-50/70 px-6 py-4" role="status">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm" aria-hidden="true">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-blue-950">{currentOperatorMonthLabel} mileage is still in progress</p>
                <p className="mt-1 text-xs leading-5 text-blue-800">
                  Final mileage for {currentOperatorMonthLabel} will be available after the mandatory reading is submitted during the first five days of {followingOperatorMonthLabel}. Values currently shown are provisional and may not represent the complete month.
                </p>
              </div>
            </div>
          </div>
        )}

        {operatorUsage.length === 0 ? (
          <EmptyState title="No readings in this range" text="Monthly readings and completed mileage gaps will appear here." />
        ) : (
          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[9%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[6%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 pl-4 pr-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">User / Driver</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vehicle</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">First recording</th>
                  <th className="px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last recording</th>
                  <th className="px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Start km</th>
                  <th className="px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">End km</th>
                  <th className="px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mileage Gap</th>
                  <th className="px-1 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Days</th>
                  <th className="py-3 pl-1 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 break-words">Recordings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operatorUsage.map(usage => (
                  <tr
                    key={usage.key}
                    onClick={() => setSelectedUsage(usage)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedUsage(usage);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${usage.isPending ? 'pending reading' : 'recordings'} for ${usage.name} and vehicle ${usage.vehicleNumber}`}
                    className={`cursor-pointer align-top transition-colors focus:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 ${usage.isPending ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <td className="py-4 pl-4 pr-2">
                      <div className="group text-left">
                        <span className="block break-words text-sm font-semibold text-slate-950 group-hover:text-brand-700">{usage.name}</span>
                        <span className="mt-1 block text-xs capitalize text-slate-500">
                          {usage.employeeId || usage.username || usage.role}
                        </span>
                        <span className="mt-1.5 block text-[11px] font-semibold text-brand-600 group-hover:text-brand-700">View readings</span>
                      </div>
                    </td>
                    <td className="break-words px-2 py-4 font-mono text-xs font-semibold text-slate-900">{usage.vehicleNumber}</td>
                    <td className="px-2 py-4 text-xs leading-5 text-slate-600">{formatReadingTime(usage.startReadingAt)}</td>
                    <td className="px-2 py-4 text-xs leading-5 text-slate-600">
                      {usage.isPending ? (
                        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold leading-4 text-amber-800">Awaiting next reading</span>
                      ) : formatReadingTime(usage.endReadingAt)}
                    </td>
                    <td className="px-2 py-4 text-right font-mono text-xs text-slate-700">{formatNumber(usage.startMileage)}</td>
                    <td className="px-2 py-4 text-right font-mono text-xs text-slate-700">{usage.isPending ? '-' : formatNumber(usage.endMileage)}</td>
                    <td className="px-2 py-4 text-right font-mono text-xs font-bold text-brand-700">
                      {usage.isPending ? <span className="text-amber-700">Pending</span> : formatKm(usage.distance)}
                    </td>
                    <td className="px-1 py-4 text-right font-mono text-xs font-semibold text-slate-700" title="Calendar days between the first and last recordings">{usage.isPending ? '-' : formatNumber(usage.daysBetween)}</td>
                    <td className="py-4 pl-1 pr-4 text-right font-mono text-xs font-semibold text-slate-900">{formatNumber(usage.readingCount)}</td>
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

      {selectedUsage && (
        <ReadingDetailsModal usage={selectedUsage} onClose={() => setSelectedUsage(null)} />
      )}

      {expandedOwnership && (
        <OwnershipMileageModal
          ownership={expandedOwnership}
          rows={ownershipMileage[expandedOwnership] || []}
          month={ownershipMonth}
          onClose={() => setExpandedOwnership(null)}
        />
      )}

    </div>
  );
};

export default AnalyticsDashboard;
