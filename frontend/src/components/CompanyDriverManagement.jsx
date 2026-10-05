import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';

const emptyForm = {
  employeeId: '',
  employeeName: '',
  contactNumber: ''
};

const CompanyDriverManagement = () => {
  const [drivers, setDrivers] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchDrivers = async (searchValue = search) => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/company-drivers', {
        params: searchValue ? { search: searchValue } : {}
      });
      setDrivers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load company drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadDrivers = async () => {
      try {
        const res = await api.get('/company-drivers');

        if (isActive) {
          setDrivers(res.data);
        }
      } catch (err) {
        if (isActive) {
          setError(err.response?.data?.error || 'Failed to load company drivers');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadDrivers();

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
      if (editingId) {
        await api.put(`/company-drivers/${editingId}`, formData);
        setSuccess('Company driver updated successfully');
      } else {
        await api.post('/company-drivers', formData);
        setSuccess('Company driver created successfully');
      }

      closeModal();
      await fetchDrivers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save company driver');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (driver) => {
    setEditingId(driver._id);
    setFormData({
      employeeId: driver.employeeId || '',
      employeeName: driver.employeeName || '',
      contactNumber: driver.contactNumber || ''
    });
    setSuccess('');
    setError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (driver) => {
    setError('');
    setSuccess('');
    setDeletingDriver(driver);
  };

  const confirmDelete = async () => {
    if (!deletingDriver) return;

    try {
      await api.delete(`/company-drivers/${deletingDriver._id}`);
      setDeletingDriver(null);
      setSuccess('Company driver deleted successfully');
      await fetchDrivers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete company driver');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDrivers(search.trim());
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Company Driver Management</h2>
          <p className="text-sm text-slate-500 mt-1">Manage company driver records.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreateModal} className="btn-primary self-start sm:self-auto">
            Create Driver
          </button>
          <button onClick={() => fetchDrivers()} className="btn-secondary self-start sm:self-auto">
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
            <h3 className="text-lg font-semibold text-slate-900">Company Drivers</h3>
            <p className="text-xs text-slate-500 mt-1">{drivers.length} records</p>
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
        ) : drivers.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No company drivers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Employee ID</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Employee Name</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Contact No</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map(driver => (
                  <tr key={driver._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-mono text-sm font-semibold text-slate-900">{driver.employeeId}</td>
                    <td className="py-3 text-sm font-medium text-slate-900">{driver.employeeName}</td>
                    <td className="py-3 text-sm text-slate-600">{driver.contactNumber}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(driver)} className="btn-secondary px-3 py-1.5 text-xs">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(driver)} className="btn-danger px-3 py-1.5 text-xs">
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
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Update Company Driver' : 'Create Company Driver'}
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee ID</label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => handleChange('employeeId', e.target.value)}
                  className="input uppercase"
                  placeholder="DRV-001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee Name</label>
                <input
                  type="text"
                  value={formData.employeeName}
                  onChange={(e) => handleChange('employeeName', e.target.value)}
                  className="input"
                  placeholder="Driver name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contact No</label>
                <input
                  type="tel"
                  value={formData.contactNumber}
                  onChange={(e) => handleChange('contactNumber', e.target.value)}
                  className="input"
                  placeholder="0771234567"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update Driver' : 'Create Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {deletingDriver && createPortal((
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md" role="presentation">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">Delete company driver?</h3>
            <p className="text-sm text-slate-500 mt-2">This will permanently remove {deletingDriver.employeeName} from the company driver records.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeletingDriver(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={confirmDelete} className="btn-danger">Delete Driver</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default CompanyDriverManagement;
