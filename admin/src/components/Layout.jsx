import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/users': 'User Management',
  '/vendors': 'Vendor Network',
  '/drivers': 'Fleet Management',
  '/products': 'Products',
  '/operations': 'Live Dispatch',
  '/settlements': 'Vendor Settlements',
  '/subscriptions': 'Vendor Settlements',
  '/reports': 'Analytics',
  '/settings': 'System Settings',
};

const Layout = () => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar_collapsed', String(!prev));
      return !prev;
    });
  };

  // Close the mobile drawer whenever the route changes
  React.useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const title = PAGE_TITLES[location.pathname] || 'Admin Panel';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[82vw] max-w-xs shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar isMobile onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <Topbar title={title} collapsed={collapsed} onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pt-4 sm:pt-6 lg:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
