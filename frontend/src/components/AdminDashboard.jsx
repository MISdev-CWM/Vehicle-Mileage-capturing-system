import { useEffect, useState } from 'react';
import api from '../api';

const StatCard = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="card p-4">
    <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">{label}</p>
  </div>
);

const AdminDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAdminData = async () => {
    const [summaryRes, usersRes] = await Promise.all([
      api.get('/admin/summary'),
      api.get('/admin/users')
    ]);

    return { summary: summaryRes.data, users: usersRes.data };
  };

  const fetchAdminData = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await loadAdminData();
      setSummary(data.summary);
      setUsers(data.users);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      try {
        const data = await loadAdminData();

        if (!isActive) {
          return;
        }

        setSummary(data.summary);
        setUsers(data.users);
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load admin data');
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

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-24 bg-white border border-slate-200 rounded-xl" />)}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchAdminData} className="btn-primary mt-4">Retry</button>
      </div>
    );
  }

  const totals = summary?.totals || {};

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">Monitor users, vehicles, and readings.</p>
        </div>
        <button onClick={fetchAdminData} className="btn-secondary self-start sm:self-auto">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Readings" value={totals.readings || 0} accent="text-brand-700" />
        <StatCard label="Vehicles" value={totals.vehicles || 0} accent="text-emerald-600" />
        <StatCard label="Users" value={totals.users || 0} />
        <StatCard label="Corrections" value={totals.correctedReadings || 0} accent="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Recent Readings</h3>
              <span className="text-xs text-slate-500">{summary?.recentReadings?.length || 0} shown</span>
            </div>

            {!summary?.recentReadings?.length ? (
              <div className="text-center py-12 text-slate-500">No readings captured yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Vehicle</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Mileage</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.recentReadings.map(reading => (
                      <tr key={reading._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 font-mono text-sm font-semibold text-slate-900">{reading.vehicleId}</td>
                        <td className="py-3 text-right font-mono text-sm text-slate-900">
                          {reading.extractedMileage?.toLocaleString()} km
                        </td>
                        <td className="py-3 text-sm text-slate-600">
                          {new Date(reading.readingDate).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-8">
          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Vehicles</h3>
            {!summary?.vehicles?.length ? (
              <p className="text-sm text-slate-500">No vehicles yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.vehicles.map(vehicle => (
                  <span key={vehicle} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-mono font-semibold">
                    {vehicle}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Users</h3>
            <div className="space-y-3">
              {users.map(user => (
                <div key={user._id} className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    ['admin', 'superadmin', 'super_admin', 'super admin', 'super-admin'].includes(user.role) ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {user.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
