import React, { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../../utils/api';
import { stockPercent } from '../../utils/progress';
import { io } from 'socket.io-client';
import { vName, vRequired, vRange, buildErrors } from '../../utils/formValidation';

const FieldErr = ({ msg }) => (msg ? <p className="text-xs font-medium text-red-500 mt-1">{msg}</p> : null);
import { 
  Gift, 
  Megaphone, 
  Percent, 
  Plus, 
  RefreshCw, 
  Tag, 
  X,
  Flame,
  BellRing,
  Gauge,
  AlertTriangle,
  ArrowRight,
  Info
} from 'lucide-react';

const emptySummary = {
  total_offers: 0,
  active_offers: 0,
  total_redeemed: 0,
  average_discount: 0,
};

const statusStyles = {
  Active: 'bg-green-100 text-green-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Draft: 'bg-slate-100 text-slate-700',
  Inactive: 'bg-slate-100 text-slate-700',
  Expired: 'bg-red-100 text-red-700',
};

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const formatDate = (value) => {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDuration = (offer) => {
  const start = formatDate(offer.start_date);
  const end = formatDate(offer.end_date);
  if (start && end) return `${start} - ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return 'No date range';
};

const summaryCards = [
  { label: 'Total Offers', key: 'total_offers', Icon: Tag },
  { label: 'Active Offers', key: 'active_offers', Icon: Megaphone },
  { label: 'Total Redeemed', key: 'total_redeemed', Icon: Gift },
  { label: 'Average Discount', key: 'average_discount', Icon: Percent, suffix: '%' },
];

const OffersPromotions = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [activeTab, setActiveTab] = useState('offers'); // 'offers' | 'monitoring'
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discount_percentage: '',
    product_id: '',
    start_date: '',
    end_date: '',
  });

  const validateOffer = () => {
    const s = formData.start_date ? new Date(formData.start_date) : null;
    const e = formData.end_date ? new Date(formData.end_date) : null;
    const errors = buildErrors({
      name: vName(formData.name, 'Offer name'),
      discount_percentage: vRange(formData.discount_percentage, 1, 100, 'Discount'),
      product_id: vRequired(formData.product_id, 'Product'),
      end_date: (s && e && e < s) ? 'End date must be on or after the start date.' : null,
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // LPG Monitoring States
  const [lpgMonitoring, setLpgMonitoring] = useState({ tanks: [], orders: [] });
  const [monitoredCustomers, setMonitoredCustomers] = useState([]);
  const [isLpgLoading, setIsLpgLoading] = useState(false);

  const fetchOffers = async () => {
    if (!user || !user.id) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/vendor/offers?vendorId=${user.id}`);
      setOffers(response.data?.offers || []);
      setSummary(response.data?.summary || emptySummary);
    } catch (err) {
      console.error('Failed to fetch vendor offers', err);
      setError(err.response?.data?.message || 'Failed to load offers.');
      setOffers([]);
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    if (!user || !user.id) return;
    try {
      const response = await api.get(`/vendor/products?vendorId=${user.id}`);
      setProducts(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch vendor products', err);
      setProducts([]);
    }
  };

  const initMonitoredCustomers = (levels = []) => {
    setMonitoredCustomers(levels.map((level) => {
      const orderStatus = String(level.order_status || '').toLowerCase();
      const activeDelivery = ['driver assigned', 'assigned', 'accepted', 'heading_to_vendor', 'picked_up', 'on the way', 'on_the_way', 'arrived'].includes(orderStatus);
      return {
        id: String(level.customer_id),
        customerId: level.customer_id,
        name: level.customer_name || 'Customer',
        remainingLpg: Number(level.remaining_liters),
        capacity: Number(level.capacity_liters),
        threshold: Number(level.low_level_threshold),
        status: activeDelivery ? 'Active Delivery' : (Number(level.low_level_alarm) === 1 ? 'Pending Refill' : 'Stable'),
        orderStatus: level.order_status,
        source: level.source,
        lastUpdate: level.recorded_at ? new Date(level.recorded_at) : null,
      };
    }));
  };

  const fetchLpgData = useCallback(async () => {
    if (!user || !user.id) return;
    try {
      setIsLpgLoading(true);
      const res = await api.get(`/vendor/lpg-monitoring?vendorId=${user.id}`);
      setLpgMonitoring(res.data || { tanks: [], orders: [] });
      initMonitoredCustomers(res.data?.customer_levels || []);
    } catch (err) {
      console.error('Failed to fetch LPG monitoring data', err);
      setMonitoredCustomers([]);
    } finally {
      setIsLpgLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && user.id) {
      fetchOffers();
      fetchProducts();
      fetchLpgData();
    } else {
      setLoading(false);
    }
  }, []);

  // Live LPG telemetry updates
  useEffect(() => {
    if (!user?.id) return undefined;
    const token = localStorage.getItem('vendor_token');
    const socketUrl = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket'], reconnection: true });
    socket.on('lpg-level-updated', () => fetchLpgData());
    return () => socket.disconnect();
  }, [user?.id, fetchLpgData]);

  const handleUpdateReading = async (customer) => {
    const rawRemaining = window.prompt(`Remaining liters for ${customer.name}`, String(customer.remainingLpg));
    if (rawRemaining === null) return;
    const remaining = Number(rawRemaining);
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > customer.capacity) {
      setMessage('Enter a valid LPG reading.');
      return;
    }
    try {
      await api.put(`/vendor/lpg-monitoring/customers/${customer.customerId}`, {
        remaining_liters: remaining,
        capacity_liters: customer.capacity,
        low_level_threshold: customer.threshold,
        source: 'manual',
      });
      await fetchLpgData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to update LPG reading.');
    }
  };

  const handleAddReading = async () => {
    const customers = lpgMonitoring.eligible_customers || [];
    if (customers.length === 0) {
      setMessage('No LPG customers with orders are available for monitoring.');
      return;
    }
    const choices = customers.map((order) => `${order.customer_id}: ${order.customer_name}`).join('\n');
    const customerId = window.prompt(`Enter customer ID:\n${choices}`);
    if (!customerId || !customers.some((order) => String(order.customer_id) === String(customerId))) return;
    const remaining = Number(window.prompt('Remaining liters', '10'));
    const capacity = Number(window.prompt('Cylinder/tank capacity in liters', '50'));
    if (!Number.isFinite(remaining) || !Number.isFinite(capacity) || remaining < 0 || capacity <= 0 || remaining > capacity) {
      setMessage('Enter valid LPG reading values.');
      return;
    }
    try {
      await api.put(`/vendor/lpg-monitoring/customers/${customerId}`, {
        remaining_liters: remaining,
        capacity_liters: capacity,
        low_level_threshold: 8,
        source: 'manual',
      });
      await fetchLpgData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Failed to add LPG reading.');
    }
  };

  const statuses = useMemo(() => {
    const unique = Array.from(new Set(offers.map((offer) => offer.status).filter(Boolean)));
    return ['All', ...unique];
  }, [offers]);

  const filteredOffers = useMemo(() => {
    if (statusFilter === 'All') return offers;
    return offers.filter((offer) => offer.status === statusFilter);
  }, [offers, statusFilter]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      discount_percentage: '',
      product_id: '',
      start_date: '',
      end_date: '',
    });
  };

  const handleCreateOffer = async (event) => {
    event.preventDefault();
    if (!validateOffer()) return;
    setSaving(true);
    setMessage('');

    try {
      const productId = Number(formData.product_id);
      const response = await api.post('/vendor/offers', {
        ...formData,
        product_id: productId,
        product_ids: [productId],
        offer_type: 'percentage',
        discount_percentage: Number(formData.discount_percentage),
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
      });
      if (response.data?.success) {
        setShowModal(false);
        resetForm();
        setFieldErrors({});
        setMessage('✓ Offer created successfully.');
        await fetchOffers();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Failed to create offer', err);
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      setMessage(err.response?.data?.message || 'Failed to create offer.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (filteredOffers.length === 0) {
      setMessage('There are no offers to export.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const rows = [
      ['Offer Name', 'Description', 'Discount', 'Duration', 'Status', 'Redeemed'],
      ...filteredOffers.map((offer) => [
        offer.name,
        offer.description || '',
        `${offer.discount_percentage}%`,
        formatDuration(offer),
        offer.status,
        offer.total_redeemed || 0,
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor-offers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setMessage('Offers exported.');
    setTimeout(() => setMessage(''), 3000);
  };

  // Calculate alerts for customer monitoring
  const criticalAlerts = monitoredCustomers.filter(c => c.remainingLpg <= c.threshold);

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8 font-body">
      {/* Header section with tabs */}
      <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-2 border-b border-outline-variant/10">
        <div>
          <h2 className="text-3xl font-bold font-headline text-on-surface tracking-tight">Offers & LPG Monitoring</h2>
          <p className="text-on-surface-variant font-medium mt-1">
            Manage promotional campaigns and monitor real-time LPG cylinder levels.
          </p>
          {message && <p className="text-sm font-semibold text-primary mt-3">{message}</p>}
        </div>
        
        {/* Tab buttons */}
        <div className="flex bg-surface-container-low p-1.5 rounded-2xl border border-outline-variant/10">
          <button
            onClick={() => setActiveTab('offers')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'offers' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Promotions & Campaigns
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'monitoring' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Gauge size={16} className={activeTab === 'monitoring' ? 'text-primary' : 'text-on-surface-variant'} />
            LPG Level Monitoring
          </button>
        </div>
      </section>

      {activeTab === 'offers' ? (
        <>
          {/* Offers & Promotions UI */}
          <section className="flex justify-between items-center">
            <h3 className="text-xl font-bold font-headline text-on-surface">Active Campaigns</h3>
            <button
              onClick={() => setShowModal(true)}
              className="bg-primary hover:bg-primary-dim text-on-primary px-6 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <Plus size={18} />
              Create New Offer
            </button>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {summaryCards.map((stat) => {
              const Icon = stat.Icon;
              const rawValue = Number(summary[stat.key] || 0);
              const value = stat.suffix === '%'
                ? `${rawValue.toFixed(1)}%`
                : rawValue.toLocaleString();
              return (
                <div key={stat.label} className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <Icon size={22} className="text-primary" />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Real Data</span>
                  </div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">{stat.label}</p>
                  <h4 className="text-2xl font-bold text-on-surface font-headline">{value}</h4>
                </div>
              );
            })}
          </section>

          <section className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/10">
            <div className="px-8 py-6 flex flex-col lg:flex-row gap-4 lg:justify-between lg:items-center bg-surface-container-low/30">
              <div>
                <h3 className="text-lg font-bold text-on-surface font-headline">Promotions</h3>
                <p className="text-sm text-on-surface-variant">Loaded from your vendor offer records.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="px-4 py-2 bg-white text-on-surface text-sm font-bold rounded-lg border border-outline-variant/20 shadow-sm cursor-pointer focus:outline-none"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-white text-on-surface text-sm font-bold rounded-lg border border-outline-variant/20 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  Export
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/30 border-b border-outline-variant/10">
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Offer Name</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant text-center">Discount</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Duration</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Status</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant text-right">Redeemed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-sm font-medium text-on-surface">
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-60">
                        Loading offers...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-red-600 font-semibold">
                        {error}
                      </td>
                    </tr>
                  ) : filteredOffers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                        No promotions found
                      </td>
                    </tr>
                  ) : (
                    filteredOffers.map((offer) => (
                      <tr key={`${offer.source}-${offer.id}`} className="hover:bg-surface-container-low/30 transition-colors">
                        <td className="px-8 py-5">
                          <p className="font-bold text-on-surface">{offer.name}</p>
                          {offer.description && (
                            <p className="text-xs text-on-surface-variant mt-1 max-w-md font-normal leading-relaxed">{offer.description}</p>
                          )}
                        </td>
                        <td className="px-8 py-5 text-center font-extrabold text-primary">
                          {Number(offer.discount_percentage || 0).toFixed(1)}%
                        </td>
                        <td className="px-8 py-5 text-on-surface-variant">{formatDuration(offer)}</td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[offer.status] || 'bg-slate-100 text-slate-700'}`}>
                            {offer.status || 'Active'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right font-bold text-on-surface">
                          {Number(offer.total_redeemed || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Dynamic LPG Monitoring Dashboard */}
          
          {/* Low Gas Level Alarm Panel */}
          {criticalAlerts.length > 0 && (
            <section className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm animate-pulse">
              <div className="flex gap-3">
                <BellRing className="text-red-600 shrink-0" size={24} />
                <div className="space-y-1">
                  <h4 className="font-bold text-red-800 text-sm uppercase tracking-wider">Low Gas Level Alarm Notification</h4>
                  <p className="text-xs text-red-700 leading-relaxed font-semibold">
                    The following customers have gas levels below their configured thresholds. Refill requests should be prepared immediately:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {criticalAlerts.map(cust => (
                      <span key={cust.id} className="bg-red-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        {cust.name}: {cust.remainingLpg} Liters Remaining ({cust.status})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Bulk Storage and Quick Stats */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Flame size={22} className="text-primary-dim" />
                  <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Telemetry Online</span>
                </div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Bulk LPG Storage Tank</p>
                {lpgMonitoring.tanks && lpgMonitoring.tanks.length > 0 ? (
                  lpgMonitoring.tanks.map(tank => {
                    // Real fill from the tank's configured capacity (was hard-coded /500).
                    const tankPercent = stockPercent(tank.liters_remaining, tank.capacity_liters);
                    return (
                    <div key={tank.product_id} className="mt-2 space-y-2">
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-2xl font-extrabold text-on-surface font-headline">
                          {tank.liters_remaining} L
                          {tankPercent !== null && (
                            <span className="ml-2 text-sm font-bold text-on-surface-variant">
                              / {tank.capacity_liters} L ({Math.round(tankPercent)}%)
                            </span>
                          )}
                        </h4>
                        <span className="text-xs font-semibold text-on-surface-variant">Min limit: {tank.low_level_threshold}L</span>
                      </div>
                      {tankPercent === null ? (
                        <p className="text-[10px] italic text-on-surface-variant/70">
                          Set this product&apos;s maximum capacity to show the fill level.
                        </p>
                      ) : (
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-1000 ${tank.low_level_alarm ? 'bg-red-500' : 'bg-primary-dim'}`}
                            style={{ width: `${tankPercent}%` }}
                          ></div>
                        </div>
                      )}
                      <p className="text-[10px] font-medium text-on-surface-variant leading-relaxed">
                        Product: {tank.name} {tank.low_level_alarm ? '(🚨 Refill Required!)' : '(Level Adequate)'}
                      </p>
                    </div>
                    );
                  })
                ) : (
                  <div className="mt-2">
                    <h4 className="text-2xl font-extrabold text-on-surface font-headline">No Tank Logs</h4>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">No LPG products found in your inventory.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-between">
              <div>
                <Gauge size={22} className="text-primary mb-4" />
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Low Gas Threshold</p>
                <h4 className="text-2xl font-bold text-on-surface font-headline">Per Customer</h4>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                  Automatic alerts use each customer's configured threshold and arrive through WebSocket.
                </p>
              </div>
            </div>

            <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm flex flex-col justify-between">
              <div>
                <RefreshCw size={22} className="text-primary mb-4 animate-spin-slow" />
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Active Deliveries / Refills</p>
                <h4 className="text-2xl font-bold text-on-surface font-headline">
                  {monitoredCustomers.filter(c => c.status === 'Active Delivery' || c.status === 'Pending Refill').length} / {monitoredCustomers.length}
                </h4>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                  Refill dispatch queue is integrated with the drivers portal for automated scheduling.
                </p>
              </div>
            </div>
          </section>

          {/* Customer Levels & Order Progress Status Grid */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold font-headline text-on-surface">Customer LPG Level Telemetry</h3>
                <p className="text-xs text-on-surface-variant mt-1">Real-time usage and refill tracking feed.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddReading} className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg">Add Reading</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {monitoredCustomers.map(cust => {
                // Clamped 0-100 and divide-by-zero safe (was upper-clamped only).
                const percentage = Math.round(stockPercent(cust.remainingLpg, cust.capacity) ?? 0);
                const isCritical = cust.remainingLpg <= cust.threshold;
                
                return (
                  <div key={cust.id} className={`p-6 bg-surface-container-lowest rounded-3xl border shadow-sm flex flex-col justify-between transition-all duration-300 ${
                    isCritical 
                      ? 'border-red-200 bg-red-50/20 hover:shadow-red-50' 
                      : 'border-outline-variant/10 hover:shadow-md'
                  }`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-on-surface text-base">{cust.name}</h4>
                        <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">ID: {cust.id.toUpperCase()}</p>
                      </div>
                      
                      {/* Status badge */}
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        cust.status === 'Active Delivery'
                          ? 'bg-green-100 text-green-700'
                          : cust.status === 'Pending Refill'
                          ? 'bg-amber-100 text-amber-700 animate-pulse'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          cust.status === 'Active Delivery'
                            ? 'bg-green-600'
                            : cust.status === 'Pending Refill'
                            ? 'bg-amber-600'
                            : 'bg-blue-600'
                        }`} />
                        {cust.status}
                      </span>
                    </div>

                    {/* Progress Indicator */}
                    <div className="space-y-3 my-4">
                      <div className="flex justify-between items-baseline">
                        <div>
                          <span className="text-3xl font-extrabold text-on-surface font-headline">{cust.remainingLpg}</span>
                          <span className="text-xs text-on-surface-variant font-bold ml-1">Liters</span>
                        </div>
                        <span className={`text-xs font-extrabold ${isCritical ? 'text-red-600' : 'text-slate-500'}`}>{percentage}%</span>
                      </div>
                      
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className={`h-3 rounded-full transition-all duration-500 ${
                            isCritical 
                              ? 'bg-gradient-to-r from-red-500 to-red-600' 
                              : 'bg-gradient-to-r from-primary to-primary-dim'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-outline-variant/10 flex justify-between items-center text-[10px] font-bold text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <Info size={12} />
                        LPG Capacity: {cust.capacity} L
                      </span>
                      <button onClick={() => handleUpdateReading(cust)} className="text-primary hover:underline">
                        Update Reading
                      </button>
                    </div>
                  </div>
                );
              })}
              {monitoredCustomers.length === 0 && (
                <div className="col-span-full p-10 text-center text-on-surface-variant font-bold">
                  No customer LPG readings yet. Add a reading from a customer's monitoring record.
                </div>
              )}
            </div>
          </section>

          {/* Active Refill Orders List */}
          <section className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/10">
            <div className="px-8 py-6 bg-surface-container-low/30 border-b border-outline-variant/10">
              <h3 className="text-lg font-bold text-on-surface font-headline">Order Delivery Status Integrations</h3>
              <p className="text-sm text-on-surface-variant">Active LPG orders dispatch progress tracked in real-time.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/30 border-b border-outline-variant/10">
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Order ID</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Customer</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant text-center">Refill Size</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Dispatch Status</th>
                    <th className="px-8 py-4 text-[10px] uppercase font-bold tracking-widest text-on-surface-variant text-right">Action Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 text-sm font-medium text-on-surface">
                  {lpgMonitoring.orders && lpgMonitoring.orders.length > 0 ? (
                    lpgMonitoring.orders.map(order => (
                      <tr key={order.order_id} className="hover:bg-surface-container-low/30 transition-colors">
                        <td className="px-8 py-5 font-bold text-primary text-[11px]">#ORD-{order.order_id}</td>
                        <td className="px-8 py-5">{order.customer_name}</td>
                        <td className="px-8 py-5 text-center font-bold text-on-surface-variant">{order.liters_ordered} Liters</td>
                        <td className="px-8 py-5">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            ['driver assigned', 'on the way', 'on_the_way'].includes(order.status.toLowerCase())
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button
                            onClick={() => window.location.href = `/orders_list`}
                            className="text-primary hover:text-primary-dim text-xs font-bold flex items-center gap-1 ml-auto"
                          >
                            Track Order
                            <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                        No active refill orders in progress
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-xl max-h-[92vh] shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col my-auto">
            <div className="px-8 py-6 border-b border-outline-variant/20 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-on-surface font-headline">Create New Offer</h3>
                <p className="text-sm text-on-surface-variant">This offer will be saved for your vendor account.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateOffer} className="p-8 space-y-5 overflow-y-auto overscroll-contain">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  Offer Name
                </label>
                <input
                  value={formData.name}
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Weekend LPG discount"
                />
                <FieldErr msg={fieldErrors.name} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Short note shown in the dashboard"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  Apply To One Product
                </label>
                <select
                  value={formData.product_id}
                  onChange={(event) => setFormData((prev) => ({ ...prev, product_id: event.target.value }))}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                >
                  <option value="" disabled>Select one product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
                <FieldErr msg={fieldErrors.product_id} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                    Discount %
                  </label>
                  <input
                    value={formData.discount_percentage}
                    onChange={(event) => setFormData((prev) => ({ ...prev, discount_percentage: event.target.value }))}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    type="number"
                    min="1"
                    max="100"
                    step="0.01"
                  />
                  <FieldErr msg={fieldErrors.discount_percentage} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                    Start Date
                  </label>
                  <input
                    value={formData.start_date}
                    onChange={(event) => setFormData((prev) => ({ ...prev, start_date: event.target.value }))}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    type="date"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                    End Date
                  </label>
                  <input
                    value={formData.end_date}
                    onChange={(event) => setFormData((prev) => ({ ...prev, end_date: event.target.value }))}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    type="date"
                    min={formData.start_date || undefined}
                  />
                  <FieldErr msg={fieldErrors.end_date} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-3 rounded-xl border border-outline-variant/20 text-on-surface font-bold"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="px-5 py-3 rounded-xl bg-primary text-on-primary font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OffersPromotions;
