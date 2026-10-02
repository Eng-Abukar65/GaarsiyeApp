import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Boxes, 
  ClipboardList, 
  Truck, 
  Users, 
  Handshake, 
  BarChart3,
  Wallet, 
  MessageSquare,
  Tag,
  Settings,
  LogOut,
  MapPin,
  Droplets
} from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { clearSession } from '../../utils/auth';
import VendorAvatar from './VendorAvatar';
import { useVendorProfile } from '../../hooks/useVendorProfile';
import { getVendorDisplayName } from '../../utils/vendorIdentity';
import { hasBusinessType, resolveBusinessTypes } from '../../utils/businessType';

const Sidebar = ({ isMobile = false, onClose }) => {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { vendor } = useVendorProfile();
  const vendorName = getVendorDisplayName(vendor);
  const businessTypes = resolveBusinessTypes(vendor, JSON.parse(localStorage.getItem('vendor_user') || 'null'));
  const isCarWashVendor = hasBusinessType(businessTypes, 'Car Services') || hasBusinessType(businessTypes, 'Car Wash');
  const isCarWashOnly =
    isCarWashVendor &&
    businessTypes.every((type) => ['car services', 'car wash'].includes(String(type || '').trim().toLowerCase()));
  const navItems = [
    { name: 'Dashboard', path: '/vendor', icon: LayoutDashboard, end: true },
    ...(isCarWashVendor
      ? [
          { name: 'Car Services', path: '/vendor/car_wash_services', icon: Droplets },
          { name: 'Delivery Personnel', path: '/vendor/drivers_fleet_management', icon: Users },
          { name: 'Car Services Bookings', path: '/vendor/car_wash_bookings', icon: ClipboardList },
        ]
      : []),
    ...(!isCarWashVendor || !isCarWashOnly
      ? [
          { name: 'Products', path: '/vendor/products_management', icon: Package },
          { name: 'Purchases', path: '/vendor/purchases_history', icon: ShoppingCart },
          { name: 'Inventory', path: '/vendor/inventory_management', icon: Boxes },
          { name: 'Orders', path: '/vendor/orders_list', icon: ClipboardList },
          { name: 'Deliveries', path: '/vendor/delivery_tracking', icon: Truck },
          { name: 'Suppliers', path: '/vendor/suppliers_directory', icon: Handshake },
        ]
      : []),
    // Non-Car-Services vendors manage delivery drivers here. (Car Services vendors reach
    // the same Personnel page via the "Delivery Personnel" item above.)
    ...(!isCarWashVendor
      ? [{ name: 'Drivers', path: '/vendor/drivers_fleet_management', icon: Users }]
      : []),
    { name: 'Reports', path: '/vendor/reports_analytics', icon: BarChart3 },
    { name: 'Settlement', path: '/vendor/settlements', icon: Wallet },
    { name: 'Reviews', path: '/vendor/customer_reviews', icon: MessageSquare },
    ...(!isCarWashVendor || !isCarWashOnly
      ? [
          { name: 'Zones', path: '/vendor/delivery_zones', icon: MapPin },
          { name: 'Offers', path: '/vendor/offers_promotions', icon: Tag },
        ]
      : []),
    { name: 'Settings', path: '/vendor/settings', icon: Settings },
  ];
  const carWashOnlyNavNames = new Set([
    'Dashboard',
    'Car Services',
    'Delivery Personnel',
    'Car Services Bookings',
    'Reports',
    'Settlement',
    'Reviews',
    'Settings',
  ]);
  const visibleNavItems = isCarWashOnly
    ? navItems.filter((item) => carWashOnlyNavNames.has(item.name))
    : navItems;

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      clearSession();
      navigate('/login');
    }
  };

  return (
    <aside className={`${isMobile ? 'w-full' : 'w-64'} bg-blue-600 text-white border-r border-blue-700 flex flex-col h-screen sticky top-0 font-body shadow-xl`}>
      {/* Logo Area */}
      <div className="h-20 flex items-center px-8">
        <div>
          <h1 className="text-xl font-bold font-headline text-white">Gaarsiis</h1>
          <p className="text-[10px] uppercase font-bold tracking-widest text-blue-100 opacity-90">Management System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 overflow-y-auto w-full no-scrollbar">
        <ul className="space-y-1">
          {visibleNavItems.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.path}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-white text-blue-600 font-bold shadow-lg shadow-black/10'
                      : 'text-white/90 hover:bg-white/15 hover:text-white font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <item.icon
                        size={18}
                        className={isActive ? 'text-blue-600' : 'text-blue-100 group-hover:text-white'}
                      />
                      <span className="text-sm tracking-wide">{item.name}</span>
                    </div>
                    {/* Active Indicator (Right Dot) */}
                    {isActive && (
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Profile/Bottom Action */}
      <div className="p-4 border-t border-white/15">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors group">
          <VendorAvatar vendor={vendor} size="sm" className="!w-9 !h-9" />
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{vendorName}</p>
            <p className="text-[10px] text-blue-100 font-medium truncate">Vendor Account</p>
          </div>
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            title="Logout"
            className="p-2 text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-inner">
              <LogOut size={26} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-slate-900">Confirm Logout</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Are you sure you want to log out?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 transition-all"
              >
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
};

export default Sidebar;
