import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { isAuthenticated, getRole, roleHome, clearSession } from '../utils/auth';

const AccessDenied = () => {
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const home = authed ? roleHome(getRole()) : '/login';

  const handleSignOut = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
          <ShieldAlert size={30} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
          <p className="text-sm text-slate-500">
            You don’t have permission to view this page. It’s restricted to a different role.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(home)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition"
          >
            <ArrowLeft size={16} />
            My dashboard
          </button>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
