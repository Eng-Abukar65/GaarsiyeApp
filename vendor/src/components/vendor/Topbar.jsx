import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  Search, Bell, CheckCircle2, Menu, PackageOpen, Truck, X, 
  RefreshCw, Package, ShoppingBag, FileText, Settings, ArrowRight, Loader2,
  MapPin, Tag, Wallet, MessageSquare, ShoppingCart, Droplets, Users, Plus
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import VendorAvatar from './VendorAvatar';
import { useVendorProfile } from '../../hooks/useVendorProfile';
import { getVendorDisplayName } from '../../utils/vendorIdentity';
import api, { SOCKET_URL } from '../../utils/api';

const Topbar = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendor } = useVendorProfile();
  const vendorName = getVendorDisplayName(vendor);
  const user = useMemo(() => JSON.parse(localStorage.getItem('vendor_user') || 'null'), []);
  const token = localStorage.getItem('vendor_token');
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const previousAlarmKeys = useRef(new Set());
  const alarmSnapshotReady = useRef(false);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState({ pages: [], orders: [], products: [] });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchRef = useRef(null);

  // System navigation items for search — all pages included
  const SYSTEM_PAGES = useMemo(() => [
    { name: 'Dashboard', path: '/vendor', icon: Package, category: 'Pages', keywords: ['home', 'overview', 'dashboard', 'analytics'] },
    { name: 'Car Services', path: '/vendor/car_wash_services', icon: Droplets, category: 'Pages', keywords: ['car wash', 'services', 'wash', 'car services'] },
    { name: 'Car Services Bookings', path: '/vendor/car_wash_bookings', icon: CheckCircle2, category: 'Pages', keywords: ['car wash', 'car services', 'bookings', 'wash', 'booking'] },
    { name: 'Delivery Personnel / Drivers', path: '/vendor/drivers_fleet_management', icon: Users, category: 'Pages', keywords: ['drivers', 'personnel', 'fleet', 'workers', 'delivery personnel'] },
    { name: 'Products & Catalog', path: '/vendor/products_management', icon: Package, category: 'Pages', keywords: ['products', 'stock', 'catalog', 'items'] },
    { name: 'Purchases History', path: '/vendor/purchases_history', icon: ShoppingCart, category: 'Pages', keywords: ['purchases', 'history', 'buy', 'stock entry'] },
    { name: 'Inventory Management', path: '/vendor/inventory_management', icon: PackageOpen, category: 'Pages', keywords: ['inventory', 'low stock', 'warehouse'] },
    { name: 'Orders List', path: '/vendor/orders_list', icon: ShoppingBag, category: 'Pages', keywords: ['orders', 'sales', 'pending', 'customer'] },
    { name: 'Deliveries & Tracking', path: '/vendor/delivery_tracking', icon: Truck, category: 'Pages', keywords: ['deliveries', 'driver', 'tracking', 'dispatch'] },
    { name: 'Suppliers Directory', path: '/vendor/suppliers_directory', icon: Package, category: 'Pages', keywords: ['suppliers', 'vendors', 'contacts'] },
    { name: 'Reports & Analytics', path: '/vendor/reports_analytics', icon: FileText, category: 'Pages', keywords: ['reports', 'analytics', 'revenue', 'pdf', 'excel'] },
    { name: 'Customer Reviews', path: '/vendor/customer_reviews', icon: MessageSquare, category: 'Pages', keywords: ['reviews', 'ratings', 'feedback', 'stars'] },
    { name: 'Delivery Zones', path: '/vendor/delivery_zones', icon: MapPin, category: 'Pages', keywords: ['zones', 'delivery zones', 'coverage', 'locations', 'zone'] },
    { name: 'Offers & Promotions', path: '/vendor/offers_promotions', icon: Tag, category: 'Pages', keywords: ['offers', 'promotions', 'discounts', 'deals', 'sales', 'offer'] },
    { name: 'Settlement & Earnings', path: '/vendor/settlements', icon: Wallet, category: 'Pages', keywords: ['settlements', 'payouts', 'earnings', 'wallet', 'balance'] },
    { name: 'Settings & Profile', path: '/vendor/settings', icon: Settings, category: 'Pages', keywords: ['settings', 'account', 'profile', 'password', 'waafi'] },
  ], []);

  // Global Refresh Action
  const handleSystemRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchNotifications({ silent: true });
      window.dispatchEvent(new CustomEvent('vendor-system-refresh'));
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  // Perform live search query
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults({ pages: [], orders: [], products: [] });
      setSearchOpen(false);
      return;
    }

    setSearchOpen(true);
    setSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const matchedPages = SYSTEM_PAGES.filter(
          (p) => p.name.toLowerCase().includes(query) || p.keywords.some((k) => k.includes(query))
        );

        let matchedOrders = [];
        let matchedProducts = [];

        if (user?.id) {
          const [ordersRes, productsRes] = await Promise.all([
            api.get(`/vendor/orders?vendorId=${user.id}`).catch(() => ({ data: [] })),
            api.get(`/vendor/products?vendorId=${user.id}`).catch(() => ({ data: [] })),
          ]);

          const rawOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
          const rawProducts = Array.isArray(productsRes.data) ? productsRes.data : [];

          matchedOrders = rawOrders
            .filter(
              (o) =>
                String(o.id || '').includes(query) ||
                String(o.order_number || '').toLowerCase().includes(query) ||
                String(o.customer_name || '').toLowerCase().includes(query) ||
                String(o.status || '').toLowerCase().includes(query)
            )
            .slice(0, 5);

          matchedProducts = rawProducts
            .filter(
              (p) =>
                String(p.name || p.title || '').toLowerCase().includes(query) ||
                String(p.category_name || p.category || '').toLowerCase().includes(query) ||
                String(p.sku || '').toLowerCase().includes(query)
            )
            .slice(0, 5);
        }

        setSearchResults({
          pages: matchedPages.slice(0, 3),
          orders: matchedOrders,
          products: matchedProducts,
        });
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, user?.id, SYSTEM_PAGES]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (path) => {
    setSearchOpen(false);
    setSearchQuery('');
    navigate(path);
  };

  const ringAlarm = useCallback((title, message) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.16);
      }
    } catch {
      // Browser can block audio before user interaction; the visible badge still updates.
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }, []);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    try {
      if (!silent) setLoadingAlerts(true);
      const [notificationRes, monitoringRes, ordersRes] = await Promise.all([
        api.get('/vendor/notifications'),
        api.get(`/vendor/lpg-monitoring?vendorId=${user.id}`).catch(() => ({ data: null })),
        api.get(`/vendor/orders?vendorId=${user.id}`).catch(() => ({ data: [] })),
      ]);

      const serverNotifications = notificationRes.data || [];
      setNotifications(serverNotifications);

      const monitoring = monitoringRes.data || {};
      const tankAlerts = (monitoring.tanks || [])
        .filter((tank) => Number(tank.low_level_alarm) === 1)
        .map((tank) => ({
          key: `tank-${tank.product_id}`,
          title: 'Low LPG stock',
          message: `${tank.name}: ${Number(tank.liters_remaining || 0).toLocaleString()} liters remaining.`,
          type: 'low_stock',
          created_at: new Date().toISOString(),
        }));

      const customerLpgAlerts = (monitoring.customer_levels || [])
        .filter((level) => Number(level.low_level_alarm) === 1)
        .map((level) => ({
          key: `customer-lpg-${level.customer_id}-${level.product_id || 'default'}`,
          title: 'Customer LPG low',
          message: `${level.customer_name}: ${Number(level.remaining_liters || 0).toLocaleString()} liters remaining.`,
          type: 'lpg_customer_low',
          created_at: new Date().toISOString(),
        }));

      const orderAlerts = (ordersRes.data || [])
        .filter((order) => ['pending', 'pending_payment', 'pending_driver_assignment'].includes(String(order.status || '').toLowerCase()))
        .slice(0, 8)
        .map((order) => ({
          key: `order-${order.id}-${order.status}`,
          title: String(order.status).toLowerCase() === 'pending_driver_assignment' ? 'Assign another driver' : 'Order needs attention',
          message: `Order #${order.id} is ${String(order.status || '').replaceAll('_', ' ')}.`,
          type: 'order_attention',
          created_at: order.created_at || new Date().toISOString(),
        }));

      const nextLiveAlerts = [...tankAlerts, ...customerLpgAlerts, ...orderAlerts];
      const nextKeys = new Set(nextLiveAlerts.map((alert) => alert.key));
      const hasNewAlarm = nextLiveAlerts.some((alert) => !previousAlarmKeys.current.has(alert.key));
      previousAlarmKeys.current = nextKeys;
      setLiveAlerts(nextLiveAlerts);

      if (alarmSnapshotReady.current && hasNewAlarm) {
        const first = nextLiveAlerts[0];
        ringAlarm(first.title, first.message);
      }
      alarmSnapshotReady.current = true;
    } catch (error) {
      console.error('Failed to load vendor alarms', error);
    } finally {
      setLoadingAlerts(false);
    }
  }, [ringAlarm, user?.id]);

  useEffect(() => {
    fetchNotifications({ silent: true });
    const interval = window.setInterval(() => fetchNotifications({ silent: true }), 60000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id || !token) return undefined;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'], reconnection: true });
    const refreshWithAlarm = (payload = {}) => {
      const title = payload.status === 'rejected' ? 'Driver rejected order' : 'New vendor alert';
      const message = payload.order_id ? `Order #${payload.order_id} needs attention.` : 'Please check your vendor portal.';
      ringAlarm(title, message);
      fetchNotifications({ silent: true });
    };

    socket.on('connect', () => socket.emit('join-vendor-room', user.id));
    socket.on('order-assignment-created', refreshWithAlarm);
    socket.on('order-assignment-overdue', refreshWithAlarm);
    socket.on('assignment-response-overdue', refreshWithAlarm);
    socket.on('driver-rejected-order', refreshWithAlarm);
    socket.on('delivery-status-updated', refreshWithAlarm);
    socket.on('inventory-updated', refreshWithAlarm);
    socket.on('lpg-level-updated', refreshWithAlarm);

    return () => socket.disconnect();
  }, [fetchNotifications, ringAlarm, token, user?.id]);

  const unreadCount = notifications.filter((item) => Number(item.is_read) === 0).length + liveAlerts.length;
  const combinedAlerts = [
    ...liveAlerts.map((alert) => ({ ...alert, is_live: true, id: alert.key })),
    ...notifications,
  ].slice(0, 12);

  const markRead = async (notification) => {
    if (!notification.is_live && Number(notification.is_read) === 0) {
      try {
        await api.patch(`/vendor/notifications/${notification.id}/read`);
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: 1 } : item));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    setIsOpen(false);

    const type = String(notification.type || '').toLowerCase();
    const title = String(notification.title || '').toLowerCase();
    const msg = String(notification.message || '').toLowerCase();

    if (type.includes('car_wash') || type.includes('car_service') || title.includes('car wash') || title.includes('car service') || msg.includes('booking cw-') || msg.includes('cw-')) {
      navigate('/vendor/car_wash_bookings');
    } else if (type.includes('order') || title.includes('order') || notification.order_id) {
      if (notification.order_id) {
        navigate(`/vendor/orders/${notification.order_id}`);
      } else {
        navigate('/vendor/orders_list');
      }
    } else if (type.includes('stock') || type.includes('lpg') || title.includes('stock') || title.includes('lpg')) {
      navigate('/vendor/inventory_management');
    }
  };

  const handleBellClick = () => {
    setIsOpen((value) => !value);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    fetchNotifications({ silent: true });
  };

  const getAlertIcon = (type) => {
    if (String(type || '').includes('stock') || String(type || '').includes('lpg')) return <PackageOpen size={16} />;
    if (String(type || '').includes('delivery') || String(type || '').includes('driver')) return <Truck size={16} />;
    return <Bell size={16} />;
  };

  return (
    <header className="h-16 sm:h-20 bg-surface border-b border-outline-variant/20 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-10 font-body">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={22} />
      </button>

      {/* Functional Search Bar */}
      <div ref={searchRef} className="hidden sm:block flex-1 max-w-xl relative">
        <div className="relative flex items-center">
          <span className="absolute left-3.5 text-on-surface-variant/60 pointer-events-none">
            <Search size={18} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setSearchOpen(false);
                navigate(`/vendor/orders?search=${encodeURIComponent(searchQuery.trim())}`);
              }
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            placeholder="Search analytics, orders, or stock..."
            className="block w-full pl-10 pr-9 py-2.5 rounded-2xl border border-outline-variant/10 bg-surface-container-low text-sm placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-container-lowest transition-all font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
              className="absolute right-3 p-1 text-on-surface-variant/60 hover:text-on-surface rounded-full transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search Results Dropdown Overlay */}
        {searchOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden z-50 animate-in fade-in duration-150">
            {searchLoading ? (
              <div className="p-4 text-center text-xs font-bold text-on-surface-variant flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
                Searching system data...
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto p-2 divide-y divide-outline-variant/10">
                {searchResults.pages.length === 0 && searchResults.orders.length === 0 && searchResults.products.length === 0 ? (
                  <div className="p-6 text-center text-xs font-semibold text-on-surface-variant">
                    No results found for "<span className="font-bold text-on-surface">{searchQuery}</span>"
                  </div>
                ) : (
                  <>
                    {/* System Pages */}
                    {searchResults.pages.length > 0 && (
                      <div className="py-1">
                        <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant/70">
                          System Navigation
                        </p>
                        {searchResults.pages.map((p) => (
                          <button
                            key={p.path}
                            onClick={() => handleSelectResult(p.path)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-surface-container-low transition-colors group"
                          >
                            <div className="p-2 bg-primary/10 text-primary rounded-xl">
                              <p.icon size={16} />
                            </div>
                            <span className="text-xs font-bold text-on-surface flex-1">{p.name}</span>
                            <ArrowRight size={14} className="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Orders */}
                    {searchResults.orders.length > 0 && (
                      <div className="py-1">
                        <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant/70">
                          Matching Orders
                        </p>
                        {searchResults.orders.map((o) => (
                          <button
                            key={o.id}
                            onClick={() => handleSelectResult(`/vendor/orders`)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-surface-container-low transition-colors group"
                          >
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                              <ShoppingBag size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-on-surface truncate">
                                Order #{o.order_number || o.id} — {o.customer_name || 'Customer'}
                              </p>
                              <p className="text-[10px] font-medium text-on-surface-variant uppercase">
                                Status: {o.status || 'pending'}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-primary">${Number(o.total_amount || 0).toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Products & Inventory */}
                    {searchResults.products.length > 0 && (
                      <div className="py-1">
                        <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant/70">
                          Products & Stock
                        </p>
                        {searchResults.products.map((pr) => (
                          <button
                            key={pr.id}
                            onClick={() => handleSelectResult(`/vendor/products_management`)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-surface-container-low transition-colors group"
                          >
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                              <Package size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-on-surface truncate">{pr.name || pr.title}</p>
                              <p className="text-[10px] font-medium text-on-surface-variant">
                                Stock: {pr.stock ?? 'N/A'} • {pr.category_name || 'General'}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-on-surface">${Number(pr.price || 0).toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Tools - Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 sm:ml-4">

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={handleBellClick}
            className="relative p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
            title="Alarms and notifications"
          >
            <Bell size={20} className={unreadCount > 0 ? 'animate-pulse text-primary' : ''} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-3 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden z-50">
              <div className="px-5 py-4 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/40">
                <div>
                  <p className="text-sm font-extrabold text-on-surface">Alarms & Notifications</p>
                  <p className="text-[11px] text-on-surface-variant font-semibold">{unreadCount} needs attention</p>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-surface-container">
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {loadingAlerts && (
                  <div className="px-5 py-4 text-xs font-bold text-on-surface-variant">Loading alarms...</div>
                )}
                {!loadingAlerts && combinedAlerts.length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <CheckCircle2 className="mx-auto text-green-500 mb-3" size={34} />
                    <p className="text-sm font-bold text-on-surface">No active alarms</p>
                    <p className="text-xs text-on-surface-variant mt-1">Orders, driver responses, and LPG stock are clear.</p>
                  </div>
                )}
                {combinedAlerts.map((item) => (
                  <button
                    key={`${item.is_live ? 'live' : 'db'}-${item.id}`}
                    onClick={() => markRead(item)}
                    className={`w-full text-left px-5 py-4 border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors ${
                      item.is_live || Number(item.is_read) === 0 ? 'bg-primary/5' : 'bg-white'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center ${
                        item.is_live || Number(item.is_read) === 0 ? 'bg-primary text-white' : 'bg-slate-100 text-on-surface-variant'
                      }`}>
                        {getAlertIcon(item.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-extrabold text-on-surface truncate">{item.title || 'Vendor Alert'}</p>
                          {(item.is_live || Number(item.is_read) === 0) && (
                            <span className="text-[9px] font-black uppercase text-error">New</span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{item.message}</p>
                        <p className="text-[10px] text-on-surface-variant/70 mt-2 font-bold">
                          {item.is_live ? 'Live alarm' : new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div 
          onClick={() => navigate('/vendor/settings')}
          className="flex items-center gap-3 cursor-pointer pl-4 border-l border-outline-variant/20 group hover:bg-surface-container-low p-2 rounded-xl transition-all"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">{vendorName}</p>
            <p className="text-[10px] sm:text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Vendor</p>
          </div>
          <VendorAvatar vendor={vendor} size="sm" className="shadow-sm" />
        </div>
      </div>
    </header>
  );
};

export default Topbar;
