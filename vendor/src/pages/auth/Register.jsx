import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Lock,
  Mail,
  MapPin,
  Phone,
  Upload,
  Store,
  User,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import api from '../../utils/api';
import BrandLogo from '../../components/shared/BrandLogo';

const FieldError = ({ id, message }) => (
  message ? <p id={`${id}-error`} className="px-1 text-xs font-semibold text-rose-600">{message}</p> : null
);

const DocumentPicker = ({ id, label, file, onChange, hint, error }) => (
  <div className="space-y-2">
    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor={id}>
      {label}
    </label>
    <label
      htmlFor={id}
      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-surface-container-low px-4 py-4 transition-all hover:bg-surface-container-low/80 ${error ? 'border-rose-400 hover:border-rose-500' : 'border-outline-variant/10 hover:border-primary/30'}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Upload size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">
            {file?.name || `Upload ${label}`}
          </p>
          <p className="text-[11px] text-on-surface-variant">{hint}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
        {file ? 'Replace' : 'Choose'}
      </span>
    </label>
    <input
      accept=".pdf,.png,.jpg,.jpeg"
      className="hidden"
      id={id}
      onChange={onChange}
      type="file"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
    />
    <FieldError id={id} message={error} />
  </div>
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{9,12}$/;
const NAME_PATTERN = /^[\p{L} .,'&-]{2,80}$/u;
const LOCATION_PATTERN = /^[\p{L}0-9 .,'#&/()-]{5,255}$/u;
const ACCEPTED_DOCUMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const documentError = (file, label) => {
  if (!file) return `${label} is required.`;
  const extension = String(file.name || '').toLowerCase().split('.').pop();
  const hasAcceptedExtension = ['pdf', 'png', 'jpg', 'jpeg'].includes(extension);
  if (!ACCEPTED_DOCUMENT_TYPES.has(file.type) && !hasAcceptedExtension) {
    return `${label} must be PDF, PNG, JPG, or JPEG.`;
  }
  if (file.size > MAX_DOCUMENT_BYTES) return `${label} must be 10MB or smaller.`;
  return '';
};

const validateRegistration = (data) => {
  const errors = {};
  const name = String(data.name || '').trim();
  const ownerName = String(data.contact_name || '').trim();
  const address = String(data.address || '').trim();
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const password = String(data.password || '');
  const confirmPassword = String(data.confirm_password || '');

  if (!name) errors.name = 'Vendor name is required.';
  else if (!NAME_PATTERN.test(name)) errors.name = 'Vendor name must contain 2-80 letters and cannot include numbers.';
  if (!ownerName) errors.contact_name = 'Owner name is required.';
  else if (!NAME_PATTERN.test(ownerName)) errors.contact_name = 'Owner name must contain 2-80 letters and cannot include numbers.';
  if (!address) errors.address = 'Location is required.';
  else if (!LOCATION_PATTERN.test(address)) errors.address = 'Location must be 5-255 characters and may include numbers.';
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  if (!PHONE_PATTERN.test(phone)) errors.phone = 'Enter a valid phone number (e.g. +252613344556).';
  if (password.length < 10 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must be 10-72 characters and include a letter and a number.';
  }
  if (!confirmPassword) {
    errors.confirm_password = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirm_password = 'Passwords do not match.';
  }

  if (!['nira', 'passport'].includes(data.identity_document_type)) {
    errors.identity_document_type = 'Choose NIRA ID or Owner Passport.';
  } else {
    const field = data.identity_document_type === 'nira' ? 'nira_id_document' : 'passport_document';
    const label = data.identity_document_type === 'nira' ? 'NIRA ID Document' : 'Owner Passport Document';
    const error = documentError(data[field], label);
    if (error) errors[field] = error;
  }

  const patentError = documentError(data.government_patent_document, 'Government Patent Document');
  if (patentError) errors.government_patent_document = patentError;
  const identityField = data.identity_document_type === 'nira' ? 'nira_id_document' : 'passport_document';
  const identityDocument = data[identityField];
  const patentDocument = data.government_patent_document;
  if (identityDocument && patentDocument
    && String(identityDocument.name || '').trim().toLowerCase() === String(patentDocument.name || '').trim().toLowerCase()) {
    errors.government_patent_document = 'Upload a different file for the Government Patent Document.';
  }
  if (!Array.isArray(data.business_types) || data.business_types.length === 0) {
    errors.business_types = 'Select at least one business type.';
  }

  const waafiFields = [
    ['waafi_merchant_uid', 'Merchant UID'],
    ['waafi_api_user_id', 'API User ID'],
    ['waafi_api_key', 'API Key'],
  ];
  for (const [field, label] of waafiFields) {
    const value = String(data[field] || '').trim();
    if (!value) errors[field] = `${label} is required.`;
  }

  return errors;
};

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    contact_name: '',
    address: '',
    identity_document_type: '',
    nira_id_document: null,
    government_patent_document: null,
    passport_document: null,
    waafi_merchant_uid: '',
    waafi_api_user_id: '',
    waafi_api_key: '',
    business_types: []
  });
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => ({
      ...prev,
      [id]: '',
      ...(id === 'password' || id === 'confirm_password' ? { confirm_password: '' } : {}),
    }));
    setSubmitError('');
  };

  const handleNameChange = (e) => {
    const { id, value } = e.target;
    const cleaned = value.replace(/[0-9]/g, '');
    setFormData((prev) => ({ ...prev, [id]: cleaned }));
    setFieldErrors((prev) => ({ ...prev, [id]: '' }));
    setSubmitError('');
  };
  const handlePhoneChange = (e) => {
    let raw = e.target.value;
    let cleaned = raw.startsWith('+')
      ? '+' + raw.slice(1).replace(/\D/g, '')
      : raw.replace(/\D/g, '');
    cleaned = cleaned.slice(0, 13);
    setFormData((prev) => ({ ...prev, phone: cleaned }));
    setFieldErrors((prev) => ({ ...prev, phone: '' }));
    setSubmitError('');
  };

  // Client-side pre-check for fast feedback only. The backend verifies the file's
  // actual magic bytes and is the authority - this can be bypassed and is not
  // relied upon for security.
  const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
  const ALLOWED_DOCUMENT_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];

  const handleFileChange = (e) => {
    const field = e.target.id;
    const file = e.target.files?.[0] || null;

    if (file) {
      const name = file.name || '';
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_DOCUMENT_EXTS.includes(ext)) {
        e.target.value = '';
        setFormData((prev) => ({ ...prev, [field]: null }));
        setFieldErrors((prev) => ({
          ...prev,
          [field]: 'Only PDF, JPG, JPEG and PNG files are accepted.',
        }));
        return;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        e.target.value = '';
        setFormData((prev) => ({ ...prev, [field]: null }));
        setFieldErrors((prev) => ({ ...prev, [field]: 'This file is larger than the 10MB limit.' }));
        return;
      }
      if (file.size === 0) {
        e.target.value = '';
        setFormData((prev) => ({ ...prev, [field]: null }));
        setFieldErrors((prev) => ({ ...prev, [field]: 'This file is empty.' }));
        return;
      }
    }

    setFormData((prev) => ({ ...prev, [field]: file }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setSubmitError('');
  };

  const handleIdentityDocumentTypeChange = (e) => {
    const identityDocumentType = e.target.value;
    setFormData((prev) => ({
      ...prev,
      identity_document_type: identityDocumentType,
      nira_id_document: null,
      passport_document: null,
    }));
    setFieldErrors((prev) => ({
      ...prev,
      identity_document_type: '',
      nira_id_document: '',
      passport_document: '',
    }));
    setSubmitError('');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitError('');
    const waafiMerchantUid = String(formData.waafi_merchant_uid || '').trim();
    const waafiApiUserId = String(formData.waafi_api_user_id || '').trim();
    const waafiApiKey = String(formData.waafi_api_key || '').trim();
    const hasAllWaafiFields = Boolean(waafiMerchantUid && waafiApiUserId && waafiApiKey);
    const identityDocumentType = formData.identity_document_type;

    const validationErrors = validateRegistration(formData);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setSubmitError('Please correct the highlighted registration fields.');
      const firstField = Object.keys(validationErrors)[0];
      window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      return;
    }

    setFieldErrors({});

    setLoading(true);

    try {
      const payload = new FormData();
      payload.append('name', formData.name);
      payload.append('email', formData.email);
      payload.append('password', formData.password);
      payload.append('phone', formData.phone);
      payload.append('contact_name', formData.contact_name);
      payload.append('address', formData.address);
      payload.append('business_types', JSON.stringify(formData.business_types));
      payload.append('identity_document_type', identityDocumentType);
      if (identityDocumentType === 'nira') {
        payload.append('nira_id_document', formData.nira_id_document);
      } else {
        payload.append('passport_document', formData.passport_document);
      }
      payload.append('government_patent_document', formData.government_patent_document);
      if (hasAllWaafiFields) {
        payload.append('waafi_merchant_uid', waafiMerchantUid);
        payload.append('waafi_api_user_id', waafiApiUserId);
        payload.append('waafi_api_key', waafiApiKey);
        payload.append('waafi_enabled', '1');
      } else {
        payload.append('waafi_enabled', '0');
      }

      await api.post('/vendor/register', payload);
      navigate('/login');
    } catch (err) {
      console.error(err);
      const serverErrors = err.response?.data?.errors;
      if (serverErrors && typeof serverErrors === 'object') {
        setFieldErrors(serverErrors);
        setSubmitError(err.response?.data?.message || 'Please correct the highlighted registration fields.');
        const firstField = Object.keys(serverErrors)[0];
        window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      } else {
        setError(err.response?.data?.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container font-body px-4 py-8 lg:py-12 flex items-center justify-center">
      {error && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl overflow-hidden">
            <div className="flex items-start gap-4 p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <AlertTriangle size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-on-surface">Registration Error</p>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant font-medium">
                  {error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
                aria-label="Close popup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="border-t border-outline-variant/10 bg-surface-container-low px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => setError('')}
                className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dim transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl">
        {/* Brand logo */}
        <BrandLogo size="lg" className="mb-8" />

        {/* Main Register Card */}
        <div className="bg-surface-container-lowest rounded-[32px] p-6 md:p-8 lg:p-10 shadow-2xl shadow-black/5 relative overflow-hidden border border-outline-variant/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>

          <header className="mb-8 relative z-10 max-w-2xl">
            <h1 className="font-headline text-3xl font-bold text-on-surface mb-2">Create Account</h1>
            <p className="text-on-surface-variant font-medium text-sm">Join the vendor network.</p>
          </header>

          <form onSubmit={handleRegister} className="relative z-10" noValidate>
            {submitError && (
              <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
                {submitError}
              </div>
            )}
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="name">Vendor Name</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                      <Store size={20} aria-hidden="true" />
                    </div>
                    <input
                      className="block w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="name"
                      placeholder="Global Fuels"
                      value={formData.name}
                      onChange={handleNameChange}
                      minLength={2}
                      maxLength={80}
                      aria-invalid={Boolean(fieldErrors.name)}
                      type="text"
                    />
                  </div>
                  <FieldError id="name" message={fieldErrors.name} />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="contact_name">Owner Name</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                      <User size={20} aria-hidden="true" />
                    </div>
                    <input
                      className="block w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="contact_name"
                      placeholder="Abdirahman Ali"
                      value={formData.contact_name}
                      onChange={handleNameChange}
                      minLength={2}
                      maxLength={80}
                      aria-invalid={Boolean(fieldErrors.contact_name)}
                      type="text"
                    />
                  </div>
                  <FieldError id="contact_name" message={fieldErrors.contact_name} />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="address">Location</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                      <MapPin size={20} aria-hidden="true" />
                    </div>
                    <input
                      className="block w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="address"
                      placeholder="Km4, Mogadishu, Somalia"
                      value={formData.address}
                      onChange={handleChange}
                      minLength={5}
                      maxLength={255}
                      aria-invalid={Boolean(fieldErrors.address)}
                      type="text"
                    />
                  </div>
                  <FieldError id="address" message={fieldErrors.address} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="email">Email Address</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                        <Mail size={20} aria-hidden="true" />
                      </div>
                      <input
                        className="block w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                        id="email"
                        autoComplete="email"
                        placeholder="admin@vendor.com"
                        value={formData.email}
                        onChange={handleChange}
                        maxLength={254}
                        aria-invalid={Boolean(fieldErrors.email)}
                        type="email"
                      />
                    </div>
                    <FieldError id="email" message={fieldErrors.email} />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="phone">Phone Number</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                        <Phone size={20} aria-hidden="true" />
                      </div>
                      <input
                        className="block w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                        id="phone"
                        placeholder="+252613344556"
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        maxLength={13}
                        inputMode="tel"
                        autoComplete="tel"
                        aria-invalid={Boolean(fieldErrors.phone)}
                        type="tel"
                      />
                    </div>
                    <FieldError id="phone" message={fieldErrors.phone} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="password">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                      <Lock size={20} aria-hidden="true" />
                    </div>
                    <input
                      className="block w-full pl-12 pr-12 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="password"
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={handleChange}
                      minLength={10}
                      maxLength={72}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                      type={showPassword ? 'text' : 'password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant hover:text-primary"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <FieldError id="password" message={fieldErrors.password} />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="confirm_password">Confirm Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
                      <Lock size={20} aria-hidden="true" />
                    </div>
                    <input
                      className="block w-full pl-12 pr-12 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="confirm_password"
                      placeholder="Re-enter password"
                      value={formData.confirm_password}
                      onChange={handleChange}
                      minLength={10}
                      maxLength={72}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.confirm_password)}
                      aria-describedby={fieldErrors.confirm_password ? 'confirm_password-error' : undefined}
                      type={showConfirmPassword ? 'text' : 'password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant hover:text-primary"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <FieldError id="confirm_password" message={fieldErrors.confirm_password} />
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="identity_document_type">
                    Owner Identity Document
                  </label>
                  <select
                    id="identity_document_type"
                    value={formData.identity_document_type}
                    onChange={handleIdentityDocumentTypeChange}
                    aria-invalid={Boolean(fieldErrors.identity_document_type)}
                    className="block w-full cursor-pointer appearance-none rounded-2xl border border-outline-variant/10 bg-surface-container-low px-4 py-3.5 font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="" disabled>Select document type</option>
                    <option value="nira">NIRA ID Document</option>
                    <option value="passport">Owner Passport Document</option>
                  </select>
                  <p className="px-1 text-[11px] text-on-surface-variant">Choose one identity document to upload.</p>
                  <FieldError id="identity_document_type" message={fieldErrors.identity_document_type} />
                </div>

                {formData.identity_document_type === 'nira' && (
                  <DocumentPicker
                    id="nira_id_document"
                    label="NIRA ID Document"
                    file={formData.nira_id_document}
                    onChange={handleFileChange}
                    hint="Upload a clear photo or PDF of the NIRA ID."
                    error={fieldErrors.nira_id_document}
                  />
                )}

                {formData.identity_document_type === 'passport' && (
                  <DocumentPicker
                    id="passport_document"
                    label="Owner Passport Document"
                    file={formData.passport_document}
                    onChange={handleFileChange}
                    hint="Upload a clear photo or PDF of the owner passport."
                    error={fieldErrors.passport_document}
                  />
                )}

                <DocumentPicker
                  id="government_patent_document"
                  label="Government Patent Document"
                  file={formData.government_patent_document}
                  onChange={handleFileChange}
                  hint="Upload the business license or patent document."
                  error={fieldErrors.government_patent_document}
                />

                <div className="space-y-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-4">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      Hurmood Payment Credentials <span className="text-red-500">*</span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      Required for vendor payment setup. Enter all three Hurmood credentials.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="waafi_merchant_uid">
                        Merchant UID
                      </label>
                      <input
                        className="block w-full px-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                        id="waafi_merchant_uid"
                        placeholder="HURMOOD_MERCHANT_UID"
                        value={formData.waafi_merchant_uid}
                        onChange={handleChange}
                        maxLength={120}
                        aria-invalid={Boolean(fieldErrors.waafi_merchant_uid)}
                        type="text"
                      />
                      <FieldError id="waafi_merchant_uid" message={fieldErrors.waafi_merchant_uid} />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="waafi_api_user_id">
                        API User ID
                      </label>
                      <input
                        className="block w-full px-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                        id="waafi_api_user_id"
                        placeholder="HURMOOD_API_USER_ID"
                        value={formData.waafi_api_user_id}
                        onChange={handleChange}
                        maxLength={120}
                        aria-invalid={Boolean(fieldErrors.waafi_api_user_id)}
                        type="text"
                      />
                      <FieldError id="waafi_api_user_id" message={fieldErrors.waafi_api_user_id} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="waafi_api_key">
                      API Key
                    </label>
                    <input
                      className="block w-full px-4 py-3.5 bg-surface-container-low border border-outline-variant/10 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                      id="waafi_api_key"
                      placeholder="HURMOOD_API_KEY"
                      value={formData.waafi_api_key}
                      onChange={handleChange}
                      maxLength={1024}
                      autoComplete="new-password"
                      aria-invalid={Boolean(fieldErrors.waafi_api_key)}
                      type="password"
                    />
                    <FieldError id="waafi_api_key" message={fieldErrors.waafi_api_key} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">Business Types</label>
                  <div id="business_types" className={`grid gap-2 p-4 bg-surface-container-low border rounded-2xl ${fieldErrors.business_types ? 'border-rose-400' : 'border-outline-variant/10'}`}>
                    {['Petrol Station', 'Gas Depot', 'Spare Parts Shop', 'Car Services'].map(type => (
                      <label key={type} className="flex items-center gap-2 text-sm text-on-surface cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={formData.business_types.includes(type)}
                          onChange={(e) => {
                            setFormData((prev) => ({
                              ...prev,
                              business_types: e.target.checked
                                ? [...prev.business_types, type]
                                : prev.business_types.filter((item) => item !== type),
                            }));
                            setFieldErrors((prev) => ({ ...prev, business_types: '' }));
                            setSubmitError('');
                          }}
                          className="rounded border-outline-variant/30 text-primary focus:ring-primary focus:ring-offset-surface bg-surface-container-high"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                  <FieldError id="business_types" message={fieldErrors.business_types} />
                </div>

                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-on-surface mb-1">Admin review required</p>
                  <p className="text-sm text-on-surface-variant">
                    Your account will stay pending until an admin verifies the uploaded documents.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                disabled={loading}
                className="w-full sm:w-auto flex justify-center py-4 px-8 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-on-primary bg-primary hover:bg-primary-dim transition-all active:scale-[0.98] disabled:opacity-50"
                type="submit"
              >
                {loading ? 'Registering...' : 'Register'}
              </button>

              <p className="text-center sm:text-right text-sm font-medium text-on-surface-variant">
                Already have an account? <Link to="/login" className="text-primary hover:underline font-bold">Sign in</Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Background Decorative */}
      <div className="fixed inset-0 -z-10 opacity-5 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent"></div>
      </div>
    </div>
  );
};

export default Register;
