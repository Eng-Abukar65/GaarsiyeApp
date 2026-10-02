import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, ArrowRight, AlertTriangle, X, Eye, EyeOff } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { roleHome } from '../../utils/auth';
import BrandLogo from '../../components/shared/BrandLogo';
import CarouselAnimation from '../../components/auth/CarouselAnimation';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pendingPopup, setPendingPopup] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot-password (vendor only)
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetTempPass, setResetTempPass] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(''), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPendingPopup('');

    try {
      const response = await api.post('/auth/staff/login', { email, password });
      const data = response.data;
      const signedInUser = data.user || data.vendor || data.worker;
      const mustChangePassword = Boolean(data.must_change_password);
      const resolvedRole = String(data.role || '').trim().toLowerCase();

      if (resolvedRole !== 'admin' && resolvedRole !== 'vendor' && resolvedRole !== 'car_wash_worker') {
        throw new Error('The login response did not include a valid staff role.');
      }

      // Single app: persist the session and route in-place (no cross-port handoff).
      login({ token: data.token, role: resolvedRole, user: signedInUser, mustChangePassword });

      if (resolvedRole === 'vendor' && mustChangePassword) {
        localStorage.setItem('vendor_settings_tab', 'security');
        navigate('/vendor/settings', { replace: true });
      } else if (resolvedRole === 'car_wash_worker' && mustChangePassword) {
        // First login on a temporary password → force a change immediately.
        navigate('/worker/change-password', { replace: true });
      } else {
        navigate(roleHome(resolvedRole), { replace: true });
      }
    } catch (err) {
      const status = err.response?.status;
      const code = String(err.response?.data?.code || '').trim();
      const backendMessage = String(err.response?.data?.message || '').trim();
      if (status === 403 && (code === 'PENDING_VENDOR_VERIFICATION' || /pending|approval|activate|rejected|suspended/i.test(backendMessage))) {
        setPendingPopup(backendMessage || 'Your account has not been approved yet. Please wait until it is approved.');
      } else {
        setError(backendMessage || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage('');
    setResetTempPass('');
    try {
      const response = await api.post('/vendor/forgot-password', { email: resetEmail || email });
      setResetMessage(response.data?.message || 'Password reset successfully.');
      if (response.data?.temporaryPassword) {
        setResetTempPass(response.data.temporaryPassword);
      }
    } catch (err) {
      const fallbackMessage = err.response?.data?.message || 'Failed to reset password. Please check your email.';
      setResetMessage(fallbackMessage);
    } finally {
      setResetLoading(false);
    }
  };

  const popupTitle = pendingPopup ? 'Account Pending' : 'Login Error';
  const popupMessage = pendingPopup || error;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row font-body overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Left side (55%) - Vector illustration carousel */}
      <div className="hidden md:flex md:w-[55%] bg-white h-screen">
        <CarouselAnimation />
      </div>

      {/* Right side (45%) - Clean login form */}
      <div className="w-full md:w-[45%] flex items-center justify-center p-6 md:p-12 min-h-screen md:min-h-0 relative" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="w-full max-w-[440px] relative z-10">
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/5 border border-slate-100 relative overflow-hidden">
            {/* Soft decorative background spot */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#2563EB]/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>

            {/* Title / Greetings */}
            <div className="text-center mb-6">
              <h2 className="font-headline text-3xl font-extrabold text-slate-800">Gaarsiis</h2>
              <p className="text-sm font-medium text-slate-400 mt-1">Sign In to Get Started</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 relative z-10">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1" htmlFor="email">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#2563EB] transition-colors">
                    <Mail size={18} aria-hidden="true" />
                  </div>
                  <input
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                    id="email"
                    autoComplete="username"
                    placeholder="email@address.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    type="text"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400" htmlFor="password">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[10px] font-bold text-[#2563EB] hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#2563EB] transition-colors">
                    <Lock size={18} aria-hidden="true" />
                  </div>
                  <input
                    className="block w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                    id="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all active:scale-[0.98] disabled:opacity-50"
                  type="submit"
                >
                  {loading ? 'Signing in...' : 'Login'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-[#F8FAFC] px-4 py-3.5 text-center">
                <p className="text-xs font-semibold text-slate-500">
                  New vendor?{' '}
                  <Link to="/register" className="font-bold text-[#2563EB] hover:underline">
                    Register now
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {(error || pendingPopup) && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start gap-4 p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-slate-900">{popupTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 font-medium">{popupMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => { setError(''); setPendingPopup(''); }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close popup"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => { setError(''); setPendingPopup(''); }}
                className="rounded-2xl bg-[#2563EB] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#1D4ED8] transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showReset && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-100 shadow-2xl p-8">
            <BrandLogo size="md" className="mb-6" />
            <h2 className="font-headline text-2xl font-bold text-slate-900 mb-2 text-center">Reset Vendor Password</h2>
            <p className="text-sm text-slate-500 mb-6 text-center">
              Enter your vendor email. A temporary password will be sent to that email address.
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1" htmlFor="reset-email">
                  Vendor Email
                </label>
                <input
                  id="reset-email"
                  className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  placeholder="vendor@email.com"
                />
              </div>
              {resetMessage && !resetTempPass && (
                <p className="text-xs font-bold text-[#2563EB] bg-[#2563EB]/10 rounded-2xl px-4 py-3">{resetMessage}</p>
              )}
              {resetTempPass && (
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 text-center space-y-2">
                  <p className="text-xs font-extrabold text-emerald-800">Password Reset Successful!</p>
                  <p className="text-[11px] font-medium text-emerald-700">Your temporary password is:</p>
                  <code className="text-base font-mono font-extrabold text-emerald-600 bg-white px-3 py-1.5 rounded-xl border border-emerald-300 shadow-xs inline-block tracking-wider">{resetTempPass}</code>
                  <p className="text-[10px] text-slate-500 font-medium pt-1">
                    Use this password to log in, then change it in your settings.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReset(false)}
                  className="px-5 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {resetLoading ? 'Sending...' : 'Send Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;

