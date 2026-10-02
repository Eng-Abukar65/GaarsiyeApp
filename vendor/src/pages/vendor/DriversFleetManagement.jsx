import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Briefcase, CalendarDays, CheckCircle2, Droplets,
  Inbox, Loader2, Mail, Pencil, Phone, Plus, Power, Eye, EyeOff,
  RefreshCw, Search, ShieldCheck, Trash2, Truck, Users, X,
} from 'lucide-react';
import api from '../../utils/api';
import { hasBusinessType, resolveBusinessTypes } from '../../utils/businessType';
import { useVendorProfile } from '../../hooks/useVendorProfile';
/* â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const WORKER_STATUS_META = {
  active:   { label: 'Active',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  inactive: { label: 'Inactive', cls: 'bg-red-50     text-red-500    border border-red-200'    },
};

const AVAILABILITY_STATUS_META = {
  available: { label: 'Available', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  busy:      { label: 'Busy',      cls: 'bg-amber-100  text-amber-700  border border-amber-200'  },
  offline:   { label: 'Offline',   cls: 'bg-slate-100  text-slate-500  border border-slate-200'  },
};

const DRIVER_STATUS_META = {
  online:    { label: 'ONLINE',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  available: { label: 'ONLINE',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  busy:      { label: 'BUSY',     cls: 'bg-amber-100  text-amber-700  border border-amber-200'  },
  offline:   { label: 'OFFLINE',  cls: 'bg-slate-100  text-slate-500  border border-slate-200'  },
  inactive:  { label: 'INACTIVE', cls: 'bg-red-50     text-red-500    border border-red-200'    },
};

const VEHICLE_OPTIONS = ['Motorcycle', 'TukTuk', 'Pickup Truck', 'Fuel Tanker (Small)'];

const EMPTY_WORKER_FORM = {
  first_name: '', last_name: '', email: '', username: '', password: '',
  phone: '', date_of_birth: '', address: '',
  vehicle_type: 'Motorcycle', plate_number: '', license_number: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  guardian_name: '', guardian_phone: '',
  guarantor_name: '', guarantor_phone: '', guarantor_address: '',
  worker_status: 'active', availability_status: 'available',
  skills: [], notes: '',
  createLogin: false,
};

const EMPTY_DRIVER_FORM = {
  first_name: '', last_name: '', email: '', username: '', phone: '', password: '',
  vehicle_type: 'Motorcycle', plate_number: '', address: '', dob: '',
  sponsor_name: '', sponsor_phone: '', sponsor_address: '',
};

/* â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const sanitizePhone = (value) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  return raw.trim().startsWith('+') ? '+' + digits : digits;
};

const getMaxDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 15);
  return d.toISOString().split('T')[0];
};

const FieldErr = ({ msg }) => msg ? <p className="text-xs font-semibold text-red-500 mt-1">{msg}</p> : null;

const StatusBadge = ({ status, meta }) => {
  const s = String(status || 'offline').toLowerCase();
  const { label, cls } = meta[s] || meta.offline;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
};

const StatCard = ({ label, value, accent }) => (
  <div className={`rounded-2xl border p-5 shadow-sm ${accent
    ? 'bg-primary border-primary/20 text-on-primary'
    : 'bg-surface-container-lowest border-outline-variant/10'}`}>
    <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${accent ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>{label}</p>
    <h3 className={`text-3xl font-black ${accent ? '' : 'text-on-surface'}`}>{value}</h3>
  </div>
);

const Skeleton = ({ rows = 5 }) => (
  <div className="divide-y divide-outline-variant/5">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-8 py-5 animate-pulse">
        <div className="h-10 w-10 rounded-full bg-slate-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-200 rounded w-32" />
          <div className="h-2 bg-slate-100 rounded w-48" />
        </div>
        <div className="h-5 w-16 bg-slate-200 rounded-full" />
      </div>
    ))}
  </div>
);

const ConfirmDialog = ({ title, message, onConfirm, onCancel, danger = true }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-fade-in-up">
      <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
        <AlertTriangle size={28} className={danger ? 'text-red-500' : 'text-amber-500'} />
      </div>
      <h3 className="text-lg font-bold text-on-surface mb-2">{title}</h3>
      <p className="text-sm text-on-surface-variant mb-6">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-outline-variant/30 font-bold text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} className={`flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-colors ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
          Confirm
        </button>
      </div>
    </div>
  </div>
);

const Toast = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-[70] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-bold animate-fade-in-up ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {toast.message}
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CAR WASH WORKERS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const CarWashWorkersTab = ({ notify }) => {
  const [workers, setWorkers] = useState([]);
  const [vendorServices, setVendorServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_WORKER_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/vendor/car-wash/workers?includeInactive=true');
      if (res.data?.success) setWorkers(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load workers.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVendorServices = useCallback(async () => {
    try {
      const res = await api.get('/vendor/car-wash/services?active=true');
      if (res.data?.success && Array.isArray(res.data.data)) {
        const activeNames = res.data.data
          .filter(s => String(s.status || 'active') === 'active' && (s.is_available === 1 || s.is_available === true))
          .map(s => s.name);
        setVendorServices(activeNames);
      }
    } catch (e) {
      // If services fetch fails, keep empty â€” vendor must create services first
    }
  }, []);

  useEffect(() => {
    load();
    fetchVendorServices();
  }, [load, fetchVendorServices]);

  const skillOptions = useMemo(() => {
    return vendorServices; // Only vendor-created active services; no hardcoded fallback
  }, [vendorServices]);

  const resolveWorkerStatus = (w) => {
    const accountStatus = String(w.worker_status || (w.is_active === 0 ? 'inactive' : 'active')).toLowerCase();
    if (accountStatus === 'inactive') return 'inactive';
    
    const avail = String(w.availability_status || w.status || '').toLowerCase();
    if (avail === 'busy' || w.current_booking_code) return 'busy';
    
    const isOnline = Boolean(Number(w.is_online) === 1 || w.is_online === true || avail === 'available' || avail === 'online' || w.is_available === 1 || w.is_available === true);
    if (isOnline) return 'online';
    
    return 'offline';
  };

  const stats = useMemo(() => {
    const total = workers.length;
    const available = workers.filter(w => resolveWorkerStatus(w) === 'online' || resolveWorkerStatus(w) === 'available').length;
    const busy = workers.filter(w => resolveWorkerStatus(w) === 'busy').length;
    const offline = workers.filter(w => resolveWorkerStatus(w) === 'offline').length;
    const active = busy;
    return { total, available, busy, offline, active };
  }, [workers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return workers.filter(w => {
      const fullName = `${w.first_name || w.name || ''} ${w.last_name || ''}`.toLowerCase();
      const matchSearch = !q || fullName.includes(q) || w.name?.toLowerCase().includes(q) || w.phone?.includes(q) || w.email?.toLowerCase().includes(q);
      const wStatus = resolveWorkerStatus(w);
      const matchStatus = statusFilter === 'all' || 
        (statusFilter === 'online' && (wStatus === 'online' || wStatus === 'available')) || 
        (statusFilter === 'available' && (wStatus === 'online' || wStatus === 'available')) || 
        wStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [workers, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_WORKER_FORM,
      worker_status: 'active',
      availability_status: 'available',
      skills: [],
      guarantor_name: '',
      guarantor_phone: '',
      guarantor_address: '',
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (w) => {
    setEditing(w);
    let parsedSkills = [];
    if (w.skills) {
      try {
        parsedSkills = typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills;
        if (!Array.isArray(parsedSkills)) parsedSkills = [];
      } catch (e) {
        parsedSkills = [];
      }
    }
    setForm({
      first_name: w.first_name || (w.name ? w.name.split(' ')[0] : '') || '',
      last_name: w.last_name || (w.name ? w.name.split(' ').slice(1).join(' ') : '') || '',
      phone: w.phone || '',
      email: w.email || '',
      username: w.username || '',
      password: '',
      date_of_birth: w.date_of_birth ? String(w.date_of_birth).slice(0, 10) : '',
      address: w.address || '',
      profile_image: w.profile_image || '',
      worker_status: w.worker_status || (w.is_active === 0 ? 'inactive' : 'active'),
      availability_status: w.availability_status || 'available',
      skills: parsedSkills,
      notes: w.notes || '',
      guarantor_name: w.guarantor_name || '',
      guarantor_phone: w.guarantor_phone || '',
      guarantor_address: w.guarantor_address || '',
      createLogin: !!w.username
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.first_name || !form.first_name.trim()) errors.first_name = 'First name is required.';
    else if (/\d/.test(form.first_name.trim())) errors.first_name = 'First name cannot include numbers.';

    if (!form.last_name || !form.last_name.trim()) errors.last_name = 'Last name is required.';
    else if (/\d/.test(form.last_name.trim())) errors.last_name = 'Last name cannot include numbers.';

    const digits = (form.phone || '').replace(/\D/g, '');
    if (!digits) errors.phone = 'Phone number is required.';
    else if (digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number (7-15 digits).';
    
    if (!form.email || !form.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (!form.username || !form.username.trim()) {
      errors.username = 'Username is required.';
    } else if (form.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters.';
    }

    if (!editing && (!form.password || !form.password.trim())) {
      errors.password = 'Password is required.';
    } else if (form.password && form.password.trim() && form.password.trim().length < 6) {
      errors.password = 'Password must be at least 6 characters long.';
    }

    if (!form.date_of_birth) {
      errors.date_of_birth = 'Date of birth is required.';
    } else {
      const maxDob = getMaxDob();
      if (form.date_of_birth > maxDob) {
        errors.date_of_birth = 'Worker must be at least 15 years old.';
      }
    }

    if (!form.address || !form.address.trim()) {
      errors.address = 'Address is required.';
    }

    if (!form.skills || !Array.isArray(form.skills) || form.skills.length === 0) {
      errors.skills = 'At least one Car service/skill must be selected.';
    }

    if (!['active', 'inactive'].includes(form.worker_status)) {
      errors.worker_status = 'Please select a valid worker status.';
    }

    if (!['available', 'busy', 'offline'].includes(form.availability_status)) {
      errors.availability_status = 'Please select a valid availability status.';
    }

    if (!form.guarantor_name || !form.guarantor_name.trim()) {
      errors.guarantor_name = 'Sponsor name is required.';
    } else if (/^\d+$/.test(form.guarantor_name.trim())) {
      errors.guarantor_name = 'This field must contain letters and cannot contain only numbers.';
    }

    if (!form.guarantor_phone || !form.guarantor_phone.trim()) {
      errors.guarantor_phone = 'Sponsor phone is required.';
    } else {
      const gDigits = form.guarantor_phone.replace(/\D/g, '');
      if (gDigits.length < 7 || gDigits.length > 15) errors.guarantor_phone = 'Enter a valid sponsor phone.';
    }

    if (!form.guarantor_address || !form.guarantor_address.trim()) {
      errors.guarantor_address = 'Sponsor address is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setFieldErrors(prev => ({ ...prev, profile_image: 'Only JPEG, JPG, PNG and WebP images are allowed.' }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors(prev => ({ ...prev, profile_image: 'File size must be under 5MB.' }));
      return;
    }

    setFieldErrors(prev => {
      const next = { ...prev };
      delete next.profile_image;
      return next;
    });

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const res = await api.post('/vendor/car-wash/workers/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        setForm(prev => ({ ...prev, profile_image: res.data.photoPath }));
      }
    } catch (err) {
      setFieldErrors(prev => ({ ...prev, profile_image: 'Failed to upload photo.' }));
    }
  };

  const handleSkillToggle = (skill) => {
    setForm(prev => {
      const current = prev.skills || [];
      const next = current.includes(skill)
        ? current.filter(s => s !== skill)
        : [...current, skill];
      return { ...prev, skills: next };
    });
    if (fieldErrors.skills) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next.skills;
        return next;
      });
    }
  };

  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        date_of_birth: form.date_of_birth || null,
        guarantor_name: form.guarantor_name?.trim() || null,
        guarantor_phone: form.guarantor_phone?.trim() || null,
        guarantor_address: form.guarantor_address?.trim() || null,
        address: form.address || null,
        profile_image: form.profile_image || null,
        worker_status: form.worker_status,
        availability_status: form.availability_status,
        skills: form.skills,
        notes: form.notes || null,
        username: form.username.trim() || null,
        password: form.password ? form.password.trim() : null
      };

      const res = editing
        ? await api.put(`/vendor/car-wash/workers/${editing.id}`, payload)
        : await api.post('/vendor/car-wash/workers', payload);

      if (res.data?.success) {
        const worker = res.data.data;
        const tmpPwd = worker?.initialPassword || res.data.initialPassword;
        const msg = editing
          ? 'Car Services worker updated successfully.'
          : tmpPwd
            ? `Car Services worker added successfully. Temporary password: ${tmpPwd}`
            : 'Car Services worker added successfully.';
        notify(msg);
        setShowForm(false);
        load();
      } else {
        notify(res.data?.message || 'Failed to save worker.', false);
      }
    } catch (err) {
      if (err.response?.data?.errors) {
        setFieldErrors(err.response.data.errors);
      }
      notify(err.response?.data?.message || 'Failed to save worker.', false);
    } finally {
      setSaving(false);
    }
  };

  if (error) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <AlertTriangle size={40} className="text-amber-400 mx-auto mb-3" />
        <p className="font-bold text-on-surface mb-4">{error}</p>
        <button onClick={load} className="px-6 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm">Retry</button>
      </div>
    </div>
  );

  const inp = 'w-full bg-surface-container-high px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-cyan-500 outline-none text-sm';
  const lbl = 'text-xs font-bold text-on-surface-variant uppercase tracking-widest';

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Workers" value={stats.total} />
        <StatCard label="Online Workers" value={stats.available} />
        <StatCard label="Busy Workers" value={stats.busy} accent />
        <StatCard label="Offline Workers" value={stats.offline} />
        <StatCard label="Active Car Services Jobs" value={stats.active} />
      </div>

      {/* Main Panel */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-outline-variant/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-3 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search workers..."
                className="w-full sm:w-60 pl-9 pr-4 py-2.5 rounded-xl bg-surface-container-high border-none outline-none text-sm focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-surface-container-high border-none outline-none text-sm focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">All Statuses</option>
              <option value="online">Online</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm">
              <Plus size={15} />
              Add Car Services Worker
            </button>
          </div>
        </div>

        {/* Workers Table */}
        {loading ? <Skeleton /> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="h-16 w-16 rounded-full bg-cyan-50 flex items-center justify-center mb-4">
              <Droplets size={32} className="text-cyan-400" />
            </div>
            <p className="font-bold text-on-surface text-base mb-1">
              {search || statusFilter !== 'all'
                ? 'No workers match your search.'
                : 'No Car Services workers created yet. Add your first Car Services worker.'}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm">
                <Plus size={15} /> Add Car Services Worker
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/30 border-b border-outline-variant/10 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  <th className="px-6 py-4">Worker</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Skills</th>
                  <th className="px-6 py-4 text-center">Current Job</th>
                  <th className="px-6 py-4 text-center">Jobs</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {filtered.map(w => {
                  const fullName = `${w.first_name || w.name || ''} ${w.last_name || ''}`.trim();
                  return (
                    <tr key={w.id} className="hover:bg-surface-container-low/30 transition-colors border-b border-outline-variant/5">
                      {/* Worker */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {w.profile_image ? (
                            <img src={w.profile_image} alt={fullName} className="h-10 w-10 rounded-full object-cover shadow-sm bg-slate-100 shrink-0" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm">
                              {String(fullName || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-on-surface text-sm truncate">{fullName}</p>
                            {w.username && <p className="text-xs text-on-surface-variant">@{w.username}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-on-surface font-medium">
                            <Phone size={12} className="text-cyan-600 shrink-0" />
                            <span>Phone: {w.phone || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-on-surface-variant">
                            <Mail size={12} className="text-cyan-600 shrink-0" />
                            <span>Email: {w.email || 'None'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Skills */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {(() => {
                            try {
                              const arr = typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills;
                              if (Array.isArray(arr) && arr.length > 0) {
                                return arr.map(s => (
                                  <span key={s} className="px-2 py-0.5 rounded-md bg-cyan-50 text-[10px] font-semibold text-cyan-700 border border-cyan-100">
                                    {s}
                                  </span>
                                ));
                              }
                            } catch {}
                            return <span className="text-xs text-slate-400 italic">No skills listed</span>;
                          })()}
                        </div>
                      </td>

                      {/* Current Job */}
                      <td className="px-6 py-4 text-center">
                        {w.current_booking_code ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-xs font-bold text-amber-700 border border-amber-200">
                            <Briefcase size={12} /> {w.current_booking_code}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No Active Job</span>
                        )}
                      </td>

                      {/* Completed Jobs */}
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-black text-on-surface">{w.completed_jobs || 0}</span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4">
                        <StatusBadge status={resolveWorkerStatus(w)} meta={DRIVER_STATUS_META} />
                      </td>

                      {/* Actions: Edit button ONLY */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEdit(w)}
                          title="Edit Worker"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container hover:bg-cyan-50 text-on-surface-variant hover:text-cyan-700 font-bold text-xs transition-colors border border-outline-variant/10 shadow-xs"
                        >
                          <Pencil size={14} />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Car Wash Worker Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] animate-fade-in-up border border-outline-variant/10">
            <div className="px-8 py-5 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-bold">{editing ? 'Edit Car Services Worker' : 'Add Car Services Worker'}</h3>
                <p className="text-sm text-white/75 mt-0.5">{editing ? 'Update worker details, status, and assigned skills.' : 'Add worker identity, contact details, status, and skills.'}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-full hover:bg-white/20 transition-colors"><X size={18} /></button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex min-h-0 flex-1 flex-col">
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                  {/* Identity & Status */}
                  <section className="space-y-4 rounded-2xl bg-white border border-outline-variant/10 p-6 shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">Identity &amp; Status</p>
                      <h4 className="text-base font-bold text-on-surface">Worker Details</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>First Name *</label>
                        <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value.replace(/\d/g, '') }))} className={inp} placeholder="e.g. Hassan" />
                        <FieldErr msg={fieldErrors.first_name} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Last Name *</label>
                        <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value.replace(/\d/g, '') }))} className={inp} placeholder="e.g. Ali" />
                        <FieldErr msg={fieldErrors.last_name} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Phone *</label>
                        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: sanitizePhone(e.target.value) }))} className={inp} placeholder="+252 61 1234567" />
                        <FieldErr msg={fieldErrors.phone} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Email *</label>
                        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} placeholder="worker@example.com" />
                        <FieldErr msg={fieldErrors.email} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Username *</label>
                        <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inp} placeholder="hassan_wash" />
                        <FieldErr msg={fieldErrors.username} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Password *</label>
                        <div className="relative">
                          <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={`${inp} pr-11`} placeholder="Min 6 characters" />
                          <button type="button" onClick={() => setShowPassword(visible => !visible)} className="absolute inset-y-0 right-0 px-3 text-on-surface-variant hover:text-cyan-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                          </button>
                        </div>
                        <FieldErr msg={fieldErrors.password} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Worker Status *</label>
                        <select
                          value={form.worker_status}
                          onChange={e => setForm(f => ({ ...f, worker_status: e.target.value }))}
                          className={inp}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <FieldErr msg={fieldErrors.worker_status} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Availability Status *</label>
                        <select
                          value={form.availability_status}
                          onChange={e => setForm(f => ({ ...f, availability_status: e.target.value }))}
                          className={inp}
                        >
                          <option value="available">Available</option>
                          <option value="busy">Busy</option>
                          <option value="offline">Offline</option>
                        </select>
                        <FieldErr msg={fieldErrors.availability_status} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Date of Birth *</label>
                        <input type="date" max={getMaxDob()} value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className={inp} />
                        <FieldErr msg={fieldErrors.date_of_birth} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Address *</label>
                        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inp} placeholder="e.g. Wadajir, Mogadishu" />
                        <FieldErr msg={fieldErrors.address} />
                      </div>
                    </div>
                  </section>

                  {/* Skills & Emergency Contacts */}
                  <section className="space-y-4 rounded-2xl bg-white border border-outline-variant/10 p-6 shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">Skills &amp; Notes</p>
                      <h4 className="text-base font-bold text-on-surface">Car Services &amp; Contacts</h4>
                    </div>

                    {/* Skills Selection */}
                    <div className="space-y-2">
                      <label className={lbl}>Car Skills / Services *</label>
                      {skillOptions.length === 0 ? (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                          <p className="text-xs font-bold text-amber-700">No active Car services found.</p>
                          <p className="text-xs text-amber-600 mt-1">Go to <strong>Car Services</strong> and create active services first, then assign them as worker skills.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 bg-cyan-50/40 p-3 rounded-xl border border-cyan-100/50 max-h-40 overflow-y-auto">
                          {skillOptions.map(skill => {
                            const isChecked = (form.skills || []).includes(skill);
                            return (
                              <label key={skill} className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer select-none">
                                <input type="checkbox" checked={isChecked} onChange={() => handleSkillToggle(skill)} className="rounded text-cyan-600 focus:ring-cyan-500 h-4 w-4 border-slate-300" />
                                {skill}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <FieldErr msg={fieldErrors.skills} />
                    </div>

                    <div className="pt-2 border-t border-outline-variant/10 space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">Support</p>
                        <h4 className="text-base font-bold text-on-surface">Sponsor Contacts</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className={lbl}>Sponsor Name *</label>
                          <input value={form.guarantor_name || ""} onChange={e => setForm(f => ({ ...f, guarantor_name: e.target.value.replace(/\d/g, '') }))} className={inp} />
                          <FieldErr msg={fieldErrors.guarantor_name} />
                        </div>
                        <div className="space-y-1">
                          <label className={lbl}>Sponsor Phone *</label>
                          <input value={form.guarantor_phone || ""} onChange={e => setForm(f => ({ ...f, guarantor_phone: sanitizePhone(e.target.value) }))} className={inp} />
                          <FieldErr msg={fieldErrors.guarantor_phone} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Sponsor Address *</label>
                        <input value={form.guarantor_address || ""} onChange={e => setForm(f => ({ ...f, guarantor_address: e.target.value }))} className={inp} />
                        <FieldErr msg={fieldErrors.guarantor_address} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Notes</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any specific notes about the worker..." className={`${inp} resize-none`} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-cyan-50/60 p-4 border border-cyan-100">
                      <div className="flex items-start gap-3">
                        <CalendarDays size={16} className="text-cyan-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-on-surface-variant">
                          {editing ? 'Updating this record keeps the existing worker account intact.' : 'All required fields must be validated before saving.'}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-outline-variant/10 bg-white px-6 py-4 flex justify-end gap-4">
                <button type="button" onClick={() => setShowForm(false)} className="px-8 py-3 text-on-surface-variant font-bold text-sm hover:text-on-surface transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-10 py-3 bg-cyan-600 text-white font-bold rounded-2xl shadow-lg hover:bg-cyan-700 transition-all disabled:opacity-50 flex items-center gap-2">
                  {saving ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : editing ? 'Save Changes' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DELIVERY DRIVERS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const DeliveryDriversTab = ({ notify }) => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DRIVER_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDriverPassword, setShowDriverPassword] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setError('');
      const res = await api.get(`/vendor/drivers?vendorId=${user.id}`);
      setDrivers(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load drivers.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const available = drivers.filter(d => String(d.status || '').toLowerCase() === 'available').length;
    const busy = drivers.filter(d => String(d.status || '').toLowerCase() === 'busy').length;
    const offline = drivers.filter(d => {
      const s = String(d.status || '').toLowerCase();
      return s === 'offline' || (!d.is_online && s !== 'busy' && s !== 'available' && s !== 'inactive');
    }).length;
    const active = busy; // Active deliveries equals busy drivers
    return { total: drivers.length, available, busy, offline, active };
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return drivers.filter(d => {
      const fullName = `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase();
      const matchSearch = !q || fullName.includes(q) || (d.phone || '').includes(q) || (d.email || '').toLowerCase().includes(q) || (d.username || '').toLowerCase().includes(q);
      const dStatus = String(d.status || (d.is_online ? 'available' : 'offline')).toLowerCase();
      const matchStatus = statusFilter === 'all' || dStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [drivers, search, statusFilter]);

  const openCreate = () => { setEditing(null); setFormError(''); setFieldErrors({}); setForm(EMPTY_DRIVER_FORM); setShowModal(true); };
  const openEdit = (d) => {
    setEditing(d);
    setFormError('');
    setFieldErrors({});
    setForm({
      first_name: d.first_name || '', last_name: d.last_name || '', email: d.email || '',
      username: d.username || '', phone: d.phone || '', password: '',
      vehicle_type: d.vehicle_type || 'Motorcycle',
      plate_number: d.plate_number || d.license_number || '',
      address: d.address || '', dob: String(d.dob || d.date_of_birth || '').slice(0, 10),
      emergency_contact_name: d.emergency_contact_name || '',
      emergency_contact_phone: d.emergency_contact_phone || '',
      guardian_name: d.guardian_name || '', guardian_phone: d.guardian_phone || '',
      sponsor_name: d.guarantor_name || d.sponsor_name || '',
      sponsor_phone: d.guarantor_phone || d.sponsor_phone || '',
      sponsor_address: d.guarantor_address || d.sponsor_address || '',
    });
    setShowModal(true);
  };

  const validate = () => {
    const errs = {};
    if (!form.first_name.trim()) errs.first_name = 'First name is required.';
    else if (/\d/.test(form.first_name.trim())) errs.first_name = 'First name cannot include numbers.';
    if (!form.last_name.trim()) errs.last_name = 'Last name is required.';
    else if (/\d/.test(form.last_name.trim())) errs.last_name = 'Last name cannot include numbers.';
    if (!form.username.trim()) errs.username = 'Username is required.';
    if (!form.phone.trim()) {
      errs.phone = 'Phone number is required.';
    } else {
      const digits = form.phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) errs.phone = 'Enter a valid phone number.';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email.';
    if (!form.password) errs.password = 'Password is required.';
    else if (form.password.length < 6) errs.password = 'Password must be at least 6 characters.';
    const maxDob = getMaxDob();
    if (!form.dob) errs.dob = 'Date of birth is required.';
    else if (form.dob > maxDob) {
      errs.dob = 'Driver must be at least 15 years old.';
    }
    if (!form.plate_number || form.plate_number.trim().length !== 6) {
      errs.plate_number = 'Plate number must be exactly 6 characters (e.g. ABC123).';
    }
    const normalizedPlate = String(form.plate_number || '').trim().toUpperCase();
    if (normalizedPlate && drivers.some((driver) => (
      String(driver.plate_number || driver.license_number || '').trim().toUpperCase() === normalizedPlate
      && (!editing || Number(driver.id) !== Number(editing.id))
    ))) {
      errs.plate_number = 'This plate number is already assigned to another driver.';
    }

    if (!form.sponsor_name || !form.sponsor_name.trim()) errs.sponsor_name = 'Sponsor name is required.';
    else if (/\d/.test(form.sponsor_name.trim())) errs.sponsor_name = 'Sponsor name cannot include numbers.';
    if (!form.sponsor_phone || !form.sponsor_phone.trim()) {
      errs.sponsor_phone = 'Sponsor phone is required.';
    } else {
      const sDigits = form.sponsor_phone.replace(/\D/g, '');
      if (sDigits.length < 7 || sDigits.length > 15) errs.sponsor_phone = 'Enter a valid sponsor phone.';
    }
    if (!form.sponsor_address || !form.sponsor_address.trim()) errs.sponsor_address = 'Sponsor address is required.';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setFormError('');
    try {
      const payload = { ...form, vendor_id: user.id };
      if (editing && !String(payload.password || '').trim()) delete payload.password;
      const res = editing
        ? await api.put(`/vendor/drivers/${editing.id}`, payload)
        : await api.post('/vendor/drivers', payload);
      if (res.data?.success) {
        setShowModal(false);
        load();
        const tmpPwd = res.data.initialPassword;
        notify(editing ? 'Driver updated successfully.'
          : tmpPwd ? `Driver added. Temporary password: ${tmpPwd}`
          : 'Driver added. Credentials sent via email.');
      } else {
        setFormError(res.data?.message || 'Failed to save driver.');
      }
    } catch (err) {
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      setFormError(err.response?.data?.message || 'Failed to save driver. Please check the inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const inp = 'w-full bg-surface-container-high px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-primary outline-none text-sm';
  const lbl = 'text-xs font-bold text-on-surface-variant uppercase tracking-widest';

  const resolveStatus = (d) => {
    const accountStatus = String(d.status || (d.is_active === 0 ? 'inactive' : 'active')).toLowerCase();
    if (accountStatus === 'inactive') return 'inactive';
    
    const s = String(d.status || '').toLowerCase();
    if (s === 'busy') return 'busy';
    const isOnline = Boolean(Number(d.is_online) === 1 || d.is_online === true || s === 'available' || s === 'online');
    if (isOnline) return 'online';
    
    return 'offline';
  };

  if (error) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <AlertTriangle size={40} className="text-amber-400 mx-auto mb-3" />
        <p className="font-bold text-on-surface mb-4">{error}</p>
        <button onClick={load} className="px-6 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Drivers" value={stats.total} />
        <StatCard label="Available Drivers" value={stats.available} />
        <StatCard label="Busy Drivers" value={stats.busy} accent />
        <StatCard label="Offline Drivers" value={stats.offline} />
        <StatCard label="Active Deliveries" value={stats.active} />
      </div>

      {/* Main Panel */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-outline-variant/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-3 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search drivers..."
                className="w-full sm:w-60 pl-9 pr-4 py-2.5 rounded-xl bg-surface-container-high border-none outline-none text-sm focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-surface-container-high border-none outline-none text-sm focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dim text-on-primary rounded-xl font-bold text-sm transition-colors shadow-sm">
              <Plus size={15} />
              Add Delivery Driver
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? <Skeleton /> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Truck size={32} className="text-primary/60" />
            </div>
            <p className="font-bold text-on-surface text-base mb-1">
              {search || statusFilter !== 'all'
                ? 'No drivers match your search.'
                : 'No delivery drivers created yet. Add your first delivery driver.'}
            </p>
            {!search && statusFilter === 'all' && (
              <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm">
                <Plus size={15} /> Add Delivery Driver
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/40">
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-on-surface-variant">Driver</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-on-surface-variant">Contact</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-on-surface-variant hidden md:table-cell">Vehicle</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-on-surface-variant">Status</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-surface-container-low/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shrink-0 text-on-primary font-bold text-xs shadow-sm">
                          {String(d.first_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-on-surface">{d.first_name} {d.last_name}</p>
                          <p className="text-xs text-on-surface-variant">@{d.username || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-on-surface text-sm"><Phone size={12} />{d.phone || 'N/A'}</div>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5"><Mail size={12} />{d.email || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 font-medium text-on-surface"><Truck size={13} />{d.vehicle_type || 'N/A'}</div>
                      <p className="text-xs text-on-surface-variant mt-0.5">{d.plate_number || d.license_number || 'No plate'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={resolveStatus(d)} meta={DRIVER_STATUS_META} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(d)} title="Edit" className="p-2 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant hover:text-primary">
                          <Pencil size={14} />
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

      {/* Driver Form Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] animate-fade-in-up border border-outline-variant/10">
            <div className="px-8 py-5 bg-gradient-to-r from-primary to-primary-dim text-on-primary flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-bold">{editing ? 'Edit Driver Profile' : 'Add Delivery Driver'}</h3>
                <p className="text-sm text-on-primary/75 mt-0.5">{editing ? 'Update driver record.' : 'Capture identity, vehicle, and emergency contact details.'}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-white/20 transition-colors"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="p-6 space-y-6 overflow-y-auto">
                {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{formError}</div>}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Identity */}
                  <section className="space-y-4 rounded-2xl bg-white border border-outline-variant/10 p-6 shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">Identity</p>
                      <h4 className="text-base font-bold text-on-surface">Driver Details</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>First Name *</label>
                        <input name="first_name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value.replace(/\d/g, '') }))} className={inp} placeholder="e.g. Abdi" />
                        <FieldErr msg={fieldErrors.first_name} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Last Name *</label>
                        <input name="last_name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value.replace(/\d/g, '') }))} className={inp} placeholder="e.g. Farah" />
                        <FieldErr msg={fieldErrors.last_name} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Username *</label>
                        <input name="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inp} placeholder="abdi_driver" />
                        <FieldErr msg={fieldErrors.username} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Email *</label>
                        <input type="email" name="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} placeholder="driver@example.com" />
                        <FieldErr msg={fieldErrors.email} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Phone *</label>
                        <input name="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: sanitizePhone(e.target.value) }))} className={inp} placeholder="+252 61 1234567" />
                        <FieldErr msg={fieldErrors.phone} />
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Date of Birth *</label>
                        <input type="date" max={getMaxDob()} name="dob" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} className={inp} />
                        <FieldErr msg={fieldErrors.dob} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Password *</label>
                      <div className="relative">
                        <input type={showDriverPassword ? 'text' : 'password'} name="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={`${inp} pr-11`} placeholder="Min 6 characters" />
                        <button type="button" onClick={() => setShowDriverPassword(visible => !visible)} className="absolute inset-y-0 right-0 px-3 text-on-surface-variant hover:text-primary" aria-label={showDriverPassword ? 'Hide password' : 'Show password'}>
                          {showDriverPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      <FieldErr msg={fieldErrors.password} />
                    </div>
                    <div className="space-y-1">
                      <label className={lbl}>Address *</label>
                      <input name="address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inp} placeholder="e.g. Wadajir, Mogadishu" />
                      <FieldErr msg={fieldErrors.address} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={lbl}>Vehicle Type *</label>
                        <select name="vehicle_type" value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))} className={inp}>
                          {VEHICLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={lbl}>Plate Number * (6 Characters)</label>
                        <input 
                          name="plate_number" 
                          maxLength={6}
                          value={form.plate_number} 
                          onChange={e => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                            setForm(f => ({ ...f, plate_number: val }));
                          }} 
                          className={`${inp} uppercase font-mono tracking-wider`} 
                          placeholder="ABC123" 
                        />
                        <FieldErr msg={fieldErrors.plate_number} />
                      </div>
                    </div>
                  </section>

                  {/* Support contacts */}
                  <section className="space-y-4 rounded-2xl bg-white border border-outline-variant/10 p-6 shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">Support</p>
                      <h4 className="text-base font-bold text-on-surface">Sponsor Contacts</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className={lbl}>Sponsor Name *</label><input name="sponsor_name" value={form.sponsor_name} onChange={e => setForm(f => ({ ...f, sponsor_name: e.target.value.replace(/\d/g, '') }))} className={inp} /><FieldErr msg={fieldErrors.sponsor_name} /></div>
                      <div className="space-y-1"><label className={lbl}>Sponsor Phone *</label><input name="sponsor_phone" value={form.sponsor_phone} onChange={e => setForm(f => ({ ...f, sponsor_phone: sanitizePhone(e.target.value) }))} className={inp} /><FieldErr msg={fieldErrors.sponsor_phone} /></div>
                    </div>
                    <div className="space-y-1"><label className={lbl}>Sponsor Address *</label><input name="sponsor_address" value={form.sponsor_address} onChange={e => setForm(f => ({ ...f, sponsor_address: e.target.value }))} className={inp} /><FieldErr msg={fieldErrors.sponsor_address} /></div>
                    <div className="rounded-2xl bg-primary-container/40 p-4 border border-primary-container">
                      <div className="flex items-start gap-3">
                        <CalendarDays size={16} className="text-primary-dim mt-0.5 shrink-0" />
                        <p className="text-sm text-on-surface-variant">
                          {editing ? 'Updating this record keeps the existing driver account intact.' : 'A secure temporary password will be emailed to the driver automatically.'}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="shrink-0 border-t border-outline-variant/10 bg-white px-6 py-4 flex justify-end gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-8 py-3 text-on-surface-variant font-bold text-sm hover:text-on-surface transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-10 py-3 bg-primary text-on-primary font-bold rounded-2xl shadow-lg hover:bg-primary-dim transition-all disabled:opacity-50 flex items-center gap-2">
                  {submitting ? <><Loader2 size={15} className="animate-spin" />Saving...</> : editing ? 'Save Changes' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title="Remove Driver?"
          message={`Remove "${confirm.first_name} ${confirm.last_name}"? This action cannot be undone.`}
          onConfirm={() => { /* TODO: implement driver delete endpoint */ setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN PAGE â€” Personnel Management
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const TABS = [
  { id: 'drivers',  label: 'Delivery Drivers',  icon: Truck,    color: 'primary' },
  { id: 'workers',  label: 'Car Services Workers', icon: Droplets, color: 'cyan'    },
];

const PersonnelManagement = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const { vendor } = useVendorProfile();
  const [activeTab, setActiveTab] = useState('drivers');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const businessTypes = resolveBusinessTypes(vendor, user);
  const isCarWashVendor = hasBusinessType(businessTypes, 'Car Services') || hasBusinessType(businessTypes, 'Car Wash');

  const visibleTabs = isCarWashVendor ? TABS : [TABS[0]];

  const notify = useCallback((message, ok = true) => {
    setToast({ message, ok });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  if (!user?.id) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-sm">
        <ShieldCheck size={36} className="text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-red-700 mb-2">Authentication Required</h2>
        <p className="text-red-600 text-sm mb-4">Please log in to manage your personnel.</p>
        <button onClick={() => window.location.href = '/login'} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-700">Go to Login</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6">
      {/* Page Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black font-headline text-on-surface tracking-tight">Personnel Management</h2>
          <p className="text-on-surface-variant max-w-lg leading-relaxed font-medium mt-1">
            Manage your delivery drivers and Car Services workers from one place.
          </p>
        </div>
        {/* Icon group */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/5 border border-primary/10">
            <Truck size={16} className="text-primary" />
            <span className="text-xs font-bold text-primary">Drivers</span>
          </div>
          {isCarWashVendor && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-cyan-50 border border-cyan-200">
              <Droplets size={16} className="text-cyan-600" />
              <span className="text-xs font-bold text-cyan-600">Car Services</span>
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 p-1 bg-surface-container-high rounded-2xl w-fit">
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
                  isActive
                    ? tab.color === 'cyan'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-primary text-on-primary shadow-md'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab separator label for single-tab vendors */}
      {visibleTabs.length === 1 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary/10 border border-primary/20">
            <Truck size={16} className="text-primary" />
            <span className="text-sm font-bold text-primary">Delivery Drivers</span>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'drivers' && <DeliveryDriversTab notify={notify} />}
      {activeTab === 'workers' && <CarWashWorkersTab notify={notify} />}

      {/* Global Toast */}
      <Toast toast={toast} />
    </div>
  );
};

export default PersonnelManagement;
