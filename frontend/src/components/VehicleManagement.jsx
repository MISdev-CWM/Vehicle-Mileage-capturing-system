import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

const emptyForm = {
  vehicleNumber: '',
  make: '',
  name: '',
  model: '',
  engineCapacity: '',
  manufacturingYear: '',
  status: 'active',
  ownership: 'company',
  allocatedUser: '',
  allocatedDrivers: [],
  dateOfPurchasing: '',
  dateOfUserAllocation: ''
};

const emptyAssignmentForm = {
  ownership: 'company',
  allocatedUser: '',
  allocatedDrivers: []
};

const formatDateInput = (value) => {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
};

const formatDateDisplay = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
};

const formatDateTimeDisplay = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatUserName = (user) => {
  if (!user) return 'Unknown user';
  const name = user.name || user.username || 'Unknown user';

  return user.username ? `${name} (${user.username})` : name;
};

const getCurrentAllocationEntries = (vehicle) => {
  const activeEntries = (vehicle.allocationHistory || []).filter(entry => !entry.unassignedAt);

  if (activeEntries.length > 0) {
    return activeEntries;
  }

  if (vehicle.ownership === 'personal' && vehicle.allocatedUser) {
    return [{
      _id: vehicle.allocatedUser._id,
      user: vehicle.allocatedUser,
      assignedAt: vehicle.dateOfUserAllocation
    }];
  }

  return (vehicle.allocatedDrivers || []).map(driver => ({
    _id: driver._id,
    user: driver,
    assignedAt: vehicle.dateOfUserAllocation
  }));
};

const VehicleManagement = () => {
  const [vehicles, setVehicles] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [driverUsers, setDriverUsers] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentVehicle, setAssignmentVehicle] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchVehicles = async (searchValue = search) => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/vehicles', {
        params: searchValue ? { search: searchValue } : {}
      });
      setVehicles(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadData = async () => {
      try {
        const [vehiclesRes, usersRes, driversRes] = await Promise.all([
          api.get('/vehicles'),
          api.get('/users', { params: { assignable: true } }),
          api.get('/users', { params: { role: 'driver', active: true } })
        ]);

        if (!isActive) {
          return;
        }

        setVehicles(vehiclesRes.data);
        setAssignableUsers(usersRes.data);
        setDriverUsers(driversRes.data);
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load vehicles');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isActive = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleOwnershipChange = (value) => {
    setFormData(prev => ({
      ...prev,
      ownership: value,
      allocatedUser: value === 'personal' ? prev.allocatedUser : '',
      allocatedDrivers: value === 'company' ? prev.allocatedDrivers : []
    }));
  };

  const handleDriverToggle = (driverId) => {
    setFormData(prev => {
      const isSelected = prev.allocatedDrivers.includes(driverId);

      return {
        ...prev,
        allocatedDrivers: isSelected
          ? prev.allocatedDrivers.filter(id => id !== driverId)
          : [...prev.allocatedDrivers, driverId]
      };
    });
  };

  const handleAssignmentDriverToggle = (driverId) => {
    setAssignmentForm(prev => {
      const isSelected = prev.allocatedDrivers.includes(driverId);

      return {
        ...prev,
        allocatedDrivers: isSelected
          ? prev.allocatedDrivers.filter(id => id !== driverId)
          : [...prev.allocatedDrivers, driverId]
      };
    });
  };

  const openCreateModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setError('');
    setIsModalOpen(false);
  };

  const openAssignmentModal = (vehicle) => {
    setAssignmentVehicle(vehicle);
    setAssignmentForm({
      ownership: vehicle.ownership || 'company',
      allocatedUser: vehicle.allocatedUser?._id || '',
      allocatedDrivers: vehicle.allocatedDrivers?.map(driver => driver._id) || []
    });
    setError('');
    setSuccess('');
    setIsAssignmentModalOpen(true);
  };

  const closeAssignmentModal = () => {
    setAssignmentVehicle(null);
    setAssignmentForm(emptyAssignmentForm);
    setError('');
    setIsAssignmentModalOpen(false);
  };

  const openHistoryModal = (vehicle) => {
    setHistoryVehicle(vehicle);
    setIsHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    setHistoryVehicle(null);
    setIsHistoryModalOpen(false);
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();

    if (!assignmentVehicle) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.patch(`/vehicles/${assignmentVehicle._id}/assignment`, {
        allocatedUser: assignmentForm.ownership === 'personal' ? (assignmentForm.allocatedUser || null) : null,
        allocatedDrivers: assignmentForm.ownership === 'company' ? assignmentForm.allocatedDrivers : []
      });
      closeAssignmentModal();
      setSuccess('Vehicle user assignment changed successfully');
      await fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change vehicle user');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...formData,
        allocatedUser: formData.ownership === 'personal' ? (formData.allocatedUser || null) : null,
        allocatedDrivers: formData.ownership === 'company' ? formData.allocatedDrivers : []
      };

      if (editingId) {
        await api.put(`/vehicles/${editingId}`, payload);
        setSuccess('Vehicle updated successfully');
      } else {
        await api.post('/vehicles', payload);
        setSuccess('Vehicle created successfully');
      }

      closeModal();
      await fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingId(vehicle._id);
    setFormData({
      vehicleNumber: vehicle.vehicleNumber || '',
      make: vehicle.make || '',
      name: vehicle.name || '',
      model: vehicle.model || '',
      engineCapacity: vehicle.engineCapacity || '',
      manufacturingYear: vehicle.manufacturingYear?.toString() || '',
      status: vehicle.status || 'active',
      ownership: vehicle.ownership || 'company',
      allocatedUser: vehicle.allocatedUser?._id || '',
      allocatedDrivers: vehicle.allocatedDrivers?.map(driver => driver._id) || [],
      dateOfPurchasing: formatDateInput(vehicle.dateOfPurchasing),
      dateOfUserAllocation: formatDateInput(vehicle.dateOfUserAllocation)
    });
    setSuccess('');
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (vehicle) => {
    setError('');
    setSuccess('');
    setDeletingVehicle(vehicle);
  };

  const confirmDelete = async () => {
    if (!deletingVehicle) return;

    try {
      await api.delete(`/vehicles/${deletingVehicle._id}`);
      setDeletingVehicle(null);
      setSuccess('Vehicle deleted successfully');
      await fetchVehicles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete vehicle');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchVehicles(search.trim());
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Vehicle Management</h2>
          <p className="text-sm text-slate-500 mt-1">Create, view, update, delete, and allocate vehicles.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreateModal} className="btn-primary self-start sm:self-auto">
            Create Vehicle
          </button>
          <button onClick={() => fetchVehicles()} className="btn-secondary self-start sm:self-auto">
            Refresh
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      {!isModalOpen && !isAssignmentModalOpen && !isHistoryModalOpen && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Vehicles</h3>
            <p className="text-xs text-slate-500 mt-1">{vehicles.length} records</p>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-52"
              placeholder="Search"
            />
            <button type="submit" className="btn-secondary">
              Search
            </button>
          </form>
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(item => <div key={item} className="h-12 bg-slate-100 rounded-lg" />)}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No vehicles found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Vehicle Number</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Ownership</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Allocated User/Drivers</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Purchase Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Allocation Date</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map(vehicle => (
                  <tr
                    key={vehicle._id}
                    onClick={() => openHistoryModal(vehicle)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    title="View allocation history"
                  >
                    <td className="py-3 font-mono text-sm font-semibold text-slate-900">{vehicle.vehicleNumber}</td>
                    <td className="py-3 text-sm text-slate-900">{[vehicle.make, vehicle.name].filter(Boolean).join(' ') || '-'}</td>
                    <td className="py-3 text-sm text-slate-700 capitalize">{vehicle.ownership}</td>
                    <td className="py-3 text-sm text-slate-700">
                      {vehicle.ownership === 'company'
                        ? (vehicle.allocatedDrivers?.length
                            ? vehicle.allocatedDrivers.map(driver => driver.name).join(', ')
                            : '-')
                        : (vehicle.allocatedUser ? `${vehicle.allocatedUser.name} (${vehicle.allocatedUser.username})` : '-')}
                    </td>
                    <td className="py-3 text-sm text-slate-700">{formatDateDisplay(vehicle.dateOfPurchasing)}</td>
                    <td className="py-3 text-sm text-slate-700">{formatDateDisplay(vehicle.dateOfUserAllocation)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={(event) => { event.stopPropagation(); handleEdit(vehicle); }} className="btn-secondary px-3 py-1.5 text-xs">
                          Edit
                        </button>
                        <button onClick={(event) => { event.stopPropagation(); openAssignmentModal(vehicle); }} className="btn-primary px-3 py-1.5 text-xs whitespace-nowrap">
                          Change User
                        </button>
                        <button onClick={(event) => { event.stopPropagation(); handleDelete(vehicle); }} className="btn-danger px-3 py-1.5 text-xs">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && createPortal((
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md"
          role="presentation"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
            <div className="shrink-0 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Update Vehicle' : 'Create Vehicle'}
              </h3>
              <button onClick={closeModal} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="min-h-0 flex-1 flex flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Vehicle Number</label>
                  <input
                    type="text"
                    value={formData.vehicleNumber}
                    onChange={(e) => handleChange('vehicleNumber', e.target.value)}
                    className="input uppercase"
                    placeholder="VH-2024-001"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Make</label>
                    <input
                      type="text"
                      value={formData.make}
                      onChange={(e) => handleChange('make', e.target.value)}
                      className="input"
                      placeholder="Toyota"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      className="input"
                      placeholder="HiAce"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Model</label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => handleChange('model', e.target.value)}
                      className="input"
                      placeholder="KDH"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Engine Capacity</label>
                    <input
                      type="text"
                      value={formData.engineCapacity}
                      onChange={(e) => handleChange('engineCapacity', e.target.value)}
                      className="input"
                      placeholder="2500cc"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Manufacturing Year</label>
                    <input
                      type="number"
                      value={formData.manufacturingYear}
                      onChange={(e) => handleChange('manufacturingYear', e.target.value)}
                      className="input"
                      min="1900"
                      max="2100"
                      placeholder="2024"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="input"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {!editingId && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Ownership</label>
                        <select
                          value={formData.ownership}
                          onChange={(e) => handleOwnershipChange(e.target.value)}
                          className="input"
                        >
                          <option value="company">Company</option>
                          <option value="personal">Personal</option>
                        </select>
                      </div>

                      {formData.ownership === 'personal' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated User</label>
                          <select
                            value={formData.allocatedUser}
                            onChange={(e) => handleChange('allocatedUser', e.target.value)}
                            className="input"
                          >
                            <option value="">Unassigned</option>
                            {assignableUsers.map(user => (
                              <option key={user._id} value={user._id}>
                                {user.employeeId ? `${user.employeeId} - ` : ''}{user.name} ({user.username})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {formData.ownership === 'company' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated Drivers</label>
                        <div className="border border-slate-300 rounded-lg bg-white max-h-40 overflow-y-auto p-2">
                          {driverUsers.length === 0 ? (
                            <p className="text-sm text-slate-500 px-2 py-3">No driver-role users available</p>
                          ) : (
                            <div className="space-y-1">
                              {driverUsers.map(driver => (
                                <label key={driver._id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={formData.allocatedDrivers.includes(driver._id)}
                                    onChange={() => handleDriverToggle(driver._id)}
                                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-slate-900 truncate">{driver.name}</span>
                                    <span className="block text-xs text-slate-500 truncate">
                                      {driver.employeeId ? `${driver.employeeId} - ` : ''}{driver.username}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Purchasing</label>
                    <input
                      type="date"
                      value={formData.dateOfPurchasing}
                      onChange={(e) => handleChange('dateOfPurchasing', e.target.value)}
                      className="input"
                    />
                  </div>
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of User Allocation</label>
                      <input
                        type="date"
                        value={formData.dateOfUserAllocation}
                        onChange={(e) => handleChange('dateOfUserAllocation', e.target.value)}
                        className="input"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary min-w-36">
                  {saving ? 'Saving...' : editingId ? 'Update Vehicle' : 'Create Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {isAssignmentModalOpen && assignmentVehicle && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Change User</h3>
                <p className="text-sm text-slate-500 mt-1">{assignmentVehicle.vehicleNumber}</p>
              </div>
              <button onClick={closeAssignmentModal} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Close
              </button>
            </div>

            <form onSubmit={handleAssignmentSubmit}>
              <div className="px-6 py-5 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                {assignmentForm.ownership === 'personal' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated User</label>
                    <select
                      value={assignmentForm.allocatedUser}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, allocatedUser: e.target.value }))}
                      className="input"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map(user => (
                        <option key={user._id} value={user._id}>
                          {user.employeeId ? `${user.employeeId} - ` : ''}{user.name} ({user.username})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated Drivers</label>
                    <div className="border border-slate-300 rounded-lg bg-white max-h-64 overflow-y-auto p-2">
                      {driverUsers.length === 0 ? (
                        <p className="text-sm text-slate-500 px-2 py-3">No driver-role users available</p>
                      ) : (
                        <div className="space-y-1">
                          {driverUsers.map(driver => (
                            <label key={driver._id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={assignmentForm.allocatedDrivers.includes(driver._id)}
                                onChange={() => handleAssignmentDriverToggle(driver._id)}
                                className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-900 truncate">{driver.name}</span>
                                <span className="block text-xs text-slate-500 truncate">
                                  {driver.employeeId ? `${driver.employeeId} - ` : ''}{driver.username}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
                <button type="button" onClick={closeAssignmentModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary min-w-36">
                  {saving ? 'Saving...' : 'Save Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {isHistoryModalOpen && historyVehicle && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
            <div className="shrink-0 px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Vehicle Allocation History</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {historyVehicle.vehicleNumber} - {[historyVehicle.make, historyVehicle.name].filter(Boolean).join(' ') || 'Vehicle'}
                </p>
              </div>
              <button onClick={closeHistoryModal} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <section>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Current Owner / Drivers</h4>
                {getCurrentAllocationEntries(historyVehicle).length === 0 ? (
                  <p className="text-sm text-slate-500">No user or driver is currently allocated.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {getCurrentAllocationEntries(historyVehicle).map(entry => (
                      <div key={entry._id || entry.user?._id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{formatUserName(entry.user)}</p>
                          <p className="text-xs text-slate-500 mt-1 capitalize">{entry.allocationType || historyVehicle.ownership}</p>
                        </div>
                        <p className="text-xs text-slate-500 text-right whitespace-nowrap">Allocated {formatDateTimeDisplay(entry.assignedAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Previous Owners / Drivers</h4>
                {(historyVehicle.allocationHistory || []).filter(entry => entry.unassignedAt).length === 0 ? (
                  <p className="text-sm text-slate-500">No previous allocation records.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {(historyVehicle.allocationHistory || [])
                      .filter(entry => entry.unassignedAt)
                      .sort((left, right) => new Date(right.unassignedAt) - new Date(left.unassignedAt))
                      .map(entry => (
                        <div key={entry._id} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{formatUserName(entry.user)}</p>
                            <p className="text-xs text-slate-500 mt-1 capitalize">{entry.allocationType}</p>
                          </div>
                          <div className="text-xs text-slate-500 text-right whitespace-nowrap space-y-1">
                            <p>Allocated {formatDateTimeDisplay(entry.assignedAt)}</p>
                            <p>Changed {formatDateTimeDisplay(entry.unassignedAt)}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ), document.body)}

      {deletingVehicle && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Delete vehicle?</h3>
            <p className="text-sm text-slate-500 mt-2">This will permanently remove vehicle {deletingVehicle.vehicleNumber} and its allocation records.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeletingVehicle(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={confirmDelete} className="btn-danger">Delete Vehicle</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default VehicleManagement;
