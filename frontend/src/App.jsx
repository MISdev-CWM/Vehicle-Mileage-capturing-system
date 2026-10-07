import { useEffect, useState } from 'react';
import api from './api';
import AdminDashboard from './components/AdminDashboard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import CompanyDriverManagement from './components/CompanyDriverManagement';
import EmployeeManagement from './components/EmployeeManagement';
import LoginPage from './components/LoginPage';
import MeterCapture from './components/MeterCapture';
import ReadingHistory from './components/ReadingHistory';
import ReadingsAdmin from './components/ReadingsAdmin';
import VehicleManagement from './components/VehicleManagement';

const adminNavItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/admin/dashboard',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 13h6V4H4v9zm10 7h6V4h-6v16zM4 20h6v-5H4v5z" />
      </svg>
    )
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/admin/analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l3-3 3 2 5-7" />
      </svg>
    )
  },
  {
    id: 'employees',
    label: 'Users',
    path: '/admin/users',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm6 2a3 3 0 100-6" />
      </svg>
    )
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    path: '/admin/vehicles',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
      </svg>
    )
  },
  {
    id: 'companyDrivers',
    label: 'Company Drivers',
    path: '/admin/company-drivers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 10-8 0v4M5 11h14l-1 9H6l-1-9z" />
      </svg>
    )
  },
  {
    id: 'readings',
    label: 'Readings',
    path: '/admin/readings',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )
  }
];

const defaultAdminPath = '/admin/dashboard';

const getAdminPageFromPath = (pathname) => (
  adminNavItems.find(item => item.path === pathname)?.id || 'dashboard'
);

const isAdminPath = (pathname) => adminNavItems.some(item => item.path === pathname);

const getUserVehicleOptions = (user) => {
  if (!user || user.role === 'admin') {
    return [];
  }

  const assignedVehicles = Array.isArray(user.assignedVehicles)
    ? user.assignedVehicles.filter(vehicle => vehicle?.vehicleNumber)
    : [];

  if (assignedVehicles.length > 0) {
    return assignedVehicles;
  }

  if (user.vehicleId) {
    return [{
      id: user.vehicleId,
      vehicleNumber: user.vehicleId,
      make: '',
      name: '',
      model: '',
      ownership: ''
    }];
  }

  return [];
};

const getVehicleLabel = (vehicle) => {
  const details = [vehicle.make, vehicle.name, vehicle.model].filter(Boolean).join(' ');
  return details ? `${vehicle.vehicleNumber} - ${details}` : vehicle.vehicleNumber;
};

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminPage, setAdminPage] = useState(() => getAdminPageFromPath(window.location.pathname));
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState('');

  // Driver login: vehicle & driver name dropdowns
  const [driverOptions, setDriverOptions] = useState({ vehicles: [], companyDrivers: [] });
  const [driverOptionsLoaded, setDriverOptionsLoaded] = useState(false);
  const [selectedDriverVehicle, setSelectedDriverVehicle] = useState('');
  const [selectedDriverName, setSelectedDriverName] = useState('');
  const [driverSelectionConfirmed, setDriverSelectionConfirmed] = useState(false);
  const [driverOptionsError, setDriverOptionsError] = useState(null);

  useEffect(() => {
    const loadSession = async () => {
      const token = localStorage.getItem('authToken');

      if (!token) {
        setAuthChecked(true);
        return;
      }

      try {
        const res = await api.get('/auth/me');
        setUser(res.data.user);
      } catch {
        localStorage.removeItem('authToken');
      } finally {
        setAuthChecked(true);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    const handleBrowserNavigation = () => {
      setAdminPage(getAdminPageFromPath(window.location.pathname));
    };

    window.addEventListener('popstate', handleBrowserNavigation);
    return () => window.removeEventListener('popstate', handleBrowserNavigation);
  }, []);

  useEffect(() => {
    if (!authChecked || !user) {
      return;
    }

    if (user.role === 'admin' && !isAdminPath(window.location.pathname)) {
      window.history.replaceState({}, '', defaultAdminPath);
      setAdminPage('dashboard');
    }

    if (user.role !== 'admin' && window.location.pathname.startsWith('/admin')) {
      window.history.replaceState({}, '', '/');
    }
  }, [authChecked, user]);

  // Auto-load vehicle & driver name options when a driver logs in
  useEffect(() => {
    if (!user || user.role !== 'driver') return;
    const loadOptions = async () => {
      setDriverOptionsError(null);
      try {
        const res = await api.get('/readings/options');
        setDriverOptions(res.data);
        setDriverOptionsLoaded(true);
      } catch {
        setDriverOptionsError('Failed to load options. Please retry.');
      }
    };
    loadOptions();
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.history.replaceState({}, '', '/');
    setUser(null);
    setAdminPage('dashboard');
    setSelectedVehicleNumber('');
    setSelectedDriverVehicle('');
    setSelectedDriverName('');
    setDriverSelectionConfirmed(false);
    setDriverOptionsLoaded(false);
  };

  const navigateToAdminPage = (path) => {
    if (window.location.pathname === path) {
      return;
    }

    window.history.pushState({}, '', path);
    setAdminPage(getAdminPageFromPath(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">Loading session...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  const isAdmin = user.role === 'admin';
  const isDriver = user.role === 'driver';
  const userVehicleOptions = getUserVehicleOptions(user);
  const selectedVehicleIsAssigned = userVehicleOptions.some(vehicle => vehicle.vehicleNumber === selectedVehicleNumber);
  const assignedVehicle = selectedVehicleIsAssigned
    ? selectedVehicleNumber
    : userVehicleOptions[0]?.vehicleNumber || '';
  const selectedVehicle = userVehicleOptions.find(vehicle => vehicle.vehicleNumber === assignedVehicle);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Fleet Mileage</h1>
              <p className="text-xs text-slate-500">{isAdmin ? 'Admin control panel' : 'OCR-powered odometer tracking'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isAdmin && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                <span className="text-xs text-slate-500 font-medium">Vehicle</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{assignedVehicle || 'Unassigned'}</span>
              </div>
            )}
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary px-3 py-1.5 text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className={isAdmin ? 'w-full flex-1' : 'max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex-1'}>
        {isAdmin ? (
          <div className="lg:flex lg:min-h-[calc(100vh-4rem)]">
            <aside className="bg-white border-b border-slate-200 lg:w-64 lg:border-b-0 lg:border-r lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]">
              <div className="px-4 sm:px-6 lg:px-4 py-4 lg:py-6">
                <div className="hidden lg:block mb-6">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin Menu</p>
                </div>
                <nav className="flex lg:flex-col gap-2 overflow-x-auto">
                  {adminNavItems.map(item => {
                    const isActive = adminPage === item.id;

                    return (
                      <a
                        key={item.id}
                        href={item.path}
                        onClick={(event) => {
                          event.preventDefault();
                          navigateToAdminPage(item.path);
                        }}
                        className={`shrink-0 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          isActive
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </a>
                    );
                  })}
                </nav>
              </div>
            </aside>

            <section className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8">
              <div className="max-w-6xl mx-auto">
                {adminPage === 'vehicles' ? (
                  <VehicleManagement />
                ) : adminPage === 'companyDrivers' ? (
                  <CompanyDriverManagement />
                ) : adminPage === 'employees' ? (
                  <EmployeeManagement />
                ) : adminPage === 'analytics' ? (
                  <AnalyticsDashboard />
                ) : adminPage === 'readings' ? (
                  <ReadingsAdmin />
                ) : (
                  <AdminDashboard />
                )}
              </div>
            </section>
          </div>
        ) : isDriver ? (
          // ── Driver login workspace ─────────────────────────────────────
          <div className="space-y-6">
            {/* Step 1: Vehicle + Driver Name selection */}
            {!driverSelectionConfirmed ? (
              <div className="max-w-xl mx-auto mt-8">
                <div className="card space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Driver Workspace</p>
                    <h2 className="text-xl font-bold text-slate-900">Before You Scan</h2>
                    <p className="text-sm text-slate-500 mt-1">Select your vehicle and name to continue.</p>
                  </div>

                  {/* Loading state */}
                  {!driverOptionsLoaded && !driverOptionsError && (
                    <div className="flex items-center gap-3 py-2 text-slate-500">
                      <svg className="animate-spin h-5 w-5 text-brand-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-sm">Loading options...</span>
                    </div>
                  )}

                  {driverOptionsError && (
                    <div className="space-y-2">
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{driverOptionsError}</p>
                      <button
                        onClick={async () => {
                          setDriverOptionsError(null);
                          try {
                            const res = await api.get('/readings/options');
                            setDriverOptions(res.data);
                            setDriverOptionsLoaded(true);
                          } catch {
                            setDriverOptionsError('Failed to load options. Please try again.');
                          }
                        }}
                        className="btn-secondary w-full text-sm"
                      >
                        ↺ Retry
                      </button>
                    </div>
                  )}

                  {driverOptionsLoaded && (
                    <>
                      {/* Vehicle dropdown */}
                      <div>
                        <label htmlFor="driverVehicleSelect" className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Vehicle <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="driverVehicleSelect"
                          value={selectedDriverVehicle}
                          onChange={e => setSelectedDriverVehicle(e.target.value)}
                          className="input"
                        >
                          <option value="">— Select a vehicle —</option>
                          {driverOptions.vehicles.map(v => (
                            <option key={v._id} value={v.vehicleNumber}>
                              {v.vehicleNumber}{v.make || v.name ? ` — ${[v.make, v.name, v.model].filter(Boolean).join(' ')}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Driver Name dropdown */}
                      <div>
                        <label htmlFor="driverNameSelect" className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Driver Name <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="driverNameSelect"
                          value={selectedDriverName}
                          onChange={e => setSelectedDriverName(e.target.value)}
                          className="input"
                        >
                          <option value="">— Select your name —</option>
                          {driverOptions.companyDrivers.map(d => (
                            <option key={d._id} value={d.employeeName}>
                              {d.employeeId} — {d.employeeName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => {
                          if (!selectedDriverVehicle || !selectedDriverName) return;
                          setDriverSelectionConfirmed(true);
                        }}
                        disabled={!selectedDriverVehicle || !selectedDriverName}
                        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✓ Confirm &amp; Proceed to Scan
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // Step 2: Odometer scan
              <div className="space-y-6">
                <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Driver Workspace</p>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">{selectedDriverVehicle}</h2>
                    <p className="text-sm text-slate-500 mt-1">Driver: {selectedDriverName}</p>
                  </div>
                  <button
                    onClick={() => setDriverSelectionConfirmed(false)}
                    className="btn-secondary text-sm px-3 py-1.5"
                  >
                    ✎ Change Selection
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                      <h2 className="text-lg font-semibold text-slate-900">New Reading</h2>
                    </div>
                    <MeterCapture
                      key={`capture-driver-${selectedDriverVehicle}`}
                      vehicleId={selectedDriverVehicle}
                      driverName={selectedDriverName}
                    />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">History &amp; Stats</h2>
                    <ReadingHistory key={`history-driver-${selectedDriverVehicle}`} vehicleId={selectedDriverVehicle} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : assignedVehicle ? (
          <div className="space-y-6">
            <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {user.role === 'driver' ? 'Driver Workspace' : 'User Workspace'}
                </p>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{assignedVehicle}</h2>
                {selectedVehicle && (
                  <p className="text-sm text-slate-500 mt-1">
                    {[selectedVehicle.make, selectedVehicle.name, selectedVehicle.model].filter(Boolean).join(' ') || 'Assigned vehicle'}
                  </p>
                )}
              </div>

              {userVehicleOptions.length > 1 ? (
                <div className="w-full sm:w-80">
                  <label htmlFor="vehicleSelector" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Assigned Vehicle
                  </label>
                  <select
                    id="vehicleSelector"
                    value={assignedVehicle}
                    onChange={(event) => setSelectedVehicleNumber(event.target.value)}
                    className="input"
                  >
                    {userVehicleOptions.map(vehicle => (
                      <option key={vehicle.id || vehicle.vehicleNumber} value={vehicle.vehicleNumber}>
                        {getVehicleLabel(vehicle)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{assignedVehicle}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                  <h2 className="text-lg font-semibold text-slate-900">New Reading</h2>
                </div>
                <MeterCapture key={`capture-${assignedVehicle}`} vehicleId={assignedVehicle} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">History & Stats</h2>
                <ReadingHistory key={`history-${assignedVehicle}`} vehicleId={assignedVehicle} />
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto mt-16">
            <div className="card text-center">
              <h2 className="text-xl font-bold text-slate-900 mb-2">No Vehicle Assigned</h2>
              <p className="text-slate-500">Please contact an admin to assign a vehicle before recording mileage.</p>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-slate-400">
          Images are processed in-memory and never stored. Powered by EasyOCR.
        </div>
      </footer>
    </div>
  );
}

export default App;
