import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Lock, Mail, ShieldCheck, Store, ArrowRight, Eye, EyeOff } from 'lucide-react';
import api from '../utils/api';

const resolveAppUrl = (defaultPort) => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return 'http://localhost:' + defaultPort;
  }

  return 'http://' + window.location.hostname + ':' + defaultPort;
};

const VENDOR_APP_URL = import.meta.env.VITE_VENDOR_APP_URL || resolveAppUrl(5173);
const CURRENT_ROLE = 'admin';

const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  return role === 'admin' || role === 'vendor' ? role : '';
};

const parseUser = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch (innerError) {
      return null;
    }
  }
};

const buildLoginUrl = (baseUrl, params = {}) => {
  const url = new URL(baseUrl);
  const basePath = url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : '';
  url.pathname = `${basePath}/login`;

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const buildHandoffUrl = (baseUrl, { token, role, user, mustChangePassword }) => {
  return buildLoginUrl(baseUrl, {
    staffToken: token,
    staffRole: role,
    staffUser: JSON.stringify(user || null),
    ...(mustChangePassword ? { staffMustChangePassword: 'true' } : {})
  });
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [role, setRole] = useState(CURRENT_ROLE);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const incomingToken = searchParams.get('staffToken');
    const incomingRole = normalizeRole(searchParams.get('staffRole'));
    if (!incomingToken || !incomingRole) {
      return;
    }

    const incomingUser = parseUser(searchParams.get('staffUser'));
    const incomingMustChangePassword = searchParams.get('staffMustChangePassword') === 'true';

    if (incomingRole !== CURRENT_ROLE) {
      const relayBaseUrl = incomingRole === 'vendor' ? VENDOR_APP_URL : window.location.origin;
      window.location.replace(
        buildHandoffUrl(relayBaseUrl, {
          token: incomingToken,
          role: incomingRole,
          user: incomingUser,
          mustChangePassword: incomingMustChangePassword
        })
      );
      return;
    }

    localStorage.setItem('admin_token', incomingToken);
    if (incomingUser) {
      localStorage.setItem('admin_user', JSON.stringify(incomingUser));
    }

    navigate('/', { replace: true });
  }, [navigate, searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/staff/login', {
        email,
        password,
        role,
      });

      const data = response.data;
      const signedInUser = data.user || data.vendor;

      if (role === CURRENT_ROLE) {
        localStorage.setItem('admin_token', data.token);
        if (signedInUser) {
          localStorage.setItem('admin_user', JSON.stringify(signedInUser));
        }
        navigate('/');
      } else {
        const handoffUrl = buildHandoffUrl(VENDOR_APP_URL, {
          token: data.token,
          role,
          user: signedInUser,
          mustChangePassword: Boolean(data.must_change_password)
        });

        window.location.replace(handoffUrl);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const portalTitle = role === 'vendor' ? 'Vendor Portal' : 'Admin Portal';
  const portalSubtitle = role === 'vendor'
    ? 'Access the vendor management suite.'
    : 'Secure access for FuelDirect management.';
  const portalBadgeLabel = role === 'vendor' ? 'Vendor Access' : 'Admin Access';
  const portalBadgeIcon = role === 'vendor' ? <Store size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />;
  const placeholderEmail = role === 'vendor' ? 'vendor@company.com' : 'admin@fueldirect.com';
  const submitLabel = role === 'vendor' ? 'Sign in to Vendor' : 'Sign in to Admin';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <LayoutDashboard size={24} />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 dark:bg-primary-900/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300 mb-3">
              {portalBadgeIcon}
              {portalBadgeLabel}
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{portalTitle}</h2>
            <p className="text-slate-500 mt-2">{portalSubtitle}</p>
          </div>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm py-2 px-4 rounded-lg font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            Login Role
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setRole('admin');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition-all ${
                role === 'admin'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('vendor');
                setError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition-all ${
                role === 'vendor'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Store size={16} aria-hidden="true" />
              Vendor
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
            {role === 'admin'
              ? 'You will stay in the Admin Portal after login.'
              : 'You will be redirected to the Vendor Portal after login.'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                required
                placeholder={placeholderEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-primary-600 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="password">
                Password
              </label>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {role === 'admin' ? 'Managed internally' : 'Use vendor portal for reset'}
              </span>
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-11 pr-11 text-slate-900 dark:text-white focus:outline-none focus:border-primary-600 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 active:scale-[0.98] transition-all uppercase tracking-widest text-xs disabled:opacity-50 shadow-md"
          >
            {loading ? 'Authenticating...' : submitLabel}
            <ArrowRight size={16} />
          </button>

          {role === 'vendor' && (
            <p className="text-center text-sm text-slate-500">
              New vendor?{' '}
              <a
                href={`${VENDOR_APP_URL.replace(/\/$/, '')}/register`}
                className="font-bold text-primary-600 hover:underline"
              >
                Register your business
              </a>
            </p>
          )}
        </form>

        <div className="flex items-center justify-center gap-2 text-slate-500">
          <ShieldCheck size={16} className="text-success" />
          <p className="text-xs">Secure Staff Access</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
