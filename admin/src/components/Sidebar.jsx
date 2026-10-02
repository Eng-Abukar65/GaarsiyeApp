import React from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import api from '../utils/api';
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
  Layers,
  DollarSign
} from 'lucide-react';

const Sidebar = ({ isMobile = false, onClose, collapsed = false, onToggleCollapse }) => {
  const navigate = useNavigate();
  const isCollapsed = !isMobile && collapsed;

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('admin_token');
      navigate('/login');
    }
  };

  const sidebarItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/users', icon: Users, label: 'User manager' },
    { path: '/vendors', icon: Store, label: 'Vendors' },
    { path: '/drivers', icon: Truck, label: 'Drivers' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/operations', icon: ClipboardList, label: 'Orders & Deliveries' },
    { path: '/financial-transactions', icon: DollarSign, label: 'Financial Transactions' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/settlements', icon: CreditCard, label: 'Settlements' },
    { path: '/module-requests', icon: Layers, label: 'Module Requests' },
    { path: '/settings', icon: Settings, label: 'Settings' },
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
              end={item.path === '/'}
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
              <div className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-primary-400'}>
                {Icon && <Icon size={18} />}
              </div>
              {!isCollapsed && <span className="text-sm font-semibold tracking-wide">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/50">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 transition-all group"
        >
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm font-semibold">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
