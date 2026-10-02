import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, X, PlusCircle, Layers, Clock, ArrowRight } from 'lucide-react';
import api from '../../utils/api';
import VendorAvatar from '../../components/vendor/VendorAvatar';
import { useVendorProfile } from '../../hooks/useVendorProfile';
import { readStoredVendor, storeVendorProfile } from '../../utils/vendorIdentity';

const tabs = [
  { key: 'profile', label: 'Vendor Profile' },
  { key: 'business', label: 'Business Info' },
  { key: 'modules', label: 'Business Modules' },
  { key: 'payments', label: 'Payments' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
];

const defaultSettings = {
  email_notifications: true,
  order_alerts: true,
  delivery_alerts: true,
  inventory_alerts: true,
  promotion_alerts: true,
  security_alerts: true,
  two_factor_enabled: false,
};

const toProfileForm = (vendor = {}) => ({
  business_name: vendor.business_name || vendor.name || '',
  email: vendor.email || '',
  phone: vendor.phone || '',
  contact_name: vendor.contact_name || '',
  address: vendor.address || '',
  city: vendor.city || '',
  district: vendor.district || '',
  business_type: vendor.business_type || '',
  latitude: vendor.latitude || '',
  longitude: vendor.longitude || '',
  logo_url: vendor.logo_url || vendor.logo || '',
  logo: vendor.logo || vendor.logo_url || '',
  is_open: vendor.is_open !== undefined ? Boolean(vendor.is_open) : true,
  opening_time: vendor.opening_time || '06:00',
  closing_time: vendor.closing_time || '23:00',
  waafi_merchant_uid: vendor.waafi_merchant_uid || '',
  waafi_api_user_id: vendor.waafi_api_user_id || '',
  waafi_api_key: '',
  waafi_enabled: vendor.waafi_enabled !== undefined ? Boolean(vendor.waafi_enabled) : false,
});

const fieldClass = 'w-full bg-surface-container-low border border-outline-variant/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium';

const Field = ({ id, label, value, onChange, type = 'text', readOnly = false, placeholder = '', step }) => (
  <div className="space-y-2">
    <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</label>
    <input
      id={id}
      className={`${fieldClass} ${readOnly ? 'opacity-60' : ''}`}
      type={type}
      value={value ?? ''}
      onChange={onChange}
      readOnly={readOnly}
      placeholder={placeholder}
      step={step}
    />
  </div>
);

const Toggle = ({ id, title, subtitle, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
    <div>
      <span className="text-sm font-bold text-on-surface block">{title}</span>
      <span className="text-xs text-on-surface-variant font-medium block">{subtitle}</span>
    </div>
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  </div>
);

const Settings = () => {
  const navigate = useNavigate();
  const storedUser = readStoredVendor();
  const { vendor, setVendor, loading: profileLoading, refreshVendor } = useVendorProfile();
  const messageTimerRef = useRef(null);
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('vendor_settings_tab');
    return tabs.some((tab) => tab.key === savedTab) ? savedTab : 'profile';
  });
  const [formData, setFormData] = useState(() => toProfileForm(storedUser || {}));
  const [settings, setSettings] = useState(defaultSettings);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Business Modules state
  const [vendorModulesData, setVendorModulesData] = useState(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [upgradeModalModule, setUpgradeModalModule] = useState(null);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
  const [paymentFile, setPaymentFile] = useState(null);
  const [payRef, setPayRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EVC Plus');
  const [evcPhone, setEvcPhone] = useState('');
  const [evcPhoneError, setEvcPhoneError] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const fetchVendorModules = useCallback(async () => {
    setLoadingModules(true);
    try {
      const res = await api.get('/vendor/modules');
      setVendorModulesData(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load vendor business modules:', err);
    } finally {
      setLoadingModules(false);
    }
  }, []);

  const handleUpgradeSubmit = async (moduleItem) => {
    if (!moduleItem) return;
    setSubmittingUpgrade(true);
    try {
      const res = await api.post('/vendor/modules/request', {
        business_type_id: moduleItem.id
      });
      showMessage(res.data?.message || 'Your request has been sent to Admin for approval.');
      setUpgradeModalModule(null);
      await fetchVendorModules();
    } catch (err) {
      console.error(err);
      showMessage(err.response?.data?.message || 'Failed to submit module request.');
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const handleEvcPhoneChange = (val) => {
    // Keep optional leading +, then digits only (max 12 digits)
    const hasPlus = val.includes('+');
    const digitsOnly = val.replace(/\D/g, '').slice(0, 12);
    const formatted = hasPlus ? '+' + digitsOnly : digitsOnly;
    setEvcPhone(formatted);
    if (digitsOnly.length === 0) {
      setEvcPhoneError('');
    } else if (digitsOnly.length !== 12) {
      setEvcPhoneError('EVC phone number must contain exactly 12 digits (e.g. +252613345902).');
    } else {
      setEvcPhoneError('');
    }
  };

  const isPayFormValid = (moduleItem) => {
    if (!moduleItem) return false;
    if (!paymentMethod) return false;
    if (!payRef.trim()) return false;
    if (!paymentFile) return false;
    if (paymentMethod === 'EVC Plus') {
      const digitsOnly = evcPhone.replace(/\D/g, '');
      if (!/^\d{12}$/.test(digitsOnly)) return false;
    }
    return true;
  };

  const handlePaySubmit = async (moduleItem) => {
    if (!moduleItem) return;
    if (!paymentMethod) {
      showMessage('Please select a payment method.');
      return;
    }
    if (paymentMethod === 'EVC Plus') {
      const digitsOnly = evcPhone.replace(/\D/g, '');
      if (!/^\d{12}$/.test(digitsOnly)) {
        setEvcPhoneError('EVC phone number must contain exactly 12 digits (e.g. +252613345902).');
        return;
      }
    }
    if (!payRef.trim()) {
      showMessage('Transaction reference number is required.');
      return;
    }
    if (!paymentFile) {
      showMessage('Please upload a payment proof receipt.');
      return;
    }
    setSubmittingPayment(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('receipt', paymentFile);
      formDataToSend.append('payment_method', paymentMethod);
      if (paymentMethod === 'EVC Plus') {
        // Strip leading + before sending — backend expects digits only
        formDataToSend.append('evc_phone', evcPhone.replace(/\D/g, ''));
      }
      formDataToSend.append('reference_number', payRef.trim());
      formDataToSend.append('notes', `Payment for adding module: ${moduleItem.name}`);

      await api.post(`/vendor/modules/request/${moduleItem.request_id}/pay`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      showMessage('Your payment proof has been submitted for Admin verification.');
      setPaymentFile(null);
      setPayRef('');
      setPaymentMethod('EVC Plus');
      setEvcPhone('');
      setEvcPhoneError('');
      await fetchVendorModules();
    } catch (err) {
      console.error(err);
      showMessage(err.response?.data?.message || 'Failed to submit module payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'modules') {
      fetchVendorModules();
    }
  }, [activeTab, fetchVendorModules]);

  const effectiveVendor = useMemo(() => ({ ...(vendor || {}), ...formData }), [vendor, formData]);

  const dismissMessage = () => {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    setMessage('');
  };

  useEffect(() => {
    localStorage.setItem('vendor_settings_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (storedUser) {
      setFormData(toProfileForm(storedUser));
    }
  }, []);

  useEffect(() => {
    if (vendor) {
      setFormData(toProfileForm(vendor));
    }
  }, [vendor]);

  const showMessage = (msgText) => {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    setMessage(msgText);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage('');
      messageTimerRef.current = null;
    }, 5000);
  };

  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSettingChange = (e) => {
    const { id, checked } = e.target;
    setSettings((prev) => ({ ...prev, [id]: checked }));
  };

  const handlePasswordChange = (e) => {
    const { id, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showMessage('File size exceeds the 5MB limit.');
      return;
    }

    setLoading(true);
    const body = new FormData();
    body.append('logo', file);

    try {
      const res = await api.post('/vendor/upload-logo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!res.data?.success) throw new Error(res.data?.message || 'Upload failed');
      const uploadedUrl = res.data.logo_url || res.data.logo;
      setFormData((prev) => ({ ...prev, logo_url: uploadedUrl, logo: uploadedUrl }));
      storeVendorProfile({ logo_url: uploadedUrl, logo: uploadedUrl });
      await refreshVendor();
      showMessage('Logo uploaded successfully.');
    } catch (err) {
      console.error('Logo upload error:', err);
      showMessage(err.response?.data?.message || 'Failed to upload logo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      const payload = {
        business_name: formData.business_name,
        email: formData.email,
        phone: formData.phone,
        contact_name: formData.contact_name,
        address: formData.address,
        city: formData.city,
        district: formData.district,
        business_type: formData.business_type,
        latitude: formData.latitude,
        longitude: formData.longitude,
        logo_url: formData.logo_url || formData.logo,
        is_open: formData.is_open,
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        waafi_merchant_uid: formData.waafi_merchant_uid,
        waafi_api_user_id: formData.waafi_api_user_id,
        waafi_api_key: formData.waafi_api_key || undefined,
        waafi_enabled: formData.waafi_enabled,
      };

      const response = await api.put('/vendor/profile', payload);
      if (!response.data?.success) throw new Error(response.data?.message || 'Failed to save settings');
      const updatedVendor = response.data.vendor || response.data.data;
      if (updatedVendor) {
        setVendor(updatedVendor);
        storeVendorProfile(updatedVendor);
      }
      await refreshVendor();
      showMessage('Vendor profile saved successfully.');
    } catch (err) {
      console.error('Save profile error', err);
      showMessage(err.response?.data?.message || err.message || 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = () => {
    showMessage('Preferences saved successfully.');
  };

  const handleUpdatePassword = async () => {
    if (!passwordForm.current_password || !passwordForm.new_password) {
      showMessage('Please fill in both current and new password fields.');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showMessage('New password and confirmation do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.put('/vendor/security/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Password update failed');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      localStorage.removeItem('vendor_must_change_password');
      showMessage('Password updated successfully.');
    } catch (error) {
      console.error('Update password error', error);
      showMessage(error.response?.data?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  if (!storedUser?.id && !localStorage.getItem('vendor_token')) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
        <p className="text-on-surface-variant font-medium mb-6">No authenticated vendor session was found. Please sign in to access this page.</p>
        <button onClick={() => window.location.href = '/login'} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95">
          Go to Login
        </button>
      </div>
    );
  }

  const isSuccess = message.toLowerCase().includes('success') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('uploaded');

  return (
    <div className="max-w-5xl mx-auto py-4 space-y-12">
      {message && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 md:justify-end md:px-6 pointer-events-none">
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur-md transition-all ${
              isSuccess
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                : 'border-rose-200 bg-rose-50/95 text-rose-900'
            }`}
          >
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isSuccess ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              {isSuccess ? <CheckCircle2 size={20} className="text-emerald-600" /> : <AlertTriangle size={20} className="text-rose-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{isSuccess ? 'Saved successfully' : 'Action needed'}</p>
              <p className="mt-1 text-sm font-medium leading-relaxed break-words">{message}</p>
            </div>
            <button
              type="button"
              onClick={dismissMessage}
              className={`rounded-full p-1 transition-colors ${isSuccess ? 'text-emerald-700 hover:bg-emerald-100' : 'text-rose-700 hover:bg-rose-100'}`}
              aria-label="Dismiss notification"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <h2 className="text-3xl font-bold font-headline tracking-tight text-on-surface">Account Settings</h2>
          <p className="text-on-surface-variant font-medium mt-1">Manage your storefront presence, business details, and preferences.</p>
        </div>
      </header>

      <div className="flex gap-8 border-b border-outline-variant/10 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`pb-4 text-sm font-bold tracking-wide transition-all whitespace-nowrap ${activeTab === tab.key ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-20">
        <div className="lg:col-span-8 space-y-8">
          {profileLoading ? (
            <section className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/10 shadow-sm text-on-surface-variant font-bold">
              Loading settings...
            </section>
          ) : (
            <>
              {activeTab === 'profile' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-8 border border-outline-variant/10 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1 font-headline">Public Profile</h3>
                    <p className="text-sm text-on-surface-variant font-medium">This information is displayed to customers on your storefront.</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <VendorAvatar vendor={effectiveVendor} size="lg" rounded="rounded-2xl" className="border-2 border-white shadow-sm" />
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input id="logo_file" type="file" onChange={handleFileChange} accept="image/png, image/jpeg, image/jpg, image/webp" className="hidden" />
                        <button type="button" onClick={() => document.getElementById('logo_file')?.click()} className="bg-primary text-on-primary text-[10px] font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-primary-dim transition-all">
                          Upload Logo
                        </button>
                        <button type="button" onClick={() => setFormData((prev) => ({ ...prev, logo_url: '', logo: '' }))} className="bg-surface-container-high text-on-surface text-[10px] font-bold px-4 py-2 rounded-lg hover:bg-surface-container-highest transition-all">
                          Remove
                        </button>
                      </div>
                      <p className="text-[10px] text-on-surface-variant font-medium">PNG, JPG, JPEG, or WEBP up to 5MB.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Field id="business_name" label="Shop Name" value={formData.business_name} onChange={handleChange} />
                    <Field id="email" label="Contact Email" value={formData.email} onChange={handleChange} type="email" />
                    <Field id="contact_name" label="Contact Name" value={formData.contact_name} onChange={handleChange} />
                    <Field id="phone" label="Phone" value={formData.phone} onChange={handleChange} />
                  </div>
                </section>
              )}

              {activeTab === 'business' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-6 border border-outline-variant/10 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1 font-headline">Business Information</h3>
                    <p className="text-sm text-on-surface-variant font-medium">Location details, business category, and operational hours.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Field id="business_type" label="Business Type" value={formData.business_type} onChange={handleChange} placeholder="Gas Depot, Petrol Station, Car Services, etc." />
                    <Field id="address" label="Address" value={formData.address} onChange={handleChange} />
                    <Field id="city" label="City" value={formData.city} onChange={handleChange} />
                    <Field id="district" label="District" value={formData.district} onChange={handleChange} />
                    <Field id="latitude" label="Latitude" value={formData.latitude} onChange={handleChange} type="number" step="any" />
                    <Field id="longitude" label="Longitude" value={formData.longitude} onChange={handleChange} type="number" step="any" />
                    <Field id="opening_time" label="Opening Time" value={formData.opening_time} onChange={handleChange} type="time" />
                    <Field id="closing_time" label="Closing Time" value={formData.closing_time} onChange={handleChange} type="time" />
                  </div>
                  <Toggle id="is_open" title="Storefront Open Status" subtitle="Set whether your business is actively accepting orders." checked={formData.is_open} onChange={handleChange} />
                </section>
              )}

              {activeTab === 'modules' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-6 border border-outline-variant/10 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-on-surface font-headline">Business Modules</h3>
                      <p className="text-sm text-on-surface-variant font-medium">Expand your business operations by adding new modules to your vendor account.</p>
                    </div>
                    {vendorModulesData?.current_plan && (
                      <div className="px-4 py-2 bg-primary/10 rounded-xl border border-primary/20 flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-xs font-bold text-primary uppercase">Current Plan:</span>
                        <span className="text-sm font-extrabold text-on-surface">{vendorModulesData.current_plan} (${vendorModulesData.current_fee}/mo)</span>
                      </div>
                    )}
                  </div>

                  {loadingModules ? (
                    <div className="py-12 text-center text-sm font-bold text-on-surface-variant">Loading business modules...</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {vendorModulesData?.modules?.map((m) => (
                        <div key={m.id} className="p-5 bg-surface-container-low rounded-2xl border border-outline-variant/10 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="font-extrabold text-base text-on-surface">{m.name}</span>
                              {m.is_active ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                                  ✓ Active
                                </span>
                              ) : m.is_pending ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                                  ⏳ Pending Approval
                                </span>
                              ) : m.is_payment_pending ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                                  ⏳ Payment Pending
                                </span>
                              ) : m.is_payment_required ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/10 text-purple-600 border border-purple-500/20 flex items-center gap-1">
                                  💳 Payment Required
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                  Not Active
                                </span>
                              )}
                            </div>

                            <div className="text-xs font-semibold text-on-surface-variant mt-2">
                              {m.is_active ? (
                                <p className="text-emerald-600 font-bold">Included in active plan</p>
                              ) : (
                                <p>
                                  Monthly Subscription: <strong className="text-on-surface">${m.next_monthly_fee}/mo</strong>
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            {m.is_active ? (
                              <button disabled className="w-full py-2.5 px-4 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl opacity-80 cursor-not-allowed">
                                Already Active
                              </button>
                            ) : m.is_pending ? (
                              <button disabled className="w-full py-2.5 px-4 bg-amber-50 text-amber-700 font-bold text-xs rounded-xl opacity-80 cursor-not-allowed">
                                Pending Admin Approval
                              </button>
                            ) : m.is_payment_pending ? (
                              <button disabled className="w-full py-2.5 px-4 bg-blue-50 text-blue-700 font-bold text-xs rounded-xl opacity-80 cursor-not-allowed">
                                Payment Pending Verification
                              </button>
                            ) : m.is_payment_required ? (
                              <div className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3 text-left">
                                {/* Summary */}
                                <div className="text-xs space-y-1 pb-2 border-b border-outline-variant/10">
                                  <p className="text-on-surface-variant font-bold text-[11px] uppercase tracking-wider">Approved – Payment Required</p>
                                  <p className="text-on-surface-variant">Module Price: <span className="font-extrabold text-on-surface">${Number(m.upgrade_amount_due).toFixed(2)}</span></p>
                                  <p className="text-on-surface-variant">Amount Due Now: <span className="font-extrabold text-emerald-600">${Number(m.upgrade_amount_due).toFixed(2)}</span></p>
                                </div>

                                {/* Payment Method */}
                                <div className="space-y-1">
                                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                                    Payment Method <span className="text-rose-500">*</span>
                                  </label>
                                  <select
                                    value={paymentMethod}
                                    onChange={(e) => { setPaymentMethod(e.target.value); setEvcPhone(''); setEvcPhoneError(''); }}
                                    className="w-full bg-surface-container-low border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-medium outline-none text-on-surface appearance-none"
                                  >
                                    <option value="EVC Plus">EVC Plus</option>
                                    <option value="WaafiPay">WaafiPay</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>

                                {/* EVC Phone Number – only when EVC Plus selected */}
                                {paymentMethod === 'EVC Plus' && (
                                  <div className="space-y-1">
                                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                                      EVC Phone Number <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={evcPhone}
                                      onKeyDown={(e) => {
                                        const allowed = ['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
                                        if (allowed.includes(e.key)) return;
                                        if (e.ctrlKey || e.metaKey) return;
                                        // Allow + once (as long as no + already in the field)
                                        if (e.key === '+' && !evcPhone.includes('+')) return;
                                        // Block anything that is not a digit
                                        if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
                                        // Block once 12 digits are already present
                                        const currentDigits = evcPhone.replace(/\D/g, '');
                                        if (currentDigits.length >= 12) e.preventDefault();
                                      }}
                                      onPaste={(e) => {
                                        e.preventDefault();
                                        const pasted = (e.clipboardData || window.clipboardData).getData('text');
                                        handleEvcPhoneChange(evcPhone + pasted);
                                      }}
                                      onChange={(e) => handleEvcPhoneChange(e.target.value)}
                                      placeholder="e.g. +252613345902"
                                      className={`w-full bg-surface-container-low border rounded-xl py-2 px-3 text-xs font-medium outline-none text-on-surface transition-colors ${
                                        evcPhoneError
                                          ? 'border-rose-500 bg-rose-50/30'
                                          : evcPhone.replace(/\D/g, '').length === 12 && !evcPhoneError
                                            ? 'border-emerald-500'
                                            : 'border-outline-variant/10'
                                      }`}
                                    />
                                    {evcPhoneError ? (
                                      <p className="text-rose-500 text-[10px] font-bold flex items-center gap-1 mt-1">
                                        <span>⚠</span> {evcPhoneError}
                                      </p>
                                    ) : evcPhone.replace(/\D/g, '').length === 12 ? (
                                      <p className="text-emerald-600 text-[10px] font-bold flex items-center gap-1 mt-1">
                                        <span>✓</span> Valid EVC phone number
                                      </p>
                                    ) : evcPhone.length > 0 ? (
                                      <p className="text-on-surface-variant text-[10px] mt-1">
                                        {evcPhone.replace(/\D/g, '').length}/12 digits entered
                                      </p>
                                    ) : null}
                                  </div>
                                )}

                                {/* Upload Payment Proof */}
                                <div className="space-y-1.5 pt-1">
                                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                                    Upload Payment Proof <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.pdf"
                                    onChange={(e) => setPaymentFile(e.target.files[0])}
                                    className="w-full text-xs text-on-surface-variant file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                  />
                                  {paymentFile && (
                                    <p className="text-emerald-600 text-[10px] font-bold">✓ {paymentFile.name}</p>
                                  )}
                                </div>

                                {/* Transaction Reference */}
                                <div className="space-y-1">
                                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                                    Transaction Reference <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={payRef}
                                    onChange={(e) => setPayRef(e.target.value)}
                                    placeholder="e.g. TXN10293847"
                                    className="w-full bg-surface-container-low border border-outline-variant/10 rounded-xl py-2 px-3 text-xs font-medium outline-none text-on-surface"
                                  />
                                </div>

                                {/* Submit Button */}
                                <button
                                  type="button"
                                  disabled={submittingPayment || !isPayFormValid(m)}
                                  onClick={() => handlePaySubmit(m)}
                                  className={`w-full py-2.5 px-4 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                                    isPayFormValid(m)
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  }`}
                                >
                                  {submittingPayment ? 'Submitting...' : 'Pay Now / Submit Proof'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setUpgradeModalModule(m)}
                                className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                Add Module
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'payments' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-6 border border-outline-variant/10 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1 font-headline">Hurmood Payments (WaafiPay API)</h3>
                    <p className="text-sm text-on-surface-variant font-medium">Manage merchant credentials for customer payments.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Field
                      id="waafi_merchant_uid"
                      label="Merchant UID"
                      value={formData.waafi_merchant_uid}
                      onChange={handleChange}
                      placeholder="HURMOOD_MERCHANT_UID"
                    />
                    <Field
                      id="waafi_api_user_id"
                      label="API User ID"
                      value={formData.waafi_api_user_id}
                      onChange={handleChange}
                      placeholder="HURMOOD_API_USER_ID"
                    />
                  </div>

                  <Field
                    id="waafi_api_key"
                    label="API Key"
                    value={formData.waafi_api_key}
                    onChange={handleChange}
                    type="password"
                    placeholder="HURMOOD_API_KEY"
                  />

                  <Toggle
                    id="waafi_enabled"
                    title="Enable Hurmood Payments"
                    subtitle="Use these credentials for this vendor's wallet payments."
                    checked={formData.waafi_enabled}
                    onChange={handleChange}
                  />

                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-on-surface mb-1">Current status</p>
                    <p className="text-sm text-on-surface-variant">
                      {effectiveVendor.waafi_enabled && effectiveVendor.waafi_api_key_set
                        ? 'Hurmood is configured for this vendor.'
                        : 'Hurmood is not fully configured yet.'}
                    </p>
                  </div>
                </section>
              )}

              {activeTab === 'notifications' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-6 border border-outline-variant/10 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1 font-headline">Notification Preferences</h3>
                    <p className="text-sm text-on-surface-variant font-medium">Choose which vendor alerts should be sent to your account.</p>
                  </div>
                  <Toggle id="email_notifications" title="Email Notifications" subtitle="Receive important updates by email." checked={settings.email_notifications} onChange={handleSettingChange} />
                  <Toggle id="order_alerts" title="Order Alerts" subtitle="New orders, accepted orders, and customer updates." checked={settings.order_alerts} onChange={handleSettingChange} />
                  <Toggle id="delivery_alerts" title="Delivery Alerts" subtitle="Driver assignment and delivery progress updates." checked={settings.delivery_alerts} onChange={handleSettingChange} />
                  <Toggle id="inventory_alerts" title="Inventory Alerts" subtitle="Low stock and restock reminders." checked={settings.inventory_alerts} onChange={handleSettingChange} />
                  <Toggle id="promotion_alerts" title="Promotion Alerts" subtitle="Offer performance and promotion activity." checked={settings.promotion_alerts} onChange={handleSettingChange} />
                </section>
              )}

              {activeTab === 'security' && (
                <section className="bg-surface-container-lowest rounded-2xl p-8 space-y-8 border border-outline-variant/10 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-1 font-headline">Security Settings</h3>
                    <p className="text-sm text-on-surface-variant font-medium">Update your password and account security preferences.</p>
                  </div>
                  <div className="space-y-6">
                    <Field id="current_password" label="Current Password" value={passwordForm.current_password} onChange={handlePasswordChange} type="password" />
                    <Field id="new_password" label="New Password" value={passwordForm.new_password} onChange={handlePasswordChange} type="password" />
                    <Field id="confirm_password" label="Confirm New Password" value={passwordForm.confirm_password} onChange={handlePasswordChange} type="password" />
                    <Toggle id="security_alerts" title="Security Alerts" subtitle="Get alerts for password and sign-in changes." checked={settings.security_alerts} onChange={handleSettingChange} />
                    <Toggle id="two_factor_enabled" title="Two-Factor Authentication" subtitle="Store your 2FA preference for this account." checked={settings.two_factor_enabled} onChange={handleSettingChange} />
                  </div>
                </section>
              )}
            </>
          )}

          <div className="flex justify-end gap-3">
            {activeTab === 'notifications' || activeTab === 'security' ? (
              <button onClick={handleSaveSettings} disabled={loading} className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold py-3.5 px-6 rounded-xl transition-all disabled:opacity-50">
                {loading ? 'Saving...' : 'Save Preferences'}
              </button>
            ) : null}
            {activeTab === 'security' ? (
              <button onClick={handleUpdatePassword} disabled={loading} className="bg-primary hover:bg-primary-dim text-on-primary font-bold py-3.5 px-8 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                {loading ? 'Saving...' : 'Update Password'}
              </button>
            ) : activeTab !== 'modules' ? (
              <button onClick={handleSaveProfile} disabled={loading || profileLoading} className="bg-primary hover:bg-primary-dim text-on-primary font-bold py-3.5 px-10 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-low/50 rounded-2xl p-6 border border-outline-variant/10">
            <div className="flex items-center gap-4 mb-5">
              <VendorAvatar vendor={effectiveVendor} size="md" rounded="rounded-xl" />
              <div>
                <h4 className="font-bold text-on-surface font-headline">{formData.business_name || 'Vendor'}</h4>
                <p className="text-xs text-on-surface-variant font-bold uppercase">{vendor?.verification_status || 'pending'}</p>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed font-medium">
              {formData.address || 'Add your business address so customers can identify your storefront and delivery area.'}
            </p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
            <h4 className="font-bold text-primary mb-2 font-headline">Security Status</h4>
            <p className="text-xs text-on-surface-variant leading-relaxed font-medium">
              {settings.two_factor_enabled ? 'Two-factor authentication preference is enabled.' : 'Two-factor authentication preference is currently disabled.'}
            </p>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL: ADD BUSINESS MODULE */}
      {upgradeModalModule && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <div>
                <h3 className="font-extrabold text-lg text-on-surface">Add {upgradeModalModule.name} Module</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Confirm expansion of your business capabilities.</p>
              </div>
              <button type="button" onClick={() => setUpgradeModalModule(null)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-on-surface-variant leading-relaxed">
                Adding the <strong>{upgradeModalModule.name}</strong> module will send an activation request to Admin.
              </p>

              <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-on-surface-variant">Current Active Modules:</span>
                  <span className="font-extrabold text-on-surface text-right max-w-[200px] truncate">
                    {vendorModulesData?.modules?.filter(m => m.is_active).map(m => m.name).join(', ') || 'None'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant/10">
                  <span className="font-bold text-on-surface-variant">Requested Module:</span>
                  <span className="font-extrabold text-primary">{upgradeModalModule.name}</span>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant/10">
                  <span className="font-bold text-on-surface-variant">Requested Date:</span>
                  <span className="font-extrabold text-on-surface">{new Date().toLocaleDateString()}</span>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant/10">
                  <span className="font-bold text-on-surface-variant">New Monthly Price (after approval):</span>
                  <span className="font-extrabold text-emerald-600">${Number(upgradeModalModule.next_monthly_fee).toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-outline-variant/10">
                  <span className="font-bold text-on-surface-variant">Request Status:</span>
                  <span className="font-extrabold text-amber-600">Pending Admin Approval</span>
                </div>
              </div>

              <p className="text-[11px] text-on-surface-variant font-medium">
                No immediate payment is required. The adjusted monthly rate will apply starting from your next billing cycle.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingUpgrade}
                onClick={() => setUpgradeModalModule(null)}
                className="px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingUpgrade}
                onClick={() => handleUpgradeSubmit(upgradeModalModule)}
                className="px-6 py-2.5 bg-primary hover:bg-primary-dim text-on-primary font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {submittingUpgrade ? 'Submitting...' : 'Submit Module Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
