import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Pencil, Trash2, X, Sparkles, Inbox } from 'lucide-react';
import api from '../../utils/api';

const PRESETS = ['Wax Polish', 'Air Freshener', 'Tire Shine', 'Vacuum Cleaning', 'Seat Shampoo', 'Ceramic Coating', 'Underbody Wash', 'Dashboard Cleaning'];
const EMPTY = { name: '', price: '', duration_minutes: '', is_available: true };
const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const CarWashAddonsPanel = ({ onToast }) => {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/vendor/car-wash/addons');
      if (res.data?.success) setAddons(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load add-ons.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (name = '') => { setEditing(null); setForm({ ...EMPTY, name }); setFieldErrors({}); setShowForm(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({ name: a.name || '', price: a.price ?? '', duration_minutes: a.duration_minutes ?? '', is_available: Boolean(a.is_available) });
    setFieldErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Add-on name is required.';
    if (!(Number(form.price) >= 0)) errors.price = 'Enter a valid price.';
    if (form.duration_minutes !== '' && !(Number(form.duration_minutes) >= 0)) {
      errors.duration_minutes = 'Duration must be zero or more.';
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
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes || 0),
        is_available: form.is_available,
      };
      const res = editing
        ? await api.put(`/vendor/car-wash/addons/${editing.id}`, payload)
        : await api.post('/vendor/car-wash/addons', payload);
      if (res.data?.success) {
        onToast?.(editing ? 'Add-on updated.' : 'Add-on created.');
        setShowForm(false);
        await load();
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setFieldErrors(data.errors);
      onToast?.(data?.message || 'Could not save the add-on.', false);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (a) => {
    setBusyId(a.id);
    try {
      const res = await api.put(`/vendor/car-wash/addons/${a.id}`, { is_available: !a.is_available });
      if (res.data?.success) { onToast?.(`"${a.name}" ${!a.is_available ? 'activated' : 'deactivated'}.`); await load(); }
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Could not change availability.', false);
    } finally { setBusyId(null); }
  };

  const remove = async (a) => {
    setBusyId(a.id);
    try {
      await api.delete(`/vendor/car-wash/addons/${a.id}`);
      onToast?.('Add-on removed.');
      await load();
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Could not remove the add-on.', false);
    } finally { setBusyId(null); }
  };

  const unusedPresets = useMemo(
    () => PRESETS.filter((p) => !addons.some((a) => String(a.name).toLowerCase() === p.toLowerCase())),
    [addons]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-on-surface-variant font-bold uppercase tracking-widest gap-2">
        <Loader2 className="animate-spin" size={18} /> Loading add-ons…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          Optional extras customers can add to any booking. Their prices are added to the total.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:text-on-surface text-xs font-bold">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => openCreate()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-600/25 hover:bg-blue-700">
            <Plus size={16} /> Add Add-on
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{error}</div>}

      {addons.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Sparkles size={26} />
          </div>
          <p className="text-base font-bold text-on-surface">No add-ons yet. Create your first optional extra.</p>
          <p className="text-sm text-on-surface-variant mt-1 mb-5">Start from scratch or pick a common one below.</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {unusedPresets.map((p) => (
              <button key={p} onClick={() => openCreate(p)} className="px-3.5 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-low text-xs font-bold text-on-surface hover:border-blue-400 hover:bg-blue-50/50">
                + {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {addons.map((a) => (
            <div key={a.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-on-surface">{a.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${a.is_available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {a.is_available ? 'Active' : 'Off'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold text-green-700">+{money(a.price)}</span>
                <span className="text-on-surface-variant text-xs">+{a.duration_minutes || 0} min</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button onClick={() => openEdit(a)} disabled={busyId === a.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold hover:bg-surface-container-high disabled:opacity-50">
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => toggleAvailable(a)} disabled={busyId === a.id} className="px-2.5 py-1.5 rounded-lg border border-outline-variant/25 text-xs font-bold hover:bg-surface-container-high disabled:opacity-50">
                  {a.is_available ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => remove(a)} disabled={busyId === a.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/15">
              <h2 className="font-headline text-xl font-bold text-on-surface">{editing ? 'Edit add-on' : 'Add add-on'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-high"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${fieldErrors.name ? 'border-red-400' : 'border-outline-variant/20'}`} />
                {fieldErrors.name && <p className="text-[11px] font-bold text-red-600">{fieldErrors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Price (USD) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${fieldErrors.price ? 'border-red-400' : 'border-outline-variant/20'}`} />
                  {fieldErrors.price && <p className="text-[11px] font-bold text-red-600">{fieldErrors.price}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Extra minutes</label>
                  <input type="number" min="0" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                    className={`w-full px-3 py-2.5 rounded-xl bg-surface-container-low border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${fieldErrors.duration_minutes ? 'border-red-400' : 'border-outline-variant/20'}`} />
                  {fieldErrors.duration_minutes && <p className="text-[11px] font-bold text-red-600">{fieldErrors.duration_minutes}</p>}
                </div>
              </div>
              <button type="button" onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold transition-colors ${form.is_available ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'}`}>
                {form.is_available ? 'Available to customers' : 'Not available'}
              </button>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-outline-variant/15">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editing ? 'Save changes' : 'Create add-on'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarWashAddonsPanel;
