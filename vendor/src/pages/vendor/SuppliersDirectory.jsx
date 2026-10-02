import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, Edit2, Lock, Mail, MapPin, Phone, Plus, Trash2, X } from 'lucide-react';
import api from '../../utils/api';
import { vName, vEmail, vPhone, vRequired, buildErrors } from '../../utils/formValidation';

const FieldErr = ({ msg }) => (msg ? <p className="text-xs font-medium text-red-500 mt-1">{msg}</p> : null);

const SUPPLIER_TYPES = [
  { id: 'Petrol/Diesel', label: 'Petrol/Diesel Supplier' },
  { id: 'Gas Cylinder', label: 'Gas Cylinder Supplier' },
  { id: 'Spare Parts', label: 'Spare Parts Supplier' },
];

export const renderSupplierBadges = (supplierTypes) => {
  const types = Array.isArray(supplierTypes) ? supplierTypes : [];
  if (types.length === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        Not Assigned
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <span key={type} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {type}
        </span>
      ))}
    </div>
  );
};

const emptyForm = {
  business_name: '',
  email: '',
  location: '',
  phone: '',
  supplier_types: [],
};

const SuppliersDirectory = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const flashTimerRef = useRef(null);

  const validateForm = () => {
    const errors = buildErrors({
      business_name: vName(formData.business_name, 'Business name'),
      email: vEmail(formData.email),
      location: vRequired(formData.location, 'Location'),
      phone: vPhone(formData.phone, true),
    });
    if (!formData.supplier_types || formData.supplier_types.length === 0) {
      errors.supplier_types = 'Please select at least one Supplier Type.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const flash = (text, type = 'success') => {
    setMessage({ text, type });
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3500);
  };

  const fetchSuppliers = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/vendor/suppliers?vendorId=${user.id}`);
      setSuppliers(response.data || []);
    } catch (err) {
      console.error('Failed to fetch suppliers', err);
      setError(err.response?.data?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchSuppliers();
    } else {
      setLoading(false);
    }
  }, []);

  const stats = useMemo(() => {
    const emailCount = suppliers.filter((supplier) => supplier.email || supplier.contact_person).length;
    const latestSupplier = suppliers[0] || null;

    return {
      total: suppliers.length,
      withEmail: emailCount,
      latestLabel: latestSupplier
        ? new Date(latestSupplier.created_at).toLocaleDateString()
        : 'No suppliers yet',
    };
  }, [suppliers]);

  const getSupplierLabel = (supplier) => {
    return supplier.business_name || supplier.name || supplier.email || supplier.contact_person || `Supplier #${supplier.id}`;
  };

  const handleOpenAddModal = () => {
    setEditMode(false);
    setEditingSupplierId(null);
    setFormData(emptyForm);
    setFieldErrors({});
    setShowModal(true);
  };

  const handleOpenEditModal = (supplier) => {
    setEditMode(true);
    setEditingSupplierId(supplier.id);
    setFormData({
      business_name: supplier.business_name || '',
      email: supplier.email || supplier.contact_person || '',
      location: supplier.location || '',
      phone: supplier.phone || '',
      supplier_types: Array.isArray(supplier.supplier_types) ? supplier.supplier_types : [],
    });
    setFieldErrors({});
    setShowModal(true);
  };

  const toggleSupplierType = (typeId) => {
    setFormData((prev) => {
      const current = prev.supplier_types || [];
      const updated = current.includes(typeId)
        ? current.filter((t) => t !== typeId)
        : [...current, typeId];
      return { ...prev, supplier_types: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      let response;
      if (editMode && editingSupplierId) {
        response = await api.put(`/vendor/suppliers/${editingSupplierId}`, {
          ...formData,
          vendor_id: user.id,
        });
      } else {
        response = await api.post('/vendor/suppliers', {
          ...formData,
          vendor_id: user.id,
        });
      }

      if (response.data.success) {
        setShowModal(false);
        setFormData(emptyForm);
        setFieldErrors({});
        flash(editMode ? 'Supplier updated successfully.' : 'Supplier added successfully.', 'success');
        fetchSuppliers();
      } else {
        flash(response.data.message || 'Failed to save supplier.', 'error');
      }
    } catch (err) {
      console.error('Failed to save supplier', err);
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      flash(err.response?.data?.message || 'Network error, please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (supplier) => {
    if (!window.confirm(`Delete ${getSupplierLabel(supplier)}?`)) return;

    try {
      await api.delete(`/vendor/suppliers/${supplier.id}`);
      flash('Supplier deleted successfully.', 'success');
      fetchSuppliers();
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to delete supplier.', 'error');
    }
  };

  if (!user?.id) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md">
          <div className="flex justify-center mb-4 text-red-600"><Lock size={40} /></div>
          <h2 className="text-xl font-bold text-red-700 mb-2">Authentication Required</h2>
          <p className="text-red-600 mb-4">Please log in to manage your supplier network.</p>
          <button onClick={() => { window.location.href = '/login'; }} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center max-w-md">
          <div className="flex justify-center mb-4 text-yellow-600"><AlertTriangle size={40} /></div>
          <h2 className="text-xl font-bold text-yellow-700 mb-2">Error Loading Suppliers</h2>
          <p className="text-yellow-600 mb-4">{error}</p>
          <button onClick={fetchSuppliers} className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-on-surface">Suppliers Network</h2>
          <p className="text-on-surface-variant font-medium mt-1">
            Manage suppliers with specific product categories (Petrol/Diesel, Gas Cylinder, Spare Parts).
          </p>
          {message.text && (
            <div
              className={`mt-4 p-4 rounded-xl text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dim text-on-primary rounded-xl font-bold shadow-sm transition-all shadow-primary-container"
        >
          <Plus size={18} />
          Add Supplier
        </button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Suppliers</p>
          <p className="mt-2 text-3xl font-black text-on-surface">{stats.total}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">With Email</p>
          <p className="mt-2 text-3xl font-black text-on-surface">{stats.withEmail}</p>
        </div>
        <div className="bg-primary rounded-2xl border border-primary/20 p-5 shadow-md text-on-primary">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-primary/70">Latest Added</p>
          <p className="mt-2 text-xl font-black">{stats.latestLabel}</p>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-outline-variant/10">
        <div className="px-8 py-6 flex items-center justify-between bg-surface-container-low/30 border-b border-outline-variant/10">
          <h3 className="text-lg font-bold text-on-surface font-headline">Supplier Directory</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {loading ? 'Loading...' : `${suppliers.length} records`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/30 border-b border-outline-variant/10">
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Business & Category</th>
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Email</th>
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Location</th>
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Phone</th>
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Date</th>
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {suppliers.length > 0 ? suppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-surface-container-low/30 transition-colors">
                  <td className="px-8 py-5 text-on-surface font-bold">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-primary shrink-0" />
                        <span>{getSupplierLabel(supplier)}</span>
                      </div>
                      <div>{renderSupplierBadges(supplier.supplier_types)}</div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant">
                    <a href={`mailto:${supplier.email || supplier.contact_person || ''}`} className="inline-flex items-center gap-2 font-medium hover:text-primary">
                      <Mail size={14} />
                      {supplier.email || supplier.contact_person || '-'}
                    </a>
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant">
                    <div className="inline-flex items-center gap-2">
                      <MapPin size={14} />
                      {supplier.location || '-'}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant">
                    <div className="inline-flex items-center gap-2">
                      <Phone size={14} />
                      {supplier.phone || '-'}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right text-on-surface-variant font-medium">
                    {new Date(supplier.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button onClick={() => handleOpenEditModal(supplier)} className="text-primary font-bold text-xs mr-3 inline-flex items-center gap-1">
                      <Edit2 size={13} />
                      Edit
                    </button>
                    <button onClick={() => setSelectedSupplier(supplier)} className="text-slate-600 font-bold text-xs mr-3">
                      Details
                    </button>
                    <button onClick={() => handleDelete(supplier)} className="text-red-600 font-bold text-xs inline-flex items-center gap-1">
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                    {loading ? 'Fetching Suppliers...' : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-2xl font-bold">{editMode ? 'Edit Supplier' : 'Onboard New Supplier'}</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Specify supplier details and select the product types they provide.
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Business Name *</label>
                  <input
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    placeholder="Supplier business name"
                  />
                  <FieldErr msg={fieldErrors.business_name} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Supplier Email *</label>
                  <input
                    type="email"
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="supplier@example.com"
                  />
                  <FieldErr msg={fieldErrors.email} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Location *</label>
                  <input
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="City, district, or address"
                  />
                  <FieldErr msg={fieldErrors.location} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Phone *</label>
                  <input
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+252..."
                  />
                  <FieldErr msg={fieldErrors.phone} />
                </div>
              </div>

              {/* Required Supplier Type Multi-Select */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <label className="block text-xs font-bold uppercase mb-1 text-slate-700">
                  Supplier Type * <span className="normal-case text-slate-500 font-normal">(Select at least one)</span>
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Indicate what types of products this supplier provides to auto-filter them during procurement.
                </p>
                <div className="space-y-2">
                  {SUPPLIER_TYPES.map((type) => {
                    const isChecked = (formData.supplier_types || []).includes(type.id);
                    return (
                      <label
                        key={type.id}
                        onClick={() => toggleSupplierType(type.id)}
                        className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked ? 'bg-white border-primary shadow-sm' : 'bg-transparent border-slate-200 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent label click
                            className="w-4 h-4 accent-primary rounded"
                          />
                          <span className="font-bold text-sm text-slate-800">{type.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <FieldErr msg={fieldErrors.supplier_types} />
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 font-bold text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editMode ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-2xl font-bold">Supplier Details</h3>
                <p className="text-sm text-slate-500 mt-1">Contact and category information.</p>
              </div>
              <button onClick={() => setSelectedSupplier(null)} className="p-2 rounded-full hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <strong className="block text-xs uppercase text-slate-500 mb-1">Business Name</strong>
                <span className="font-bold text-slate-800 text-base">{getSupplierLabel(selectedSupplier)}</span>
              </div>

              <div>
                <strong className="block text-xs uppercase text-slate-500 mb-1">Supplier Type(s)</strong>
                {renderSupplierBadges(selectedSupplier.supplier_types)}
              </div>

              <p><strong className="block text-xs uppercase text-slate-500">Supplier Email</strong>{selectedSupplier.email || selectedSupplier.contact_person || 'N/A'}</p>
              <p><strong className="block text-xs uppercase text-slate-500">Location</strong>{selectedSupplier.location || 'N/A'}</p>
              <p><strong className="block text-xs uppercase text-slate-500">Phone</strong>{selectedSupplier.phone || 'N/A'}</p>
              <p><strong className="block text-xs uppercase text-slate-500">Date Added</strong>{new Date(selectedSupplier.created_at).toLocaleDateString()}</p>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => {
                  const s = selectedSupplier;
                  setSelectedSupplier(null);
                  handleOpenEditModal(s);
                }}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
              >
                Edit Details
              </button>
              <button
                onClick={() => setSelectedSupplier(null)}
                className="flex-1 px-6 py-3 bg-primary text-white rounded-xl font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuppliersDirectory;

