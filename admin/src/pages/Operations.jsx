import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../utils/api';
import {
  Users, Store, MapPin, Clock, Star, Truck, Search, RefreshCw,
  Download, Eye, Phone, Navigation, ShieldCheck, CheckCircle2,
  XCircle, AlertCircle, Car, UserCheck, UserX, X, ChevronRight, FileText
} from 'lucide-react';
import { filterMockData } from '../utils/filterMockData';
import { exportToCsv } from '../utils/csv';
import { useToast } from '../components/ui';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix default leaflet icon issue with Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_CONFIG = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  accepted: { label: 'Preparing', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  preparing: { label: 'Preparing', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  waiting_for_driver: { label: 'Waiting for Driver', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  driver_assigned: { label: 'Driver Assigned', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  on_the_way: { label: 'On the Way', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  arrived: { label: 'Arrived', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  delivered: { label: 'Delivered', cls: 'bg-green-100 text-green-800 border-green-200' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const createDriverIcon = (isOnline) => L.divIcon({
  className: '',
  html: `
    <div style="
      width: 38px; height: 38px;
      background: ${isOnline ? '#10B981' : '#475569'};
      border: 3px solid ${isOnline ? '#34D399' : '#64748B'};
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 15px ${isOnline ? 'rgba(16,185,129,0.4)' : 'rgba(0,0,0,0.3)'};
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -22],
});

const LiveMap = ({ drivers }) => {
  const [driverLocations, setDriverLocations] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLocations = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await api.get('/admin/driver-locations');
      setDriverLocations(filterMockData(res.data || []));
    } catch {
      setDriverLocations([]);
    } finally {
      setLastRefresh(new Date());
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 10000);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  return (
    <div id="live-fleet-map" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm mt-8">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Fleet GPS Map
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {driverLocations.length} driver(s) tracked · Last updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Online
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <div className="w-2 h-2 rounded-full bg-slate-400" /> Offline
            </span>
          </div>
          <button
            onClick={fetchLocations}
            disabled={isRefreshing}
            aria-label="Refresh driver locations"
            className="p-2 text-slate-500 hover:text-primary transition-colors cursor-pointer"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <div style={{ height: '400px' }}>
        <MapContainer
          center={[2.0469, 45.3182]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {driverLocations.map((driver) => {
            const lat = parseFloat(driver.current_latitude ?? driver.current_lat ?? driver.lat);
            const lng = parseFloat(driver.current_longitude ?? driver.current_lng ?? driver.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return (
              <Marker
                key={driver.id}
                position={[lat, lng]}
                icon={createDriverIcon(driver.is_online)}
              >
                <Popup>
                  <div className="p-2 space-y-1">
                    <p className="font-bold text-sm text-slate-900">{driver.first_name || driver.name || driver.username}</p>
                    <p className="text-xs text-slate-500 font-semibold">{driver.vehicle_type || 'Vehicle'} • {driver.plate_number || 'No plate'}</p>
                    <p className={`text-[10px] font-bold uppercase ${driver.is_online ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {driver.is_online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

const OperationsPage = () => {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [stats, setStats] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Contact / Detail Modals
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [contactModalData, setContactModalData] = useState(null);

  const filteredOrders = useMemo(() => {
    const term = orderSearch.toLowerCase();
    return (orders || []).filter(
      (o) =>
        (o.vendor_name || '').toLowerCase().includes(term) ||
        (o.customer_name || '').toLowerCase().includes(term) ||
        (o.driver_name || '').toLowerCase().includes(term) ||
        (o.id || '').toString().includes(orderSearch)
    );
  }, [orders, orderSearch]);

  const filteredDrivers = useMemo(() => {
    const term = driverSearch.toLowerCase();
    return (drivers || []).filter((d) => (d.name || d.username || '').toLowerCase().includes(term));
  }, [drivers, driverSearch]);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [ordersRes, driversRes, statsRes] = await Promise.all([
        api.get('/admin/orders'),
        api.get('/admin/users?role=driver'),
        api.get('/admin/stats'),
      ]);

      setOrders(filterMockData(ordersRes.data || []));
      setDrivers(filterMockData(driversRes.data || []));
      setStats(statsRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch operations monitoring data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    // Real-time polling every 10 seconds for monitoring dashboard
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTrackDriver = (driverLat, driverLng) => {
    const el = document.getElementById('live-fleet-map');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
    toast?.info?.('Scrolled to Live Fleet GPS Map');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Live Dispatch Monitoring
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Realtime
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Read-only monitoring of live deliveries, driver status, pickup/delivery locations, and ETA.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-slate-400">
            Updated: {lastUpdated.toLocaleTimeString()}
          </p>
          <button
            onClick={() => fetchData(false)}
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Shipments</p>
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{orders.length}</h3>
          </div>
          <div className="w-10 h-10 bg-primary-600/10 text-primary-600 rounded-xl flex items-center justify-center">
            <Truck size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Online Fleet Drivers</p>
            <h3 className="text-2xl font-extrabold text-emerald-500 mt-1">
              {(drivers || []).filter((d) => d.is_online).length}
            </h3>
          </div>
          <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center">
            <MapPin size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Partner Vendors</p>
            <h3 className="text-2xl font-extrabold text-amber-500 mt-1">{stats?.totalVendors || 0}</h3>
          </div>
          <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
            <Store size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Customers</p>
            <h3 className="text-2xl font-extrabold text-blue-500 mt-1">{stats?.newCustomers || 0}</h3>
          </div>
          <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Live Active Dispatch Cards (8 cols) */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Active Dispatch Monitor</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Monitoring {filteredOrders.length} live shipments in progress
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-48">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search order, customer..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (filteredOrders.length === 0) return toast?.info?.('No live orders to export.');
                    const count = exportToCsv(
                      'live_dispatch_monitoring',
                      [
                        { key: 'id', label: 'Order ID', format: (o) => `#ORD-${String(o.id).padStart(4, '0')}` },
                        { key: 'customer_name', label: 'Customer', format: (o) => o.customer_name || 'Customer' },
                        { key: 'vendor_name', label: 'Vendor', format: (o) => o.vendor_name || 'Vendor' },
                        { key: 'driver_name', label: 'Driver', format: (o) => o.driver_name || 'Unassigned' },
                        { key: 'status', label: 'Current Status', format: (o) => o.status },
                        { key: 'pickup_address', label: 'Pickup Location', format: (o) => o.pickup_address || 'Vendor Station' },
                        { key: 'delivery_address', label: 'Delivery Location', format: (o) => o.delivery_address || 'Customer Location' },
                        { key: 'created_at', label: 'Created At', format: (o) => new Date(o.created_at).toLocaleString() },
                      ],
                      filteredOrders
                    );
                    toast?.success?.(`Exported ${count} live dispatch order(s).`);
                  }}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            {/* List of Live Active Dispatch Cards */}
            <div className="space-y-4 max-h-[700px] overflow-y-auto no-scrollbar pr-1">
              {filteredOrders.length === 0 ? (
                <div className="py-16 text-center text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                  {loading ? 'Fetching live dispatch stream...' : 'No active shipments currently in dispatch.'}
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const normalized = (order.status || 'pending').toLowerCase();
                  const badge = STATUS_CONFIG[normalized] || STATUS_CONFIG.pending;
                  const orderNum = `#ORD-${String(order.id).padStart(4, '0')}`;
                  const isDriverOnline = Boolean(order.driver_is_online);

                  return (
                    <div
                      key={order.id}
                      className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 hover:border-primary-500/40 transition-all shadow-xs"
                    >
                      {/* Top Header Row: Order # & Status Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-600/10 text-primary-600 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0">
                            <Truck size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-base text-slate-900 dark:text-white">{orderNum}</h4>
                              {/* Read-Only Status Badge */}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              Created {new Date(order.created_at).toLocaleTimeString()} • Updated {order.updated_at ? new Date(order.updated_at).toLocaleTimeString() : new Date(order.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>

                        {/* Customer & Vendor Summary */}
                        <div className="text-left sm:text-right text-xs">
                          <p className="font-extrabold text-slate-900 dark:text-white">Customer: {order.customer_name || 'Customer'}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Vendor: {order.vendor_name || 'Vendor'}</p>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        {/* Driver & Vehicle */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Driver</p>
                          <div className="flex items-center gap-1.5">
                            <p className="font-extrabold text-slate-900 dark:text-white">
                              {order.driver_name || 'Unassigned'}
                            </p>
                            {order.driver_name && (
                              <span className={`w-2 h-2 rounded-full ${isDriverOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} title={isDriverOnline ? 'Driver Online' : 'Driver Offline'} />
                            )}
                          </div>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {order.vehicle_type || 'Truck'} {order.plate_number ? `(${order.plate_number})` : ''}
                          </p>
                        </div>

                        {/* Pickup & Delivery Location */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route & Locations</p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate" title={order.pickup_address || order.vendor_name}>
                            📍 Pickup: {order.pickup_address || order.vendor_name || 'Vendor Station'}
                          </p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate" title={order.delivery_address}>
                            🏁 Dropoff: {order.delivery_address || 'Customer Location'}
                          </p>
                        </div>

                        {/* GPS Location & ETA */}
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS & Estimated Arrival</p>
                          <p className="font-extrabold text-emerald-600 dark:text-emerald-400">
                            ETA: {order.estimated_delivery_time ? new Date(order.estimated_delivery_time).toLocaleTimeString() : '~15-25 mins'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            GPS: {order.driver_lat && order.driver_lng ? `${Number(order.driver_lat).toFixed(4)}, ${Number(order.driver_lng).toFixed(4)}` : 'Signal Active'}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons Bar (Information & Communication ONLY) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 1. View Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderDetails(order)}
                            className="px-3 py-1.5 bg-primary-600/10 hover:bg-primary-600/20 text-primary-600 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye size={14} /> View Details
                          </button>

                          {/* 2. Track Driver */}
                          <button
                            type="button"
                            onClick={() => handleTrackDriver(order.driver_lat, order.driver_lng)}
                            className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Navigation size={14} /> Track Driver
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* 3. Contact Vendor */}
                          <button
                            type="button"
                            onClick={() => setContactModalData({ role: 'Vendor', name: order.vendor_name, phone: order.vendor_phone || 'N/A' })}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Phone size={13} className="text-amber-500" /> Contact Vendor
                          </button>

                          {/* 4. Contact Driver */}
                          {order.driver_name && (
                            <button
                              type="button"
                              onClick={() => setContactModalData({ role: 'Driver', name: order.driver_name, phone: order.driver_phone || 'N/A' })}
                              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Phone size={13} className="text-blue-500" /> Contact Driver
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Fleet Status Cards (4 cols) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Live Fleet Status</h3>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-0.5">
                  {(drivers || []).filter((d) => d.is_online).length} Drivers Online
                </p>
              </div>
              <div className="relative w-28">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-3 max-h-[550px] overflow-y-auto no-scrollbar">
              {filteredDrivers.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-slate-400">
                  No drivers matching filter.
                </div>
              ) : (
                filteredDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-9 h-9 rounded-lg bg-primary-600/10 text-primary-600 flex items-center justify-center font-bold text-xs">
                          {(driver.name || driver.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div
                          className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                            driver.is_online ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-slate-900 dark:text-white">{driver.name || driver.username}</h5>
                        <p className="text-[10px] text-slate-500 font-semibold">{driver.vehicle_type || 'Truck'} {driver.plate_number ? `(${driver.plate_number})` : ''}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-[10px] font-extrabold uppercase ${driver.is_online ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {driver.is_online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      {driver.phone && (
                        <p className="text-[10px] text-slate-400 font-medium">{driver.phone}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width Live Fleet GPS Map */}
      <LiveMap drivers={drivers} />

      {/* Modal: View Order Details (Read-only) */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-primary-600" /> Order Details (#ORD-{String(selectedOrderDetails.id).padStart(4, '0')})
              </h3>
              <button onClick={() => setSelectedOrderDetails(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Customer</p>
                  <p className="font-extrabold text-slate-900 dark:text-white">{selectedOrderDetails.customer_name || 'Customer'}</p>
                  <p className="text-[11px] text-slate-500">{selectedOrderDetails.customer_phone || selectedOrderDetails.customer_email || 'No contact'}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Vendor</p>
                  <p className="font-extrabold text-slate-900 dark:text-white">{selectedOrderDetails.vendor_name || 'Vendor'}</p>
                  <p className="text-[11px] text-slate-500">{selectedOrderDetails.vendor_phone || 'No phone'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Assigned Driver</p>
                  <p className="font-extrabold text-slate-900 dark:text-white">{selectedOrderDetails.driver_name || 'Unassigned'}</p>
                  <p className="text-[11px] text-slate-500">{selectedOrderDetails.driver_phone || 'No phone'}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Amount</p>
                  <p className="font-extrabold text-emerald-600 text-sm">${Number(selectedOrderDetails.total_amount || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">{selectedOrderDetails.payment_status || 'Paid'}</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Pickup Station Address</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedOrderDetails.pickup_address || selectedOrderDetails.vendor_name || 'Vendor Station'}</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Customer Dropoff Address</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedOrderDetails.delivery_address || 'Customer Location'}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Contact Dialog */}
      {contactModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-12 h-12 bg-primary-600/10 text-primary-600 rounded-full flex items-center justify-center mx-auto">
              <Phone size={24} />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Contact {contactModalData.role}</h3>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1">{contactModalData.name}</p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-2">{contactModalData.phone}</p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setContactModalData(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
              >
                Close
              </button>

              {contactModalData.phone && contactModalData.phone !== 'N/A' && (
                <a
                  href={`tel:${contactModalData.phone}`}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5"
                >
                  <Phone size={14} /> Call Now
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsPage;
