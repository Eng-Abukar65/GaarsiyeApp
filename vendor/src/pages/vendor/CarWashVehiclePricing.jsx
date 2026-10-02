import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Car, RefreshCw, Plus, Pencil, Trash2, X, Inbox,
  ToggleLeft, ToggleRight, AlertTriangle, Clock3,
} from 'lucide-react';
import api from '../../utils/api';

// Suggestions for the "Add" form only — never auto-created.
const PRESETS = [
  { name: 'Sedan', extra_price: 0 },
  { name: 'SUV', extra_price: 2 },
  { name: 'Pickup', extra_price: 3 },
  { name: 'Van', extra_price: 4 },
  { name: 'Bus', extra_price: 8 },
  { name: 'Truck', extra_price: 10 },
  { name: 'Motorcycle', extra_price: -2 },
];

const EMPTY = { name: '', description: '', extra_price: '', extra_minutes: '', status: 'active', display_order: '' };
const money = (v) => `${Number(v) < 0 ? '-' : '+'}$${Math.abs(Number(v || 0)).toFixed(2)}`;

const CarWashVehiclePricing = ({ onToast }) => {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/vendor/car-wash/vehicle-types');
      if (res.data?.success) setTypes(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load vehicle types.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (preset = null) => {
    setEditing(null);
    setForm(preset ? { ...EMPTY, ...preset, extra_price: String(preset.extra_price) } : EMPTY);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name || '',
      description: t.description || '',
      extra_price: t.extra_price ?? '',
      extra_minutes: t.extra_minutes ?? '',
      status: t.status || 'active',
      display_order: t.display_order ?? '',
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Vehicle type name is required.';
    if (form.extra_price === '' || !Number.isFinite(Number(form.extra_price))) {
      errors.extra_price = 'Enter a valid price adjustment.';
    }
    if (form.extra_minutes !== '' && !(Number(form.extra_minutes) >= 0)) {
      errors.extra_minutes = 'Duration adjustment must be zero or more.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        extra_price: Number(form.extra_price),
        extra_minutes: Number(form.extra_minutes || 0),
        status: form.status,
        display_order: Number(form.display_order || 0),
      };
      const res = editing
        ? await api.put(`/vendor/car-wash/vehicle-types/${editing.id}`, payload)
        : await api.post('/vendor/car-wash/vehicle-types', payload);
      if (res.data?.success) {
        onToast?.(editing ? 'Vehicle type updated.' : 'Vehicle type created.');
        setShowForm(false);
        await load();
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setFieldErrors(data.errors);
      onToast?.(data?.message || 'Could not save the vehicle type.', false);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (t) => {
    setBusyId(t.id);
    try {
      const nextStatus = t.status === 'active' ? 'inactive' : 'active';
      const res = await api.put(`/vendor/car-wash/vehicle-types/${t.id}`, { status: nextStatus });
      if (res.data?.success) { onToast?.(`"${t.name}" ${nextStatus === 'active' ? 'enabled' : 'disabled'}.`); await load(); }
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Could not change status.', false);
    } finally { setBusyId(null); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      const res = await api.delete(`/vendor/car-wash/vehicle-types/${confirmDelete.id}`);
      onToast?.(res.data?.message || 'Vehicle type removed.');
      setConfirmDelete(null);
      await load();
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Could not delete the vehicle type.', false);
      setConfirmDelete(null);
    } finally { setBusyId(null); }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return types.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return [t.name, t.description].some((f) => String(f || '').toLowerCase().includes(q));
    });
  }, [types, search, statusFilter]);

  const unusedPresets = useMemo(
    () => PRESETS.filter((p) => !types.some((t) => String(t.name).toLowerCase() === p.name.toLowerCase())),
    [types]
  );

  const field = (key, label, props = {}) => (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label} {props.required && <span className="text-red-500">*</span>}
      </label>
      {props.textarea ? (
        <textarea rows={2} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${fieldErrors[key] ? 'border-red-400' : 'border-outline-variant/20'}`} />
      ) : (
        <input type={props.type || 'text'} step={props.step} value={form[key]} placeholder={props.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${fieldErrors[key] ? 'border-red-400' : 'border-outline-variant/20'}`} />
      )}
      {fieldErrors[key] && <p className="text-[11px] font-bold text-red-600">{fieldErrors[key]}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-on-surface-variant font-bold uppercase tracking-widest gap-2">
        <Loader2 className="animate-spin" size={18} /> Loading vehicle types…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-on-surface-variant">
          Vehicle types you create here — and their price/duration adjustments — are what customers choose from.
          Base price + this adjustment + add-ons = the total.
        </p>
        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          <button onClick={() => openCreate()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/25 hover:bg-blue-700">
            <Plus size={16} /> Add Vehicle Type
          </button>
        </div>
      </div>

      {types.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex gap-2 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/10 w-fit">
            {['all', 'active', 'inactive'].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${statusFilter === f ? 'bg-blue-600 text-white shadow' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {f}
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vehicle types…"
            className="sm:ml-auto sm:w-64 px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      )}

      {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</div>}

      {types.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Car size={26} />
          </div>
          <p className="text-base font-bold text-on-surface">No vehicle types yet. Add your first one.</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-5">
            Customers can’t pick a vehicle type until you create one. Start from scratch or pick a common one below.
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {unusedPresets.map((p) => (
              <button key={p.name} onClick={() => openCreate(p)} className="px-3.5 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-low text-xs font-bold text-on-surface hover:border-blue-400 hover:bg-blue-50/50">
                + {p.name}{p.extra_price ? ` (${money(p.extra_price)})` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm py-16 text-center">
          <p className="text-sm font-bold text-on-surface-variant">No vehicle types match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((t) => (
            <div key={t.id} className={`bg-surface-container-lowest rounded-2xl border shadow-sm p-4 space-y-3 ${t.status === 'inactive' ? 'border-outline-variant/20 opacity-70' : 'border-outline-variant/20'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.status === 'active' ? 'bg-blue-600 text-white' : 'bg-surface-container-low text-on-surface-variant'}`}>
                  <Car size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-on-surface truncate">{t.name}</p>
                  {t.description && <p className="text-[11px] text-on-surface-variant line-clamp-2">{t.description}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {t.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold text-green-700">{money(t.extra_price)}</span>
                {Number(t.extra_minutes) > 0 && (
                  <span className="inline-flex items-center gap-1 text-on-surface-variant text-xs"><Clock3 size={13} /> +{t.extra_minutes} min</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button onClick={() => openEdit(t)} disabled={busyId === t.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold hover:bg-surface-container-high disabled:opacity-50">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => toggleStatus(t)} disabled={busyId === t.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold hover:bg-surface-container-high disabled:opacity-50">
                  {t.status === 'active' ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                  {t.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => setConfirmDelete(t)} disabled={busyId === t.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/15">
              <h2 className="font-headline text-xl font-bold text-on-surface">{editing ? 'Edit vehicle type' : 'Add vehicle type'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {field('name', 'Name', { required: true, placeholder: 'e.g. SUV' })}
              {field('description', 'Description (optional)', { textarea: true })}
              <div className="grid grid-cols-2 gap-4">
                {field('extra_price', 'Price adjustment (USD)', { required: true, type: 'number', step: '0.01' })}
                {field('extra_minutes', 'Extra minutes', { type: 'number' })}
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 text-sm font-medium">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Tip: a negative price adjustment makes a type cheaper (e.g. motorcycle −$2).
              </p>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-outline-variant/15">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editing ? 'Save changes' : 'Create'}
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
                  Types with past bookings are archived (kept for history) instead of deleted, and types on active bookings can’t be removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface">Keep</button>
              <button onClick={doDelete} disabled={busyId === confirmDelete.id} className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarWashVehiclePricing;
