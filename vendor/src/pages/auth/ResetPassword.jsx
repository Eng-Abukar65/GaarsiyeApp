import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check, X, ShieldAlert, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import BrandLogo from '../../components/shared/BrandLogo';
import CarouselAnimation from '../../components/auth/CarouselAnimation';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Requirement 9: Password validation checklist
  const checks = {
    length: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword),
    match: newPassword.length > 0 && newPassword === confirmPassword,
  };

  const isFormValid = Object.values(checks).every(Boolean);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setVerifyError('This password reset link is invalid or has expired.');
      return;
    }

    let isMounted = true;

    const checkToken = async () => {
      try {
        let response;
        try {
          response = await api.get(`/auth/vendor/reset-password/verify?token=${encodeURIComponent(token)}`);
        } catch (err) {
          if (err.response?.status === 404) {
            response = await api.get(`/vendor/verify-reset-token?token=${encodeURIComponent(token)}`);
          } else {
            throw err;
          }
        }

        if (isMounted) {
          if (response.data?.success) {
            setTokenValid(true);
          } else {
            setVerifyError(response.data?.message || 'This password reset link is invalid or has expired.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setVerifyError(err.response?.data?.message || 'This password reset link is invalid or has expired.');
        }
      } finally {
        if (isMounted) setVerifying(false);
      }
    };

    checkToken();
    return () => { isMounted = false; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!isFormValid) {
      setFormError('Please ensure all password strength requirements are met.');
      return;
    }

    setLoading(true);

    try {
      let response;
      try {
        response = await api.post('/auth/vendor/reset-password', {
          token,
          newPassword,
          confirmPassword,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          response = await api.post('/vendor/reset-password', {
            token,
            newPassword,
            confirmPassword,
          });
        } else {
          throw err;
        }
      }

      if (response.data?.success) {
        setResetSuccess(true);
      } else {
        setFormError(response.data?.message || 'Failed to reset password.');
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row font-body overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Left side (55%) - Carousel animation */}
      <div className="hidden md:flex md:w-[55%] bg-white h-screen">
        <CarouselAnimation />
      </div>

      {/* Right side (45%) - Form */}
      <div className="w-full md:w-[45%] flex items-center justify-center p-6 md:p-12 min-h-screen md:min-h-0 relative" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="w-full max-w-[460px] relative z-10">
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/5 border border-slate-100 relative overflow-hidden">
            {/* Soft decorative background spot */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#2563EB]/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>

            <div className="flex justify-center mb-6">
              <BrandLogo size="md" />
            </div>

            {verifying ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center animate-spin">
                  <RefreshCw size={24} />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Verifying reset link…
                </p>
              </div>
            ) : resetSuccess ? (
              <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle2 size={36} />
                </div>

                <div className="space-y-2">
                  <h2 className="font-headline text-2xl font-bold text-slate-800">Password Reset Successfully</h2>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Your password has been changed. You can now sign in using your new password.
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    to="/vendor/login"
                    className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all"
                  >
                    Return to Vendor Login <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            ) : !tokenValid ? (
              <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner">
                  <ShieldAlert size={32} />
                </div>

                <div className="space-y-2">
                  <h2 className="font-headline text-xl font-bold text-slate-800">Link Invalid or Expired</h2>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {verifyError || 'This password reset link is invalid or has expired.'}
                  </p>
                </div>

                <div className="pt-2 space-y-3">
                  <Link
                    to="/vendor/forgot-password"
                    className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all"
                  >
                    Request New Reset Link
                  </Link>

                  <Link
                    to="/vendor/login"
                    className="w-full block py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    Back to Vendor Login
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="font-headline text-2xl font-bold text-slate-800">Reset Password</h2>
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    Enter your new password below.
                  </p>
                </div>

                {formError && (
                  <div className="bg-rose-50 border border-rose-200/80 text-rose-700 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-150">
                    <X size={16} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1" htmlFor="new-password">
                      New Password
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#2563EB] transition-colors">
                        <Lock size={18} aria-hidden="true" />
                      </div>
                      <input
                        id="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        className="block w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((s) => !s)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1" htmlFor="confirm-password">
                      Confirm New Password
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#2563EB] transition-colors">
                        <Lock size={18} aria-hidden="true" />
                      </div>
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="block w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Password requirement rules checklist */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Password Requirements</p>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-medium">
                      <div className={`flex items-center gap-1.5 ${checks.length ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.length ? <Check size={14} /> : <X size={14} />} At least 8 chars
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.uppercase ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.uppercase ? <Check size={14} /> : <X size={14} />} Uppercase (A-Z)
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.lowercase ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.lowercase ? <Check size={14} /> : <X size={14} />} Lowercase (a-z)
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.number ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.number ? <Check size={14} /> : <X size={14} />} Number (0-9)
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.special ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.special ? <Check size={14} /> : <X size={14} />} Special (!@#$)
                      </div>
                      <div className={`flex items-center gap-1.5 ${checks.match ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                        {checks.match ? <Check size={14} /> : <X size={14} />} Passwords match
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || !isFormValid}
                      className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? 'Resetting Password...' : 'Reset Password'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
