import React, { useMemo, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '../../utils/api';
import { getToken } from '../../utils/auth';
import { Droplets, Flame, Fuel, Settings, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import VendorAvatar from '../../components/vendor/VendorAvatar';
import { useVendorProfile } from '../../hooks/useVendorProfile';
import { getVendorDisplayName } from '../../utils/vendorIdentity';
import { hasBusinessType, resolveBusinessTypes } from '../../utils/businessType';

import CarWashDashboard from '../../components/vendor/CarWashDashboard';
import GasDepotDashboard from '../../components/vendor/GasDepotDashboard';
import PetrolDashboard from '../../components/vendor/PetrolDashboard';
import SparePartsDashboard from '../../components/vendor/SparePartsDashboard';

// Every business module is a fully independent dashboard. This page only decides
// which tabs the vendor owns and renders exactly ONE dashboard at a time.
const MODULES = [
  { key: 'car_wash', label: 'Car Services', businessType: 'Car Services', icon: Droplets, Component: CarWashDashboard },
  { key: 'gas', label: 'Gas Depot', businessType: 'Gas Depot', icon: Flame, Component: GasDepotDashboard },
  { key: 'petrol', label: 'Petrol Station', businessType: 'Petrol Station', icon: Fuel, Component: PetrolDashboard },
  { key: 'spare_parts', label: 'Spare Parts', businessType: 'Spare Parts Shop', icon: Settings, Component: SparePartsDashboard },
];

const ACTIVE_TAB_KEY = 'vendor_dashboard_module';

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { vendor, loading: profileLoading } = useVendorProfile();
  const [user] = useState(() => JSON.parse(localStorage.getItem('vendor_user') || 'null'));

  const businessTypes = resolveBusinessTypes(vendor, user);

  // Only the modules this vendor actually owns become tabs.
  // Fallback: If no business type is explicitly set in database, show all modules by default so vendor is never blocked.
  const availableModules = useMemo(
    () => {
      const owned = MODULES.filter((m) => hasBusinessType(businessTypes, m.businessType) || (m.key === 'car_wash' && hasBusinessType(businessTypes, 'Car Wash')));
      return owned.length > 0 ? owned : MODULES;
    },
    [businessTypes]
  );

  const [activeKey, setActiveKey] = useState(() => localStorage.getItem(ACTIVE_TAB_KEY) || '');

  // Keep the dashboard current when a new order or booking arrives. Each module
  // dashboard fetches its own stats on mount, so bumping this nonce (used as the
  // React key) remounts the active one and pulls fresh figures. Falls back to a
  // periodic refresh when the socket is unavailable, and only while the tab is
  // visible so a backgrounded tab isn't polling needlessly.
  // NOTE: declared with the other hooks, above the early returns below — hooks
  // must never be called conditionally.
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    const bump = () => setRefreshNonce((n) => n + 1);
    window.addEventListener('vendor-system-refresh', bump);
    const token = getToken();
    let socket = null;
    if (token) {
      const socketUrl = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
      socket = io(socketUrl, { auth: { token }, transports: ['websocket'], reconnection: true });
      socket.on('order-assignment-created', bump);
      socket.on('car-wash-booking-created', bump);
      socket.on('order-status-updated', bump);
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') bump();
    }, 60000);
    return () => {
      window.removeEventListener('vendor-system-refresh', bump);
      if (socket) socket.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  // Keep the selection valid: fall back to the first owned module.
  useEffect(() => {
    if (availableModules.length === 0) return;
    const isValid = availableModules.some((m) => m.key === activeKey);
    if (!isValid) {
      const next = availableModules[0].key;
      setActiveKey(next);
      localStorage.setItem(ACTIVE_TAB_KEY, next);
    }
  }, [availableModules, activeKey]);

  const selectTab = (key) => {
    setActiveKey(key);
    localStorage.setItem(ACTIVE_TAB_KEY, key);
  };

  if (!user || !user.id) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
        <p className="text-on-surface-variant font-medium mb-6">
          No authenticated vendor session was found. Please sign in to access this page.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (profileLoading && availableModules.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant font-bold uppercase tracking-widest">
        Loading dashboard…
      </div>
    );
  }

  if (availableModules.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-surface-container-lowest border border-outline-variant/20 rounded-3xl text-center shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
          <Store size={26} />
        </div>
        <h2 className="text-xl font-bold text-on-surface font-headline mb-2">No business modules assigned</h2>
        <p className="text-on-surface-variant font-medium">
          Your account has no business type yet. Contact an administrator to enable Car Services, Gas Depot,
          Petrol Station, or Spare Parts for your business.
        </p>
      </div>
    );
  }

  const active = availableModules.find((m) => m.key === activeKey) || availableModules[0];
  const ActiveDashboard = active.Component;

  return (
    <div className="font-body max-w-[1400px] mx-auto pb-12">
      {/* Vendor identity header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-headline text-on-surface">Business Dashboard</h1>
          <p className="text-sm text-on-surface-variant">
            {availableModules.length > 1
              ? 'Switch between your business modules — each one is fully independent.'
              : 'Performance overview for your business.'}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest px-4 py-3 shadow-sm">
          <VendorAvatar vendor={vendor} size="sm" rounded="rounded-xl" />
          <div>
            <p className="text-sm font-bold text-on-surface">{getVendorDisplayName(vendor)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Vendor Account</p>
          </div>
        </div>
      </div>

      {/* Module tabs — only the business types this vendor owns */}
      <div
        role="tablist"
        aria-label="Business modules"
        className="flex flex-wrap items-center gap-2 p-1.5 mb-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 w-full sm:w-fit"
      >
        {availableModules.map((m) => {
          const Icon = m.icon;
          const isActive = m.key === active.key;
          return (
            <button
              key={m.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(m.key)}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 sm:px-5 py-2.5 text-sm font-bold
                transition-all duration-200 whitespace-nowrap
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 scale-[1.02]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
            >
              <Icon size={16} aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Exactly one dashboard renders — never stacked, never mixed. */}
      <div key={active.key} className="animate-in fade-in duration-300">
        <ActiveDashboard key={`${active.key}-${refreshNonce}`} />
      </div>
    </div>
  );
};

export default DashboardOverview;
