import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { MapPin, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Clock, DollarSign, AlertCircle } from 'lucide-react';

const DeliveryZones = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentZoneId, setCurrentZoneId] = useState(null);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    zone_name: '',
    delivery_fee: '',
    estimated_time: '',
  });

  useEffect(() => {
    if (user && user.id) {
      fetchZones();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchZones = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/vendor/delivery-zones?vendorId=${user?.id}`);
      setZones(response.data || []);
    } catch (err) {
      console.error('Failed to fetch delivery zones:', err);
      setError(err.response?.data?.message || 'Failed to load delivery zones');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg, isError = false) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  const openAddModal = () => {
    setEditMode(false);
    setCurrentZoneId(null);
    setFormData({ zone_name: '', delivery_fee: '', estimated_time: '' });
    setShowModal(true);
  };

  const openEditModal = (zone) => {
    setEditMode(true);
    setCurrentZoneId(zone.id);
    setFormData({
      zone_name: zone.zone_name,
      delivery_fee: zone.delivery_fee,
      estimated_time: zone.estimated_time || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, vendor_id: user.id };
      let response;
      if (editMode) {
        response = await api.put(`/vendor/delivery-zones/${currentZoneId}`, payload);
      } else {
        response = await api.post('/vendor/delivery-zones', payload);
      }
      if (response.data.success) {
        setShowModal(false);
        fetchZones();
        showMessage(editMode ? '✅ Zone updated successfully!' : '✅ Zone created successfully!');
      } else {
        showMessage(`❌ ${response.data.message || 'Failed to save zone'}`, true);
      }
    } catch (err) {
      console.error('Failed to save zone:', err);
      showMessage(`❌ ${err.response?.data?.message || 'Failed to save zone'}`, true);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this delivery zone? This cannot be undone.')) return;
    try {
      const response = await api.delete(`/vendor/delivery-zones/${id}`);
      if (response.data.success) {
        setZones(prev => prev.filter(z => z.id !== id));
        showMessage('✅ Zone deleted successfully!');
      }
    } catch (err) {
      showMessage('❌ Failed to delete zone', true);
    }
  };

  const handleToggle = async (zone) => {
    try {
      const response = await api.put(`/vendor/delivery-zones/${zone.id}`, {
        ...zone,
        vendor_id: user.id,
        is_active: zone.is_active ? 0 : 1,
      });
      if (response.data.success) {
        fetchZones();
        showMessage(`Zone ${zone.is_active ? 'disabled' : 'enabled'} successfully!`);
      }
    } catch (err) {
      showMessage('❌ Failed to toggle zone', true);
    }
  };

  const activeZones = zones.filter(z => z.is_active);
  const totalRevenuePotential = zones.reduce((sum, z) => sum + parseFloat(z.delivery_fee || 0), 0);
  const avgFee = zones.length > 0 ? totalRevenuePotential / zones.length : 0;

  if (!user || !user.id) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
        <p className="text-on-surface-variant font-medium mb-6">
          No authenticated vendor session was found. Please sign in to access this page.
        </p>
        <button
          onClick={() => window.location.href = '/login'}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg animate-fade-in">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Error Loading Delivery Zones</h2>
        <p className="text-on-surface-variant font-medium mb-6">{error}</p>
        <button
          onClick={() => fetchZones()}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8">

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="font-headline text-3xl font-bold text-on-surface tracking-tight">Delivery Zones</h2>
          <p className="text-on-surface-variant font-medium">
            Configure custom delivery fees for each area you serve.
          </p>
          {message && (
            <div className={`mt-3 p-4 rounded-xl text-sm font-bold animate-fade-in ${
              message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message}
            </div>
          )}
        </div>
        <button
          onClick={openAddModal}
          className="px-6 py-3 bg-primary hover:bg-primary-dim text-on-primary rounded-xl font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
          <Plus size={18} />
          Add Zone
        </button>
      </section>

      {/* Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center">
            <MapPin size={22} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Zones</p>
            <p className="text-2xl font-bold text-on-surface font-headline">{zones.length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
            <ToggleRight size={22} className="text-green-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Active Zones</p>
            <p className="text-2xl font-bold text-green-600 font-headline">{activeZones.length}</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <DollarSign size={22} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Avg. Fee</p>
            <p className="text-2xl font-bold text-amber-600 font-headline">${avgFee.toFixed(2)}</p>
          </div>
        </div>
      </section>

      {/* Zones Table */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-outline-variant/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low/50 border-b border-outline-variant/10">
              <th className="py-5 px-8 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Zone Name</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Delivery Fee</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Est. Time</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
              <th className="py-5 px-8 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5 text-sm">
            {loading ? (
              <tr>
                <td colSpan="5" className="py-16 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-50">
                  Loading zones...
                </td>
              </tr>
            ) : zones.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-on-surface-variant opacity-60">
                    <AlertCircle size={40} />
                    <p className="font-bold text-sm uppercase tracking-widest">No Delivery Zones Yet</p>
                    <p className="text-xs">Click "Add Zone" to configure your first delivery area</p>
                  </div>
                </td>
              </tr>
            ) : (
              zones.map((zone) => (
                <tr key={zone.id} className="group hover:bg-surface-container-low/30 transition-colors">
                  <td className="py-5 px-8">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center">
                        <MapPin size={16} className="text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-on-surface">{zone.zone_name}</p>
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">ID: ZONE-{zone.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <span className="text-lg font-bold text-green-600 font-headline">
                      ${parseFloat(zone.delivery_fee).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                      <Clock size={14} />
                      <span>{zone.estimated_time || '—'}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <button
                      onClick={() => handleToggle(zone)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${
                        zone.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {zone.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {zone.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-5 px-8 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(zone)}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary transition-colors hover:bg-primary-container/20"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(zone.id)}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-red-500 transition-colors hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Info Banner */}
      {zones.length > 0 && (
        <section className="bg-primary/5 border border-primary/10 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">How Zone Pricing Works</p>
            <p className="text-on-surface-variant text-xs mt-1 leading-relaxed">
              When a customer selects their delivery area at checkout, the system will automatically match it to your configured zones and apply the correct delivery fee. Only active zones are shown to customers.
            </p>
          </div>
        </section>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 font-headline">
              {editMode ? 'Edit Delivery Zone' : 'Add Delivery Zone'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">Zone Name</label>
                <input
                  required
                  placeholder="e.g. KM4, Bakaaro, Hodan..."
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold focus:ring-2 focus:ring-primary/30"
                  value={formData.zone_name}
                  onChange={e => setFormData({ ...formData, zone_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest text-green-600">
                  Delivery Fee ($)
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="w-full p-3 bg-green-50 border border-green-100 rounded-xl outline-none font-bold text-green-700 focus:ring-2 focus:ring-green-300"
                  value={formData.delivery_fee}
                  onChange={e => setFormData({ ...formData, delivery_fee: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-2 tracking-widest">
                  Estimated Time <span className="text-on-surface-variant font-normal normal-case">(optional)</span>
                </label>
                <input
                  placeholder="e.g. 20-30 min, 1 hour..."
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold focus:ring-2 focus:ring-primary/30"
                  value={formData.estimated_time}
                  onChange={e => setFormData({ ...formData, estimated_time: e.target.value })}
                />
              </div>

              {/* Preview */}
              {formData.zone_name && formData.delivery_fee && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-2">Preview</p>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-primary" />
                      <span className="font-bold text-on-surface">{formData.zone_name}</span>
                    </div>
                    <span className="text-lg font-bold text-green-600">
                      ${parseFloat(formData.delivery_fee || 0).toFixed(2)}
                    </span>
                  </div>
                  {formData.estimated_time && (
                    <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
                      <Clock size={12} /> {formData.estimated_time}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 font-bold text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                >
                  {editMode ? 'Update Zone' : 'Create Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryZones;
