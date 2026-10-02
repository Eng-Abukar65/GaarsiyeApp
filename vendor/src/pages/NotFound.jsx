import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { isAuthenticated, getRole, roleHome } from '../utils/auth';

const NotFound = () => {
  const navigate = useNavigate();
  const home = isAuthenticated() ? roleHome(getRole()) : '/login';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Compass size={30} />
        </div>
        <div className="space-y-2">
          <p className="text-5xl font-extrabold text-slate-900">404</p>
          <h1 className="text-xl font-bold text-slate-800">Page not found</h1>
          <p className="text-sm text-slate-500">
            The page you’re looking for doesn’t exist or may have moved.
          </p>
        </div>
        <button
          onClick={() => navigate(home)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:opacity-90 transition"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>
      </div>
    </div>
  );
};

export default NotFound;
