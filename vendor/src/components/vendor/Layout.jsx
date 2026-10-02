import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = () => {
  const mustChangePassword = localStorage.getItem('vendor_must_change_password') === 'true';
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (mustChangePassword && location.pathname !== '/vendor/settings') {
    return <Navigate to="/vendor/settings" replace />;
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[82vw] max-w-xs shadow-2xl">
            <Sidebar isMobile onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileSidebarOpen(true)} />
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8 no-scrollbar bg-[#fcfcfd]">
          {mustChangePassword && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold animate-pulse">
              ⚠️ Safety Action Required: You are using an auto-generated temporary password. You must change your password in the Security tab before you can access other sections.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
