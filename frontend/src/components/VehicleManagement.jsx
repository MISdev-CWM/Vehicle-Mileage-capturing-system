import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import VehicleUsage from './VehicleUsage';

const emptyForm = {
  vehicleNumberLetters: '',
  vehicleNumberDigits: '',
  make: '',
  name: '',
  model: '',
  engineCapacity: '',
  fuelType: '',
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

const splitVehicleNumber = (value = '') => {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  const separatorIndex = normalized.lastIndexOf('-');

  if (separatorIndex === -1) {
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    return {
      letters: match?.[1] || normalized,
      digits: match?.[2] || ''
    };
  }

  return {
    letters: normalized.slice(0, separatorIndex),
    digits: normalized.slice(separatorIndex + 1)
  };
};

const getEngineCapacityDigits = (value = '') => value
  .toString()
  .trim()
  .replace(/cc$/i, '')
  .replace(/\D/g, '')
  .slice(0, 4);

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

  if (vehicle.allocatedUser) {
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
  const [poolAssignableUsers, setPoolAssignableUsers] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentVehicle, setAssignmentVehicle] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [reassignmentConflict, setReassignmentConflict] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [isVehicleUsageOpen, setIsVehicleUsageOpen] = useState(false);
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
        const [vehiclesRes, usersRes, poolUsersRes] = await Promise.all([
          api.get('/vehicles'),
          api.get('/users', { params: { assignable: true } }),
          api.get('/users', { params: { poolAssignable: true } })
        ]);

        if (!isActive) {
          return;
        }

        setVehicles(vehiclesRes.data);
        setAssignableUsers(usersRes.data);
        setPoolAssignableUsers(poolUsersRes.data);
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
      allocatedUser: '',
      allocatedDrivers: [],
      dateOfPurchasing: value === 'personal' ? '' : prev.dateOfPurchasing,
      dateOfUserAllocation: value === 'personal' ? '' : prev.dateOfUserAllocation
    }));
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
    setReassignmentConflict(null);
    setIsAssignmentModalOpen(true);
  };

  const closeAssignmentModal = () => {
    setAssignmentVehicle(null);
    setAssignmentForm(emptyAssignmentForm);
    setError('');
    setReassignmentConflict(null);
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

  const saveAssignment = async (confirmReassignment = false) => {

    if (!assignmentVehicle) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.patch(`/vehicles/${assignmentVehicle._id}/assignment`, {
        allocatedUser: assignmentForm.allocatedUser || null,
        allocatedDrivers: [],
        confirmReassignment
      });
      closeAssignmentModal();
      setSuccess('Vehicle user assignment changed successfully');
      await fetchVehicles();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === 'USER_ALREADY_ASSIGNED') {
        setReassignmentConflict(err.response.data);
        return;
      }
      setError(err.response?.data?.error || 'Failed to change vehicle user');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    await saveAssignment();
  };

  const confirmReassignment = async () => {
    setReassignmentConflict(null);
    await saveAssignment(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { vehicleNumberLetters, vehicleNumberDigits, ...vehicleDetails } = formData;
      const payload = {
        ...vehicleDetails,
        vehicleNumber: `${vehicleNumberLetters}-${vehicleNumberDigits}`,
        engineCapacity: `${formData.engineCapacity}cc`,
        allocatedUser: formData.allocatedUser || null,
        allocatedDrivers: []
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
    const vehicleNumber = splitVehicleNumber(vehicle.vehicleNumber);
    setEditingId(vehicle._id);
    setFormData({
      vehicleNumberLetters: vehicleNumber.letters,
      vehicleNumberDigits: vehicleNumber.digits,
      make: vehicle.make || '',
      name: vehicle.name || '',
      model: vehicle.model || '',
      engineCapacity: getEngineCapacityDigits(vehicle.engineCapacity),
      fuelType: vehicle.fuelType || '',
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

  if (isVehicleUsageOpen) {
    return <VehicleUsage onBack={() => setIsVehicleUsageOpen(false)} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Vehicle Management</h2>
          <p className="text-sm text-slate-500 mt-1">Create, view, update, delete, and allocate vehicles.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsVehicleUsageOpen(true)} className="btn-secondary self-start sm:self-auto">
            Vehicle Usage
          </button>
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
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Vehicle Number</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Fuel Type</th>
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
                    <td className="py-3 text-sm text-slate-700 capitalize">{vehicle.fuelType || '-'}</td>
                    <td className="py-3 text-sm text-slate-700 capitalize">{vehicle.ownership}</td>
                    <td className="py-3 text-sm text-slate-700">
                      {vehicle.allocatedUser?.name
                        || (vehicle.allocatedDrivers?.length
                          ? vehicle.allocatedDrivers.map(driver => driver.name).join(', ')
                          : '-')}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Vehicle Number</label>
                    <div className="flex h-[42px] overflow-hidden rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500">
                      <input
                        type="text"
                        value={formData.vehicleNumberLetters}
                        onChange={(e) => handleChange('vehicleNumberLetters', e.target.value.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase())}
                        className="min-w-0 w-[42%] border-0 px-3 py-2 uppercase outline-none"
                        placeholder="CAA"
                        aria-label="Vehicle number letters"
                        maxLength={3}
                        pattern="[A-Za-z]{1,3}"
                        title="Enter a maximum of 3 English letters"
                        required
                      />
                      <span className="flex items-center border-x border-slate-200 bg-slate-50 px-3 font-mono font-semibold text-slate-500" aria-hidden="true">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formData.vehicleNumberDigits}
                        onChange={(e) => handleChange('vehicleNumberDigits', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="min-w-0 flex-1 border-0 px-3 py-2 font-mono outline-none"
                        placeholder="1234"
                        aria-label="Vehicle number digits"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        title="Enter exactly 4 numbers"
                        required
                      />
                    </div>
                  </div>
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Engine Capacity</label>
                    <div className="flex h-[42px] overflow-hidden rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formData.engineCapacity}
                        onChange={(e) => handleChange('engineCapacity', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="min-w-0 flex-1 border-0 px-3 py-2 font-mono outline-none"
                        placeholder="1500"
                        aria-label="Engine capacity"
                        maxLength={4}
                        pattern="[0-9]{1,4}"
                        title="Enter a maximum of 4 numbers"
                        required
                      />
                      <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500" aria-hidden="true">cc</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Fuel Type</label>
                    <select
                      value={formData.fuelType}
                      onChange={(e) => handleChange('fuelType', e.target.value)}
                      className="input"
                      required
                    >
                      <option value="" disabled>Select fuel type</option>
                      <option value="petrol">Petrol</option>
                      <option value="diesel">Diesel</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
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
                          <option value="pool">Pool</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated User</label>
                        <select
                          value={formData.allocatedUser}
                          onChange={(e) => handleChange('allocatedUser', e.target.value)}
                          className="input"
                        >
                          <option value="">Unassigned</option>
                          {(formData.ownership === 'pool' ? poolAssignableUsers : assignableUsers).map(user => (
                            <option key={user._id} value={user._id}>
                              {user.employeeId ? `${user.employeeId} - ` : ''}{user.name}
                              {formData.ownership === 'pool' ? ` (${user.role === 'driver' ? 'Driver' : 'User'})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {formData.ownership !== 'personal' && (
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
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of User Allocation</label>
                      <input
                        type="date"
                        value={formData.dateOfUserAllocation}
                        onChange={(e) => handleChange('dateOfUserAllocation', e.target.value)}
                        className="input disabled:bg-slate-100 disabled:text-slate-500"
                        disabled={Boolean(editingId)}
                      />
                    </div>
                  </div>
                )}
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Allocated User</label>
                  <select
                    value={assignmentForm.allocatedUser}
                    onChange={(e) => {
                      setAssignmentForm(prev => ({ ...prev, allocatedUser: e.target.value }));
                      setReassignmentConflict(null);
                      setError('');
                    }}
                    className="input"
                  >
                    <option value="">Unassigned</option>
                    {(assignmentForm.ownership === 'pool' ? poolAssignableUsers : assignableUsers).map(user => (
                      <option key={user._id} value={user._id}>
                        {user.employeeId ? `${user.employeeId} - ` : ''}{user.name}
                        {assignmentForm.ownership === 'pool' ? ` (${user.role === 'driver' ? 'Driver' : 'User'})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
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

      {reassignmentConflict && assignmentVehicle && createPortal((
        <div className="fixed inset-0 z-[2147483648] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="reassign-user-title">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-5">
              <h3 id="reassign-user-title" className="text-lg font-semibold text-slate-900">Move user to this vehicle?</h3>
              <p className="text-sm text-slate-600 mt-3 leading-6">
                <span className="font-semibold text-slate-900">
                  {formatUserName(assignableUsers.find(user => user._id === assignmentForm.allocatedUser))}
                </span>{' '}
                is currently assigned to{' '}
                <span className="font-semibold text-slate-900">{reassignmentConflict.currentVehicle?.vehicleNumber}</span>.
              </p>
              <p className="text-sm text-slate-600 mt-2 leading-6">
                If you continue, that vehicle will become unassigned and the user will be assigned to{' '}
                <span className="font-semibold text-slate-900">{assignmentVehicle.vehicleNumber}</span>.
              </p>
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReassignmentConflict(null)}
                disabled={saving}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmReassignment} disabled={saving} className="btn-primary">
                {saving ? 'Updating...' : 'Confirm Reassignment'}
              </button>
            </div>
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
