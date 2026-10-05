import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

const emptyForm = {
  employeeId: '',
  name: '',
  email: '',
  username: '',
  contactNumber: '',
  role: 'user',
  vehicleId: '',
  password: ''
};

const roleBadgeClass = {
  admin: 'bg-brand-100 text-brand-700',
  employee: 'bg-emerald-100 text-emerald-700',
  user: 'bg-slate-100 text-slate-700',
  driver: 'bg-amber-100 text-amber-700'
};

const displayEmail = (user) => {
  if (user.role === 'driver' && user.email?.endsWith('@driver.local')) {
    return '';
  }

  return user.email || '';
};

const getAssignedVehicleText = (user) => {
  if (user.assignedVehicles?.length) {
    return user.assignedVehicles;
  }

  if (user.role === 'user' && user.vehicleId) {
    return [user.vehicleId];
  }

  return [];
};

const getGeneratedUserUsername = (data) => {
  const source = data.vehicleId || data.employeeId;
  return source.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const EmployeeManagement = () => {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async (searchValue = search) => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/users', {
        params: searchValue ? { search: searchValue } : {}
      });
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadUsers = async () => {
      try {
        const res = await api.get('/users');

        if (isActive) {
          setUsers(res.data);
        }
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load users');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadUsers();

    return () => {
      isActive = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...formData,
        email: formData.role === 'driver' ? '' : formData.email,
        username: formData.role === 'user' ? '' : formData.username,
        vehicleId: formData.role === 'user' ? formData.vehicleId : ''
      };

      if (editingId && !payload.password) {
        delete payload.password;
      }

      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
        setSuccess('User updated successfully');
      } else {
        await api.post('/users', payload);
        setSuccess('User created successfully');
      }

      closeModal();
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user) => {
    setEditingId(user._id);
    setFormData({
      employeeId: user.employeeId || '',
      name: user.name || '',
      email: displayEmail(user),
      username: user.username || '',
      contactNumber: user.contactNumber || '',
      role: ['admin', 'driver'].includes(user.role) ? user.role : 'user',
      vehicleId: user.role === 'user' ? (user.vehicleId || '') : '',
      password: ''
    });
    setSuccess('');
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (user) => {
    setError('');
    setSuccess('');
    setDeletingUser(user);
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;

    try {
      await api.delete(`/users/${deletingUser._id}`);
      setDeletingUser(null);
      setSuccess('User deleted successfully');
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers(search.trim());
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500 mt-1">Create admin, user, and driver login accounts.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreateModal} className="btn-primary self-start sm:self-auto">
            Create User
          </button>
          <button onClick={() => fetchUsers()} className="btn-secondary self-start sm:self-auto">
            Refresh
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      {!isModalOpen && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Users</h3>
            <p className="text-xs text-slate-500 mt-1">{users.length} records</p>
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
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Employee ID</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Employee Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Username</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Contact Number</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Assigned Vehicle No</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Role</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-mono text-sm font-semibold text-slate-900">{user.employeeId || '-'}</td>
                    <td className="py-3 text-sm text-slate-900">
                      <p className="font-medium">{user.name}</p>
                      {displayEmail(user) && <p className="text-xs text-slate-500">{displayEmail(user)}</p>}
                    </td>
                    <td className="py-3 text-sm text-slate-600">{user.username}</td>
                    <td className="py-3 text-sm text-slate-600">{user.contactNumber || '-'}</td>
                    <td className="py-3">
                      {getAssignedVehicleText(user).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-56">
                          {getAssignedVehicleText(user).map(vehicleNo => (
                            <span
                              key={vehicleNo}
                              className="inline-flex items-center rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 font-mono whitespace-nowrap"
                            >
                              {vehicleNo}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${roleBadgeClass[user.role] || roleBadgeClass.user}`}>
                        {user.role === 'employee' ? 'user' : user.role}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(user)} className="btn-secondary px-3 py-1.5 text-xs">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(user)} className="btn-danger px-3 py-1.5 text-xs">
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
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Update User' : 'Create User'}
              </h3>
              <button onClick={closeModal} className="btn-secondary px-3 py-1.5 text-sm" type="button">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="input"
                  >
                    <option value="user">User</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee ID</label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => handleChange('employeeId', e.target.value)}
                    className="input uppercase"
                    placeholder="EMP-001"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="input"
                    placeholder="Employee name"
                    required
                  />
                </div>

                {formData.role !== 'driver' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="input"
                    placeholder="employee@fleet.local"
                    required={formData.role !== 'driver'}
                  />
                </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.role === 'user' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                    <input
                      type="text"
                      value={getGeneratedUserUsername(formData)}
                      className="input bg-slate-100 text-slate-500 cursor-not-allowed"
                      placeholder="Auto generated"
                      disabled
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleChange('username', e.target.value)}
                      className="input lowercase"
                      placeholder="username"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Contact Number</label>
                  <input
                    type="tel"
                    value={formData.contactNumber}
                    onChange={(e) => handleChange('contactNumber', e.target.value)}
                    className="input"
                    placeholder="0771234567"
                    required
                  />
                </div>
              </div>

              {formData.role === 'user' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Assigned Vehicle No</label>
                  <input
                    type="text"
                    value={formData.vehicleId}
                    onChange={(e) => handleChange('vehicleId', e.target.value)}
                    className="input uppercase"
                    placeholder="VH-2024-001"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {editingId ? 'New Password' : 'Password'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className="input"
                  placeholder={editingId ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
                  required={!editingId}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {deletingUser && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Delete user?</h3>
            <p className="text-sm text-slate-500 mt-2">This will permanently remove {deletingUser.name} and their login account.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeletingUser(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={confirmDelete} className="btn-danger">Delete User</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default EmployeeManagement;
