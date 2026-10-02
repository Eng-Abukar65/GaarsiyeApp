import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Bell, Settings, Users, Store, ClipboardList, Moon, Sun, Menu, User,
  CheckCircle2, AlertTriangle, AlertCircle, Info, ExternalLink, ShieldAlert,
  CreditCard, Truck, Car, PackageCheck, Filter, Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

const NOTIF_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'orders', label: 'Orders' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'car_services', label: 'Car Services' },
  { id: 'security', label: 'Security' },
  { id: 'system', label: 'System' },
];

const SEVERITY_BADGES = {
  info: { label: 'Info', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', Icon: Info },
  success: { label: 'Success', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 },
  warning: { label: 'Warning', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', Icon: AlertTriangle },
  critical: { label: 'Critical', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', Icon: ShieldAlert },
};

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((new Date() - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Topbar = ({ title, onMenuClick, collapsed = false }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  
  // Notifications State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState(null);

  const searchRef = useRef(null);
  const notifRef = useRef(null);

  const adminUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_user')) || null;
    } catch {
      return null;
    }
  }, []);
  const adminName = adminUser?.username || adminUser?.name || 'Admin';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifications = async (initial = false) => {
    try {
      const response = await api.get('/admin/notifications', {
        params: {
          category: selectedCategory !== 'unread' ? selectedCategory : 'all',
          unread: selectedCategory === 'unread' ? 'true' : undefined
        }
      });
      const data = response.data?.data || response.data?.notifications || response.data || [];
      const count = response.data?.unread_count ?? data.filter(n => !n.is_read).length;

      setUnreadCount(count);
      setNotifications(prev => {
        if (!initial && Array.isArray(data)) {
          const prevUnreadIds = prev.filter(n => !n.is_read).map(n => n.id);
          const currentUnread = data.filter(n => !n.is_read);
          const newlyAdded = currentUnread.filter(n => !prevUnreadIds.includes(n.id));
          
          if (newlyAdded.length > 0) {
            setToast(newlyAdded[0].message);
            setTimeout(() => setToast(null), 5000);
          }
        }
        return Array.isArray(data) ? data : [];
      });
    } catch (err) {
      console.error('Failed to fetch admin notifications', err);
    }
  };

  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(false), 15000);
    return () => clearInterval(interval);
  }, [selectedCategory]);

  const markAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.patch(`/admin/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/admin/notifications/mark-all-read');
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (item) => {
    if (!item.is_read) {
      await markAsRead(item.id);
    }
    setShowNotifications(false);
    if (item.target_url) {
      navigate(item.target_url);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Search function
  const handleSearch = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    setShowResults(true);
    try {
      const response = await api.get(`/admin/search?q=${encodeURIComponent(val)}`);
      setResults(response.data || []);
    } catch (err) {
      console.error('Search error', err);
    } finally {
      setSearching(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (selectedCategory === 'all') return notifications;
    if (selectedCategory === 'unread') return notifications.filter(n => !n.is_read);
    return notifications.filter(n => n.category === selectedCategory);
  }, [notifications, selectedCategory]);

  return (
    <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-6 flex items-center justify-between transition-all">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight hidden sm:block">
          {title || 'Dashboard'}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Global Search Bar */}
        <div ref={searchRef} className="relative hidden md:block w-72">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search vendors, users, orders..."
            value={query}
            onChange={handleSearch}
            onFocus={() => query.trim() && setShowResults(true)}
            className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-400"
          />

          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50">
              <div className="p-2">
                {searching ? (
                  <div className="p-4 text-center text-xs font-bold text-slate-400">Searching...</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-center text-xs font-bold text-slate-400">No matching records found</div>
                ) : (
                  results.map((res, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setShowResults(false);
                        if (res.type === 'vendor') navigate(`/admin/vendors`);
                        else if (res.type === 'user') navigate(`/admin/users`);
                        else if (res.type === 'order') navigate(`/admin/operations`);
                      }}
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors flex items-center gap-3"
                    >
                      <div className="p-2 bg-primary/10 text-primary rounded-lg">
                        {res.type === 'vendor' ? <Store size={16} /> : res.type === 'user' ? <Users size={16} /> : <ClipboardList size={16} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{res.title}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{res.type} • {res.subtitle}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          
          {/* Notifications Dropdown Trigger */}
          <div ref={notifRef} className="relative">
            <button
              aria-label="Notifications"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-rose-600 text-white font-black text-[9px] rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover Panel */}
            {showNotifications && (
              <div className="absolute top-full right-0 mt-3 w-96 sm:w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-50 animate-in fade-in duration-150">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Admin Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 text-[10px] font-black rounded-full border border-rose-500/20">
                        {unreadCount} Unread
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <Check size={12} /> Mark all read
                    </button>
                  )}
                </div>

                {/* Category Filter Tabs */}
                <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-none bg-slate-50/30 dark:bg-slate-900/50">
                  {NOTIF_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Notifications Scroll List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredNotifications.length === 0 ? (
                    <div className="py-12 text-center text-xs font-bold text-slate-400 space-y-1">
                      <p>No admin notifications</p>
                      <p className="text-[10px] font-medium text-slate-400">Important system updates will appear here.</p>
                    </div>
                  ) : (
                    filteredNotifications.map(n => {
                      const severityInfo = SEVERITY_BADGES[n.severity] || SEVERITY_BADGES.info;
                      const SevIcon = severityInfo.Icon;
                      const isUnread = !n.is_read;

                      return (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-4 transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 relative ${
                            isUnread ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${severityInfo.cls}`}>
                              <SevIcon size={16} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`text-xs font-extrabold truncate ${isUnread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {n.title || 'System Alert'}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap shrink-0">
                                  {timeAgo(n.created_at)}
                                </span>
                              </div>

                              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed break-words">
                                {n.message}
                              </p>

                              <div className="mt-2.5 flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  {n.category || 'System'}
                                </span>

                                {n.target_url && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleNotificationClick(n);
                                    }}
                                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline cursor-pointer"
                                  >
                                    View Details <ExternalLink size={10} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-2" />
          
          <button onClick={() => navigate('/admin/settings')} className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-xs">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{adminName}</p>
              <p className="text-[10px] text-slate-500 uppercase leading-tight">Super User</p>
            </div>
            <Settings size={16} className="text-slate-400 group-hover:rotate-90 transition-transform" />
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 fade-in z-50">
          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-500 dark:text-primary-600">
            <Bell size={16} />
          </div>
          <p className="text-sm font-bold">{toast}</p>
        </div>
      )}
    </header>
  );
};

export default Topbar;
