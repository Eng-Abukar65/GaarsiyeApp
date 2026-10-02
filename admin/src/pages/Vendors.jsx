import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import SecureDocumentLink from '../components/SecureDocumentLink';
import {
  Store, MapPin, Star, ChevronRight, TrendingUp, ShieldCheck,
  Package, Plus, Download, Search, Trash2, Edit2, CheckCircle,
  KeyRound, Copy, LoaderCircle, X, Lock, Upload, FileText,
  XCircle, Ban, Clock, DollarSign
} from 'lucide-react';
import { filterMockData } from '../utils/filterMockData';
import { useToast, useConfirm, PageLoader, EmptyState, usePagination, Pagination, Modal } from '../components/ui';

const FieldError = ({ msg }) => (msg ? <p className="text-xs font-medium text-rose-500 mt-1">{msg}</p> : null);

const getStatusStyle = (status) => {
  switch (String(status).toLowerCase()) {
    case 'verified':
    case 'approved':
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    case 'rejected':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
    case 'suspended':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20';
    case 'pending':
    default:
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
  }
};

const VendorStatCard = ({ title, value, icon: Icon, trendValue, colorClass }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>
      </div>
      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center`}>
        {React.createElement(Icon, { size: 20, className: 'text-white' })}
      </div>
    </div>
    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
      <TrendingUp size={12} />
      {trendValue}
      <span className="text-slate-500 font-normal ml-1">Live data</span>
    </div>
  </div>
);

const VendorsPage = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const processedPasswordResetRef = useRef(null);

  const [vendors, setVendors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('All Vendors');
  const [selectedVendor, setSelectedVendor] = useState(null);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [passwordResult, setPasswordResult] = useState(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [resettingVendorId, setResettingVendorId] = useState(null);
  const [submittingOnboard, setSubmittingOnboard] = useState(false);

  // Vendor Financial History Modal State
  const [showFinancialModal, setShowFinancialModal] = useState(false);
  const [selectedVendorForFinancial, setSelectedVendorForFinancial] = useState(null);
  const [vendorFinancialData, setVendorFinancialData] = useState(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);

  const handleViewVendorFinancialHistory = async (vendor) => {
    if (!vendor || !vendor.id) return;
    setSelectedVendorForFinancial(vendor);
    setShowFinancialModal(true);
    setLoadingFinancial(true);
    try {
      const res = await api.get(`/admin/vendors/${vendor.id}/financial-history`);
      if (res.data?.summary) {
        setVendorFinancialData(res.data);
      } else {
        setVendorFinancialData(null);
      }
    } catch (err) {
      toast.show('Failed to fetch vendor financial history.', 'error');
    } finally {
      setLoadingFinancial(false);
    }
  };

  // Full Vendor Onboarding Form State
  const initialFormState = {
    business_name: '',
    contact_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    auto_password: true,
    address: '',
    city: '',
    district: '',
    latitude: '',
    longitude: '',
    identity_document_type: 'nira',
    nira_id_document: null,
    passport_document: null,
    government_patent_document: null,
    logo_document: null,
    business_types: ['Petrol Station'],
    verification_status: 'pending',
    admin_notes: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/vendors');
      setVendors(filterMockData(response.data || []));
    } catch (err) {
      console.error('Failed to fetch vendors', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const response = await api.get('/admin/drivers');
      setDrivers(filterMockData(response.data || []));
    } catch (err) {
      console.error('Failed to fetch drivers', err);
      setDrivers([]);
    }
  };

  useEffect(() => {
    fetchVendors();
    fetchDrivers();
  }, []);

  const filteredVendors = useMemo(() => {
    let filtered = vendors || [];
    if (searchTerm) {
      filtered = filtered.filter((v) =>
        (v.display_name || v.business_name || v.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (activeTab === 'Fuel Stations') {
      filtered = filtered.filter((v) => {
        const typeStr = Array.isArray(v.business_types) ? v.business_types.join(' ') : v.business_type || '';
        return typeStr.toLowerCase().includes('petrol') || typeStr.toLowerCase().includes('gas') || typeStr.toLowerCase().includes('fuel');
      });
    } else if (activeTab === 'Shops & Retail') {
      filtered = filtered.filter((v) => {
        const typeStr = Array.isArray(v.business_types) ? v.business_types.join(' ') : v.business_type || '';
        return !typeStr.toLowerCase().includes('petrol') && !typeStr.toLowerCase().includes('gas') && !typeStr.toLowerCase().includes('fuel') && typeStr.trim() !== '';
      });
    }
    return filtered;
  }, [vendors, searchTerm, activeTab]);

  const selectedVendorDrivers = useMemo(() => {
    if (!selectedVendor) return [];
    return (drivers || []).filter((driver) => String(driver.vendor_id) === String(selectedVendor.id));
  }, [drivers, selectedVendor]);

  const { pageItems, page, setPage, totalPages } = usePagination(filteredVendors, 10);

  const handleExport = () => {
    if (vendors.length === 0) {
      toast?.info?.('No data to export.');
      return;
    }
    const esc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'Business Name', 'Email', 'Address', 'Status', 'Rating'];
    const csvRows = vendors.map((v) =>
      [v.id, v.display_name || v.business_name || v.name, v.email, v.address, v.status, v.rating].map(esc).join(',')
    );
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendors_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast?.success?.(`Exported ${vendors.length} vendors.`);
  };

  // Full Vendor Registration Onboard Handler
  const handleOnboard = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    if (!formData.business_name.trim()) {
      setFieldErrors((prev) => ({ ...prev, business_name: 'Business name is required.' }));
      return;
    }
    if (!formData.contact_name.trim()) {
      setFieldErrors((prev) => ({ ...prev, contact_name: 'Owner name is required.' }));
      return;
    }
    if (!formData.email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Email address is required.' }));
      return;
    }
    if (!formData.address.trim()) {
      setFieldErrors((prev) => ({ ...prev, address: 'Location address is required.' }));
      return;
    }
    if (formData.business_types.length === 0) {
      toast?.error?.('Please select at least one business type.');
      return;
    }

    setSubmittingOnboard(true);

    try {
      const payload = new FormData();
      payload.append('business_name', formData.business_name.trim());
      payload.append('contact_name', formData.contact_name.trim());
      payload.append('username', formData.username.trim() || formData.email.trim().split('@')[0]);
      payload.append('email', formData.email.trim().toLowerCase());
      payload.append('phone', formData.phone.trim());
      payload.append('password', formData.password);
      payload.append('auto_password', formData.auto_password ? 'true' : 'false');
      payload.append('address', formData.address.trim());
      payload.append('city', formData.city.trim());
      payload.append('district', formData.district.trim());
      payload.append('latitude', formData.latitude);
      payload.append('longitude', formData.longitude);
      payload.append('identity_document_type', formData.identity_document_type);
      payload.append('verification_status', formData.verification_status);
      payload.append('admin_notes', formData.admin_notes.trim());
      payload.append('business_types', JSON.stringify(formData.business_types));

      if (formData.nira_id_document) payload.append('nira_id_document', formData.nira_id_document);
      if (formData.passport_document) payload.append('passport_document', formData.passport_document);
      if (formData.government_patent_document) payload.append('government_patent_document', formData.government_patent_document);
      if (formData.logo_document) payload.append('logo_document', formData.logo_document);

      const response = await api.post('/admin/vendors', payload);

      setShowModal(false);
      const initPass = response.data?.initialPassword || formData.password;
      setPasswordResult({
        vendorName: formData.business_name,
        username: formData.username || formData.email.split('@')[0],
        email: formData.email,
        password: initPass,
      });

      setFormData(initialFormState);
      fetchVendors();
      toast?.success?.('Vendor registered successfully!');
    } catch (err) {
      console.error('Failed to onboard vendor', err);
      if (err.response?.data?.errors) {
        setFieldErrors(err.response.data.errors);
      }
      toast?.error?.(err.response?.data?.message || 'Failed to register vendor.');
    } finally {
      setSubmittingOnboard(false);
    }
  };

  const handleVerifyVendor = async (id, status) => {
    try {
      await api.patch(`/admin/vendors/${id}/verify`, { status, verification_status: status });
      toast?.success?.(`Vendor status updated to ${status}.`);
      fetchVendors();
      if (selectedVendor && selectedVendor.id === id) {
        setSelectedVendor((prev) => ({ ...prev, verification_status: status, status }));
      }
    } catch (err) {
      toast?.error?.(err.response?.data?.message || 'Failed to update vendor status.');
    }
  };

  const handleResetPassword = async (vendor) => {
    setResettingVendorId(vendor.id);
    try {
      const res = await api.post(`/admin/vendors/${vendor.id}/reset-password`);
      setPasswordResult({
        vendorName: vendor.business_name || vendor.name,
        username: vendor.username || vendor.email,
        email: vendor.email,
        password: res.data.temporaryPassword,
      });
      toast?.success?.('Temporary password generated.');
    } catch (err) {
      toast?.error?.(err.response?.data?.message || 'Failed to reset password.');
    } finally {
      setResettingVendorId(null);
    }
  };

  const handleViewVendor = async (id) => {
    try {
      const res = await api.get(`/admin/vendors/${id}`);
      setSelectedVendor(res.data);
      return res.data;
    } catch (err) {
      toast?.error?.('Could not load vendor details.');
      return null;
    }
  };

  useEffect(() => {
    const vendorId = searchParams.get('vendorId');
    const action = searchParams.get('action');
    if (!vendorId) return;

    if (action === 'reset-password') {
      if (processedPasswordResetRef.current === vendorId) return;
      processedPasswordResetRef.current = vendorId;
      handleViewVendor(vendorId).then((vendor) => {
        if (vendor) handleResetPassword(vendor);
      });
      return;
    }

    if (!selectedVendor) handleViewVendor(vendorId);
  }, [searchParams, selectedVendor]);

  const handleDeleteVendor = async (vendor) => {
    const ok = await confirm({
      title: 'Delete Vendor',
      message: `Are you sure you want to delete "${vendor.business_name || vendor.name}"? This action cannot be undone.`,
    });
    if (!ok) return;

    try {
      await api.delete(`/admin/vendors/${vendor.id}`);
      toast?.success?.('Vendor deleted successfully.');
      fetchVendors();
    } catch (err) {
      toast?.error?.(err.response?.data?.message || 'Failed to delete vendor.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Vendors Management</h2>
          <p className="text-slate-500 text-sm">Oversee partner fuel stations, gas depots, and retail shops.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-2 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => { setFieldErrors({}); setFormData(initialFormState); setShowModal(true); }} className="px-4 py-2 bg-primary-600 text-white rounded-xl flex items-center gap-2 text-xs font-bold hover:bg-primary-700 transition-colors cursor-pointer">
            <Plus size={16} /> Add New Vendor
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <VendorStatCard title="Total Vendors" value={(vendors?.length || 0).toLocaleString()} icon={Store} trendValue="Live" colorClass="bg-blue-600" />
        <VendorStatCard title="Active Stations" value={(vendors?.filter((v) => v.status === 'verified' || v.verification_status === 'verified').length || 0).toString()} icon={TrendingUp} trendValue="Verified" colorClass="bg-teal-600" />
        <VendorStatCard title="Pending Verification" value={(vendors?.filter((v) => v.status === 'pending' || v.verification_status === 'pending').length || 0).toString()} icon={ShieldCheck} trendValue="Requires action" colorClass="bg-amber-600" />
        <VendorStatCard title="Total Orders" value={(vendors || []).reduce((sum, v) => sum + (parseInt(v.total_orders) || 0), 0).toString()} icon={Package} trendValue="All vendors" colorClass="bg-indigo-600" />
      </div>

      {/* Vendors Table Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex gap-4">
            {['All Vendors', 'Fuel Stations', 'Shops & Retail'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl py-1.5 pl-9 pr-4 text-xs font-semibold outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3">Vendor Business</th>
                <th className="px-6 py-3">Location & District</th>
                <th className="px-6 py-3">Verification Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-300">
              {pageItems.length > 0 ? (
                pageItems.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-600/10 text-primary-600 flex items-center justify-center font-extrabold text-sm">
                          {(v.display_name || v.business_name || v.name || 'V').substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 dark:text-white">{v.display_name || v.business_name || v.name || 'Unknown'}</p>
                          <p className="text-[10px] text-slate-500">ID: #{v.id} â€¢ {v.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="truncate max-w-[200px]">{[v.address, v.city, v.district].filter(Boolean).join(', ') || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={v.verification_status || v.status || 'pending'}
                        onChange={(e) => handleVerifyVendor(v.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase outline-none border cursor-pointer ${getStatusStyle(v.verification_status || v.status || 'pending')}`}
                      >
                        <option value="pending" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">PENDING</option>
                        <option value="verified" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">VERIFIED</option>
                        <option value="rejected" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">REJECTED</option>
                        <option value="suspended" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">SUSPENDED</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleViewVendor(v.id)} className="p-1.5 text-slate-400 hover:text-primary-600 transition-colors cursor-pointer" title="View Details">
                          <ChevronRight size={16} />
                        </button>
                        {(v.verification_status || v.status) !== 'pending' && (
                          <button onClick={() => handleVerifyVendor(v.id, 'pending')} className="p-1.5 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer" title="Mark as Pending">
                            <Clock size={15} />
                          </button>
                        )}
                        {(v.verification_status || v.status) !== 'verified' && (
                          <button onClick={() => handleVerifyVendor(v.id, 'verified')} className="p-1.5 text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer" title="Verify / Approve Vendor">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {(v.verification_status || v.status) !== 'rejected' && (
                          <button onClick={() => handleVerifyVendor(v.id, 'rejected')} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer" title="Mark as Rejected">
                            <XCircle size={15} />
                          </button>
                        )}
                        {(v.verification_status || v.status) !== 'suspended' && (
                          <button onClick={() => handleVerifyVendor(v.id, 'suspended')} className="p-1.5 text-slate-400 hover:text-purple-500 transition-colors cursor-pointer" title="Mark as Suspended">
                            <Ban size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleResetPassword(v)}
                          disabled={resettingVendorId !== null}
                          className="p-1.5 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer disabled:opacity-40"
                          title="Reset Password"
                        >
                          {String(resettingVendorId) === String(v.id) ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}
                        </button>
                        <button onClick={() => handleDeleteVendor(v)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer" title="Delete Vendor">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-xs font-bold text-slate-400">
                    No vendors found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={filteredVendors.length} shown={pageItems.length} onChange={setPage} />
      </div>

      {/* â”€â”€ Full Vendor Registration Modal (Admin Onboarding) â”€â”€ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-3xl rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="text-primary-600" size={22} /> Onboard New Vendor (Full Registration)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Complete official vendor onboarding using the system registration schema.
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-sm">
                âœ•
              </button>
            </div>

            <form onSubmit={handleOnboard} className="space-y-6">
              {/* Section 1: Business & Owner Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  1. Vendor & Owner Credentials
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Business Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Mogadishu Fuel Hub"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.business_name}
                      onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    />
                    <FieldError msg={fieldErrors.business_name} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Owner Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Ali Ahmed"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.contact_name}
                      onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    />
                    <FieldError msg={fieldErrors.contact_name} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="email"
                      placeholder="owner@station.com"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                    <FieldError msg={fieldErrors.email} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="+252613344556"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                    <FieldError msg={fieldErrors.phone} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="vendor_user"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Password</label>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-primary-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.auto_password}
                          onChange={(e) => setFormData({ ...formData, auto_password: e.target.checked })}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                        />
                        Auto-generate
                      </label>
                    </div>
                    <input
                      type="password"
                      disabled={formData.auto_password}
                      placeholder={formData.auto_password ? 'Auto-generated temporary password' : 'Type custom password'}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white disabled:opacity-50"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Location Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  2. Station & Location Address
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Address / Location <span className="text-rose-500">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="Maka Al Mukarama Rd, Mogadishu"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                    <FieldError msg={fieldErrors.address} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">City</label>
                    <input
                      type="text"
                      placeholder="Mogadishu"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">District</label>
                    <input
                      type="text"
                      placeholder="Hodan"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Latitude</label>
                      <input
                        type="text"
                        placeholder="2.0469"
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Longitude</label>
                      <input
                        type="text"
                        placeholder="45.3182"
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Document Uploads */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  3. Verification Documents & Logo
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Identity Doc Type</label>
                    <select
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white mb-2"
                      value={formData.identity_document_type}
                      onChange={(e) => setFormData({ ...formData, identity_document_type: e.target.value })}
                    >
                      <option value="nira">NIRA ID Card</option>
                      <option value="passport">Owner Passport</option>
                    </select>

                    <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-primary-600">
                      <Upload size={16} className="text-primary-600" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {formData.identity_document_type === 'nira'
                          ? formData.nira_id_document?.name || 'Upload NIRA ID'
                          : formData.passport_document?.name || 'Upload Passport'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (formData.identity_document_type === 'nira') setFormData({ ...formData, nira_id_document: file });
                          else setFormData({ ...formData, passport_document: file });
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Government Patent / License</label>
                    <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-primary-600 mt-7">
                      <FileText size={16} className="text-primary-600" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {formData.government_patent_document?.name || 'Upload Patent / License (PDF/Image)'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => setFormData({ ...formData, government_patent_document: e.target.files[0] })}
                      />
                    </label>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Vendor Logo (Optional)</label>
                    <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-primary-600">
                      <Upload size={16} className="text-primary-600" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {formData.logo_document?.name || 'Upload Station Logo Image (PNG/JPG)'}
                      </span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => setFormData({ ...formData, logo_document: e.target.files[0] })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 4: Business Modules & Admin Status */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  4. Business Modules & Verification Status
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Business Modules</label>
                    <div className="space-y-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                      {['Petrol Station', 'Gas Depot', 'Spare Parts Shop', 'Car Services'].map((type) => (
                        <label key={type} className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.business_types.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, business_types: [...formData.business_types, type] });
                              } else {
                                setFormData({ ...formData, business_types: formData.business_types.filter((t) => t !== type) });
                              }
                            }}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Initial Status</label>
                      <select
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-white"
                        value={formData.verification_status}
                        onChange={(e) => setFormData({ ...formData, verification_status: e.target.value })}
                      >
                        <option value="pending">Pending Admin Review</option>
                        <option value="verified">Approved & Active Immediately</option>
                        <option value="rejected">Suspended</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Admin Notes (Optional)</label>
                      <textarea
                        rows={2}
                        placeholder="Internal notes regarding vendor setup..."
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none text-slate-900 dark:text-white"
                        value={formData.admin_notes}
                        onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-slate-600 dark:text-slate-400 font-bold text-xs hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOnboard}
                  className="px-6 py-2.5 bg-primary-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-primary-700 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingOnboard ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Complete Vendor Onboarding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â”€â”€ One-Time Credentials Modal â”€â”€ */}
      {passwordResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <KeyRound size={24} />
            </div>

            <div>
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">Vendor Credentials Created</h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                Share these temporary credentials with <strong>{passwordResult.vendorName}</strong>.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
              <p><strong className="text-slate-400">Username:</strong> {passwordResult.username}</p>
              <p><strong className="text-slate-400">Email:</strong> {passwordResult.email}</p>
              <p><strong className="text-slate-400">Password:</strong> <code className="bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded font-mono font-bold">{passwordResult.password}</code></p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Vendor Login Credentials:\nUsername: ${passwordResult.username}\nEmail: ${passwordResult.email}\nPassword: ${passwordResult.password}`
                  );
                  setPasswordCopied(true);
                  setTimeout(() => setPasswordCopied(false), 2000);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Copy size={14} /> {passwordCopied ? 'Copied to Clipboard!' : 'Copy Credentials'}
              </button>

              <button
                type="button"
                onClick={() => setPasswordResult(null)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Vendor Details Modal â”€â”€ */}
      {selectedVendor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-extrabold text-xl">
                  {(selectedVendor.display_name || selectedVendor.business_name || selectedVendor.name || 'V').substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    {selectedVendor.display_name || selectedVendor.business_name || selectedVendor.name || 'Unknown Vendor'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Vendor ID: #{selectedVendor.id} â€¢ {selectedVendor.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVendor(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-sm p-1"
              >
                âœ•
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Section 1: Business Profile */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  Business Profile
                </h4>
                <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Owner Name</span>{selectedVendor.contact_name || 'N/A'}</p>
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Username</span>{selectedVendor.username || 'N/A'}</p>
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Phone Number</span>{selectedVendor.phone || 'N/A'}</p>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-2">Change Verification Status</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleVerifyVendor(selectedVendor.id, 'pending')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                          (selectedVendor.verification_status || selectedVendor.status) === 'pending'
                            ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/50'
                            : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
                        }`}
                      >
                        <Clock size={13} /> Pending
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyVendor(selectedVendor.id, 'verified')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                          (selectedVendor.verification_status || selectedVendor.status) === 'verified'
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/50'
                            : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                        }`}
                      >
                        <CheckCircle size={13} /> Verified
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyVendor(selectedVendor.id, 'rejected')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                          (selectedVendor.verification_status || selectedVendor.status) === 'rejected'
                            ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400/50'
                            : 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400'
                        }`}
                      >
                        <XCircle size={13} /> Rejected
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVerifyVendor(selectedVendor.id, 'suspended')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                          (selectedVendor.verification_status || selectedVendor.status) === 'suspended'
                            ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-400/50'
                            : 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 dark:text-purple-400'
                        }`}
                      >
                        <Ban size={13} /> Suspended
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Business Modules</span>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const types = Array.isArray(selectedVendor.business_types)
                          ? selectedVendor.business_types
                          : typeof selectedVendor.business_types === 'string'
                          ? (() => {
                              try {
                                return JSON.parse(selectedVendor.business_types);
                              } catch {
                                return selectedVendor.business_types.split(',').map((s) => s.trim()).filter(Boolean);
                              }
                            })()
                          : selectedVendor.business_type
                          ? [selectedVendor.business_type]
                          : [];
                        return types.length > 0 ? (
                          types.map((type) => (
                            <span key={type} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold">
                              {type}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">None</span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Location */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                  Location & Address
                </h4>
                <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Address</span>{selectedVendor.address || 'N/A'}</p>
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">City</span>{selectedVendor.city || 'N/A'}</p>
                  <p><span className="text-slate-400 block text-[10px] uppercase font-bold">District</span>{selectedVendor.district || 'N/A'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Latitude</span>{selectedVendor.latitude || 'N/A'}</p>
                    <p><span className="text-slate-400 block text-[10px] uppercase font-bold">Longitude</span>{selectedVendor.longitude || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Verification Documents */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                Verification Documents
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold mb-2">
                    Identity Document ({selectedVendor.identity_document_type || 'NIRA ID'})
                  </span>
                  <SecureDocumentLink 
                    path={selectedVendor.nira_id || selectedVendor.passport_number} 
                    vendorId={selectedVendor.id}
                    label="Identity Document"
                  />
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold mb-2">Government Patent / License</span>
                  <SecureDocumentLink 
                    path={selectedVendor.government_patent} 
                    vendorId={selectedVendor.id}
                    label="Government Patent"
                  />
                </div>
                {selectedVendor.logo_url && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 sm:col-span-2">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-2">Vendor Logo</span>
                    <SecureDocumentLink 
                      path={selectedVendor.logo_url} 
                      vendorId={selectedVendor.id}
                      label="Logo Link"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Internal Admin Notes */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
                Internal Admin Notes
              </h4>
              <div className="bg-amber-500/5 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 text-xs font-medium text-slate-700 dark:text-slate-300">
                {selectedVendor.admin_notes || 'No admin notes provided.'}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleViewVendorFinancialHistory(selectedVendor)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <DollarSign size={16} /> View Financial History
              </button>
              <button
                type="button"
                onClick={() => setSelectedVendor(null)}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Financial History Modal */}
      {showFinancialModal && selectedVendorForFinancial && (
        <Modal isOpen={showFinancialModal} onClose={() => setShowFinancialModal(false)} title={`Financial History: ${selectedVendorForFinancial.business_name || selectedVendorForFinancial.name}`}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto p-2">
            {loadingFinancial ? (
              <p className="text-center py-8 text-slate-400 text-xs font-semibold">Loading financial metrics...</p>
            ) : !vendorFinancialData ? (
              <p className="text-center py-8 text-slate-400 text-xs font-semibold">No financial records found for this vendor.</p>
            ) : (
              <div className="space-y-4">
                {/* Financial Summary Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Customer Revenue</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">${vendorFinancialData.summary.totalCustomerRevenue.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Subscriptions Paid</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">${vendorFinancialData.summary.totalSubscriptionsPaid.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Modules Paid</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">${vendorFinancialData.summary.totalModulesPaid.toFixed(2)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-800">
                    <p className="text-purple-700 dark:text-purple-400 text-[10px] uppercase font-bold">Refunds</p>
                    <p className="text-base font-black text-purple-900 dark:text-purple-300 mt-0.5">${vendorFinancialData.summary.totalRefunds.toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-200 dark:border-blue-800">
                    <p className="text-blue-700 dark:text-blue-400 text-[10px] uppercase font-bold">Settlements</p>
                    <p className="text-base font-black text-blue-900 dark:text-blue-300 mt-0.5">${vendorFinancialData.summary.totalSettlements.toFixed(2)}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <p className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-bold">Outstanding Balance</p>
                    <p className="text-base font-black text-emerald-900 dark:text-emerald-300 mt-0.5">${vendorFinancialData.summary.outstandingSettlementBalance.toFixed(2)}</p>
                  </div>
                </div>

                {/* Transactions Table */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Vendor Financial Transactions</h4>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase">
                        <th className="p-2.5">ID / Ref</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Total</th>
                        <th className="p-2.5">Payable</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {vendorFinancialData.transactions.map((t) => (
                        <tr key={t.id}>
                          <td className="p-2.5 font-bold font-mono text-slate-900 dark:text-white">{t.id}</td>
                          <td className="p-2.5 font-medium">{t.type}</td>
                          <td className="p-2.5 font-black">${t.totalAmount.toFixed(2)}</td>
                          <td className="p-2.5 font-bold text-emerald-600">${(t.vendorPayable || t.totalAmount).toFixed(2)}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default VendorsPage;
