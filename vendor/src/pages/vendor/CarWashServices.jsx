import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Droplets, Plus, Search, RefreshCw, Loader2, Pencil, Trash2, Inbox,
  ToggleLeft, ToggleRight, X, Clock3, DollarSign, AlertTriangle,
} from 'lucide-react';
import api from '../../utils/api';
import CarWashVehiclePricing from './CarWashVehiclePricing';
import CarWashAddonsPanel from './CarWashAddonsPanel';

// Suggestions only — nothing is created until the vendor explicitly saves it.
const SERVICE_PRESETS = [
  { name: 'Exterior Wash', description: 'Full exterior body wash, rinse and dry.', base_price: 5, estimated_minutes: 20 },
  { name: 'Interior Wash', description: 'Interior vacuum, wipe-down and cabin clean.', base_price: 7, estimated_minutes: 30 },
  { name: 'Full Wash', description: 'Complete exterior and interior cleaning.', base_price: 10, estimated_minutes: 45 },
  { name: 'Engine Wash', description: 'Careful engine bay degrease and rinse.', base_price: 12, estimated_minutes: 40 },
  { name: 'Detailing', description: 'Deep clean, polish and paint restoration.', base_price: 25, estimated_minutes: 90 },
  { name: 'VIP Wash', description: 'Premium end-to-end treatment with finishing.', base_price: 35, estimated_minutes: 120 },
];

const EMPTY_FORM = {
  name: '', description: '', base_price: '', estimated_minutes: '',
  status: 'active', is_available: true, image: '',
};

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const CarWashServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('services'); // services | vehicles | addons

  const notify = (message, ok = true) => {
    setToast({ message, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/vendor/car-wash/services');
      if (res.data?.success) setServices(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (preset = null) => {
    setEditing(null);
    setForm(preset ? { ...EMPTY_FORM, ...preset } : EMPTY_FORM);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (service) => {
    setEditing(service);
    setForm({
      name: service.name || '',
      description: service.description || '',
      base_price: service.base_price ?? '',
      estimated_minutes: service.estimated_minutes ?? '',
      status: service.status || 'active',
      is_available: Boolean(service.is_available),
      image: service.image || '',
    });
    setFieldErrors({});
    setShowForm(true);
  };

  // Client-side mirror of the backend rules for instant feedback.
  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Service name is required.';
    if (!form.description.trim()) errors.description = 'Description is required.';
    if (!(Number(form.base_price) > 0)) errors.base_price = 'Price must be greater than zero.';
    if (!(Number(form.estimated_minutes) > 0)) errors.estimated_minutes = 'Duration must be greater than zero.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        base_price: Number(form.base_price),
        estimated_minutes: Number(form.estimated_minutes),
        status: form.status,
        is_available: form.is_available,
        image: form.image.trim() || null,
      };
      const res = editing
        ? await api.put(`/vendor/car-wash/services/${editing.id}`, payload)
        : await api.post('/vendor/car-wash/services', payload);
      if (res.data?.success) {
        notify(editing ? 'Service updated.' : 'Service created.');
        setShowForm(false);
        await load();
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setFieldErrors(data.errors);
      notify(data?.message || 'Could not save the service.', false);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (service) => {
    setBusyId(service.id);
    try {
      const nextStatus = service.status === 'active' ? 'inactive' : 'active';
      const res = await api.put(`/vendor/car-wash/services/${service.id}`, { status: nextStatus });
      if (res.data?.success) {
        notify(`"${service.name}" ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
        await load();
      }
    } catch (err) {
      notify(err.response?.data?.message || 'Could not change status.', false);
    } finally {
      setBusyId(null);
    }
  };

  const toggleAvailability = async (service) => {
    setBusyId(service.id);
    try {
      const res = await api.put(`/vendor/car-wash/services/${service.id}`, {
        is_available: !service.is_available,
      });
      if (res.data?.success) {
        notify(`"${service.name}" is now ${!service.is_available ? 'available' : 'unavailable'} for booking.`);
        await load();
      }
    } catch (err) {
      notify(err.response?.data?.message || 'Could not change availability.', false);
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      const res = await api.delete(`/vendor/car-wash/services/${confirmDelete.id}`);
      notify(res.data?.message || 'Service removed.');
      setConfirmDelete(null);
      await load();
    } catch (err) {
      // 409 = active bookings depend on it
      notify(err.response?.data?.message || 'Could not delete the service.', false);
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (statusFilter === 'active' && s.status !== 'active') return false;
      if (statusFilter === 'inactive' && s.status !== 'inactive') return false;
      if (statusFilter === 'available' && !s.is_available) return false;
      if (!q) return true;
      return [s.name, s.description].some((f) => String(f || '').toLowerCase().includes(q));
    });
  }, [services, search, statusFilter]);

  const field = (key, label, props = {}) => (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label} {props.required && <span className="text-red-500">*</span>}
      </label>
      {props.textarea ? (
        <textarea
          rows={3}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            fieldErrors[key] ? 'border-red-400' : 'border-outline-variant/20'
          }`}
        />
      ) : (
        <input
          type={props.type || 'text'}
          step={props.step}
          min={props.min}
          value={form[key]}
          placeholder={props.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            fieldErrors[key] ? 'border-red-400' : 'border-outline-variant/20'
          }`}
        />
      )}
      {fieldErrors[key] && (
        <p className="text-[11px] font-bold text-red-600">{fieldErrors[key]}</p>
      )}
    </div>
  );

  return (
    <div className="font-body max-w-[1400px] mx-auto pb-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Droplets size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-headline text-on-surface">Car Services</h1>
            <p className="text-sm text-on-surface-variant">
              Configure the services, vehicle pricing, and add-ons customers can book.
            </p>
          </div>
        </div>
        {tab === 'services' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openCreate()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} /> Add Service
            </button>
          </div>
        )}
      </div>

      {/* Tabs: Services / Vehicle Pricing / Add-ons */}
      <div className="flex flex-wrap gap-2 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/10 w-fit">
        {[
          { key: 'services', label: 'Services' },
          { key: 'vehicles', label: 'Vehicle Pricing' },
          { key: 'addons', label: 'Add-ons' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.key ? 'bg-blue-600 text-white shadow' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'vehicles' && <CarWashVehiclePricing onToast={notify} />}
      {tab === 'addons' && <CarWashAddonsPanel onToast={notify} />}

      {tab === 'services' && (<>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap gap-2 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/10 w-fit">
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
            { key: 'available', label: 'Available' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === f.key ? 'bg-blue-600 text-white shadow' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className="pl-9 pr-3 py-2 w-full sm:w-64 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700 flex items-center justify-between">
          {error}
          <button onClick={load} className="underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-on-surface-variant font-bold uppercase tracking-widest gap-2">
          <Loader2 className="animate-spin" size={18} /> Loading services…
        </div>
      ) : services.length === 0 ? (
        // First-run empty state with opt-in presets — nothing is auto-created.
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Inbox size={26} />
          </div>
          <p className="text-base font-bold text-on-surface">No services created yet. Add your first Car Service.</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-6">
            Customers see nothing until you publish a service. Start from scratch or pick a common one below.
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {SERVICE_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => openCreate(p)}
                className="px-3.5 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-low text-xs font-bold text-on-surface hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm py-16 text-center">
          <p className="text-sm font-bold text-on-surface-variant">No services match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((s) => (
            <div key={s.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-on-surface truncate">{s.name}</p>
                  <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">{s.description}</p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${
                    s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {s.status}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 font-bold text-green-700">
                  <DollarSign size={14} /> {money(s.base_price)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
                  <Clock3 size={14} /> {s.estimated_minutes} min
                </span>
                <span
                  className={`ml-auto text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    s.is_available ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {s.is_available ? 'Bookable' : 'Unavailable'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => openEdit(s)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => toggleStatus(s)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  {s.status === 'active' ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                  {s.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => toggleAvailability(s)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  {s.is_available ? 'Mark unavailable' : 'Mark bookable'}
                </button>
                <button
                  onClick={() => setConfirmDelete(s)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/15">
              <h2 className="font-headline text-xl font-bold text-on-surface">
                {editing ? 'Edit service' : 'Add car service'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {field('name', 'Service name', { required: true, placeholder: 'e.g. Full Wash' })}
              {field('description', 'Description', { required: true, textarea: true })}
              <div className="grid grid-cols-2 gap-4">
                {field('base_price', 'Price (USD)', { required: true, type: 'number', step: '0.01', min: '0' })}
                {field('estimated_minutes', 'Duration (minutes)', { required: true, type: 'number', min: '1' })}
              </div>
              {field('image', 'Image URL (optional)', { placeholder: 'https://…' })}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Availability</label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                      form.is_available
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'
                    }`}
                  >
                    {form.is_available ? 'Bookable by customers' : 'Not bookable'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-outline-variant/15">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editing ? 'Save changes' : 'Create service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">Delete “{confirmDelete.name}”?</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Services with past bookings are deactivated instead of deleted, so history stays intact.
                  Services with active bookings cannot be removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface">
                Keep service
              </button>
              <button
                onClick={doDelete}
                disabled={busyId === confirmDelete.id}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CarWashServices;
