import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../utils/api';
import BrandLogo from '../../components/shared/BrandLogo';
import CarouselAnimation from '../../components/auth/CarouselAnimation';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Email address is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      let response;
      try {
        response = await api.post('/auth/vendor/forgot-password', { email: trimmedEmail });
      } catch (err) {
        if (err.response?.status === 404) {
          response = await api.post('/vendor/forgot-password', { email: trimmedEmail });
        } else {
          throw err;
        }
      }

      if (response.data?.success) {
        setSuccessData({
          email: trimmedEmail,
          message: response.data.message || 'If an account exists for this email, password reset instructions have been sent.',
          devResetUrl: response.data?.devResetUrl,
        });
      } else {
        setError(response.data?.message || 'Unable to send reset email. Please try again later.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to send reset email. Please try again later.';
      setError(msg);
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
        <div className="w-full max-w-[440px] relative z-10">
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/5 border border-slate-100 relative overflow-hidden">
            {/* Soft decorative background spot */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#2563EB]/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>

            <div className="flex justify-center mb-6">
              <BrandLogo size="md" />
            </div>

            {successData ? (
              <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle2 size={32} />
                </div>

                <div className="space-y-2">
                  <h2 className="font-headline text-2xl font-bold text-slate-800">Check Your Email</h2>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed px-2">
                    {successData.message}
                  </p>
                </div>

                {successData.devResetUrl && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Direct Reset Link (Dev/Fallback):</p>
                    <a
                      href={successData.devResetUrl}
                      className="text-xs font-semibold text-amber-900 underline break-all hover:text-amber-700 transition-colors"
                    >
                      {successData.devResetUrl}
                    </a>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                  <p className="text-xs text-slate-500 font-medium">
                    The reset link will expire in <span className="font-bold text-slate-800">15 minutes</span> and can only be used once.
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    to="/vendor/login"
                    className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all"
                  >
                    Return to Vendor Login
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="font-headline text-2xl font-bold text-slate-800">Forgot Password?</h2>
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    Enter your registered vendor email address. We will send you password reset instructions.
                  </p>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-200/80 text-rose-700 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-150">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1" htmlFor="reset-email">
                      Vendor Email Address
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#2563EB] transition-colors">
                        <Mail size={18} aria-hidden="true" />
                      </div>
                      <input
                        id="reset-email"
                        type="email"
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all font-medium text-sm"
                        placeholder="vendor@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-2 space-y-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl shadow-lg shadow-[#2563EB]/25 text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
                    </button>

                    <Link
                      to="/vendor/login"
                      className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-2xl text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      <ArrowLeft size={14} /> Back to Vendor Login
                    </Link>
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

export default ForgotPassword;
