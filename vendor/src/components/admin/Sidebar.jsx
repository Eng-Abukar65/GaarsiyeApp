import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, NavLink } from 'react-router-dom';
import api from '../../utils/api';
import { clearSession } from '../../utils/auth';
import { 
  LayoutDashboard, 
  Users, 
  Store, 
  Truck, 
  ClipboardList, 
  CreditCard, 
  FileText, 
  ChevronRight,
  LogOut,
  Settings,
  ChevronLeft,
  MapPin,
  Package,
  BarChart3,
  Landmark,
  Layers
} from 'lucide-react';

const Sidebar = ({ isMobile = false, onClose, collapsed = false, onToggleCollapse }) => {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const isCollapsed = !isMobile && collapsed;

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

  const sidebarItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/users', icon: Users, label: 'User manager' },
    { path: '/admin/vendors', icon: Store, label: 'Vendors' },
    { path: '/admin/drivers', icon: Truck, label: 'Drivers' },
    { path: '/admin/products', icon: Package, label: 'Products' },
    { path: '/admin/operations', icon: ClipboardList, label: 'Orders & Deliveries' },
    { path: '/admin/reports', icon: FileText, label: 'Reports' },
    { path: '/admin/settlements', icon: Landmark, label: 'Settlements' },
    { path: '/admin/module-requests', icon: Layers, label: 'Module Requests' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className={`${isMobile ? 'w-full relative' : `${isCollapsed ? 'w-20' : 'w-64'} fixed inset-y-0 left-0`} bg-slate-900 text-white flex flex-col h-screen z-50 transition-all duration-300 border-r border-slate-800 shadow-2xl`}>
      <div className="h-20 flex items-center px-6 border-b border-slate-800/50 justify-between">
        {!isCollapsed && (
           <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
             <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-sm">F</div>
             FuelDirect
           </h1>
        )}
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              title={isCollapsed ? item.label : undefined}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group
                ${isActive
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <div className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-primary-400'}>
                    {Icon && <Icon size={18} />}
                  </div>
                  {!isCollapsed && <span className="text-sm font-semibold tracking-wide">{item.label}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/50">
        <button 
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 transition-all group"
        >
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm font-semibold">Logout</span>}
        </button>
      </div>

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-6 text-white animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center shadow-inner">
              <LogOut size={26} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-white">Confirm Logout</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Are you sure you want to log out?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-colors"
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
