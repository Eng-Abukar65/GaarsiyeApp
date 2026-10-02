import React from 'react';
import api from '../../utils/api';
import {
  Save,
  RefreshCw,
  Shield,
  Bell,
  Globe,
  CreditCard,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Store,
  CheckCircle2,
  Edit2,
  DollarSign,
  History,
  AlertTriangle,
  X,
  PackageCheck,
  User,
  Fuel,
  Flame,
  Wrench,
  Car
} from 'lucide-react';
import { useToast, Toggle } from '../../components/admin/ui';

const getModuleIcon = (planCode) => {
  switch (planCode) {
    case 'petrol_diesel':
      return Fuel;
    case 'gas_cylinder':
      return Flame;
    case 'spare_parts':
      return Wrench;
    case 'car_services':
      return Car;
    default:
      return CreditCard;
  }
};

const AdminSecuritySection = ({ settings, updateSetting }) => {
  const [profile, setProfile] = React.useState(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);

  // Email state
  const [emailForm, setEmailForm] = React.useState({
    newEmail: '',
    confirmNewEmail: '',
    currentPassword: ''
  });
  const [showEmailPass, setShowEmailPass] = React.useState(false);
  const [emailSaving, setEmailSaving] = React.useState(false);
  const [emailFeedback, setEmailFeedback] = React.useState(null);

  // Password state
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPass, setShowCurrentPass] = React.useState(false);
  const [showNewPass, setShowNewPass] = React.useState(false);
  const [showConfirmPass, setShowConfirmPass] = React.useState(false);
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordFeedback, setPasswordFeedback] = React.useState(null);

  // Session state
  const [loggingOutOthers, setLoggingOutOthers] = React.useState(false);
  const [sessionFeedback, setSessionFeedback] = React.useState(null);

  const fetchProfile = React.useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await api.get('/admin/profile');
      if (res.data?.success) {
        setProfile(res.data.profile);
      }
    } catch (err) {
      console.error('Error fetching admin profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Password validation criteria
  const passwordChecks = React.useMemo(() => {
    const p = passwordForm.newPassword;
    return {
      length: p.length >= 8,
      uppercase: /[A-Z]/.test(p),
      lowercase: /[a-z]/.test(p),
      number: /[0-9]/.test(p),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    };
  }, [passwordForm.newPassword]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setEmailFeedback(null);
    setEmailSaving(true);
    try {
      const res = await api.put('/admin/security/email', emailForm);
      if (res.data?.success) {
        setEmailFeedback({ type: 'success', text: res.data.message || 'Email updated successfully!' });
        setEmailForm({ newEmail: '', confirmNewEmail: '', currentPassword: '' });
        fetchProfile();
      }
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update email address.'
      });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPasswordFeedback(null);
    setPasswordSaving(true);
    try {
      const res = await api.put('/admin/security/password', passwordForm);
      if (res.data?.success) {
        setPasswordFeedback({ type: 'success', text: res.data.message || 'Password updated successfully!' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        
        if (res.data.forceLogout) {
          setTimeout(() => {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_user');
            window.location.href = '/login';
          }, 1800);
        }
      }
    } catch (err) {
      setPasswordFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update password.'
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogoutOtherSessions = async () => {
    setSessionFeedback(null);
    setLoggingOutOthers(true);
    try {
      const res = await api.post('/admin/security/logout-other-sessions');
      if (res.data?.success) {
        setSessionFeedback({ type: 'success', text: res.data.message });
      }
    } catch (err) {
      setSessionFeedback({ type: 'error', text: err.response?.data?.message || 'Failed to terminate other sessions.' });
    } finally {
      setLoggingOutOthers(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. ADMIN ACCOUNT INFO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
            <User size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Admin Account Overview</h4>
            <p className="text-xs text-slate-500">Live platform credentials & permission profile</p>
          </div>
        </div>

        {loadingProfile ? (
          <div className="py-6 text-center text-xs font-bold text-slate-400 animate-pulse">Loading profile credentials...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Full Name</p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{profile?.fullName || 'System Admin'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Username</p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">@{profile?.username || 'admin'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address</p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{profile?.email || 'admin@fueldirect.com'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Role Level</p>
              <span className="inline-block px-2.5 py-0.5 bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase rounded-md border border-blue-500/20">
                {profile?.role || 'SUPER ADMIN'}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Last Active Login</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'Live Session'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. CHANGE EMAIL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
            <Mail size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Change Admin Email</h4>
            <p className="text-xs text-slate-500">Update your primary administrative contact and login address</p>
          </div>
        </div>

        {emailFeedback && (
          <div className={`p-4 mb-6 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            emailFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
          }`}>
            {emailFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{emailFeedback.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdateEmail} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Current Email</label>
            <input
              type="text"
              readOnly
              disabled
              value={profile?.email || 'admin@fueldirect.com'}
              className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                New Email <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="email"
                placeholder="newadmin@fueldirect.com"
                value={emailForm.newEmail}
                onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Confirm New Email <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="email"
                placeholder="newadmin@fueldirect.com"
                value={emailForm.confirmNewEmail}
                onChange={(e) => setEmailForm({ ...emailForm, confirmNewEmail: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Current Password (Required for Email Change) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                required
                type={showEmailPass ? 'text' : 'password'}
                placeholder="Enter current password to authorize"
                value={emailForm.currentPassword}
                onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowEmailPass(!showEmailPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showEmailPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={emailSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {emailSaving ? <RefreshCw className="animate-spin" size={15} /> : <Save size={15} />}
              {emailSaving ? 'Updating Email...' : 'Update Email Address'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. CHANGE PASSWORD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center font-bold">
            <KeyRound size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Change Password</h4>
            <p className="text-xs text-slate-500">Update account authentication password (Requires 8+ chars, uppercase, lowercase, number & special char)</p>
          </div>
        </div>

        {passwordFeedback && (
          <div className={`p-4 mb-6 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            passwordFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
          }`}>
            {passwordFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{passwordFeedback.text}</span>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Current Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                required
                type={showCurrentPass ? 'text' : 'password'}
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  required
                  type={showNewPass ? 'text' : 'password'}
                  placeholder="Min 8 chars (A-Z, a-z, 0-9, !@#)"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Confirm New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  required
                  type={showConfirmPass ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Validation Indicator */}
          {passwordForm.newPassword && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Password Requirements</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-bold">
                <span className={passwordChecks.length ? 'text-emerald-500' : 'text-slate-400'}>
                  {passwordChecks.length ? '✓' : '○'} 8+ Characters
                </span>
                <span className={passwordChecks.uppercase ? 'text-emerald-500' : 'text-slate-400'}>
                  {passwordChecks.uppercase ? '✓' : '○'} Uppercase (A-Z)
                </span>
                <span className={passwordChecks.lowercase ? 'text-emerald-500' : 'text-slate-400'}>
                  {passwordChecks.lowercase ? '✓' : '○'} Lowercase (a-z)
                </span>
                <span className={passwordChecks.number ? 'text-emerald-500' : 'text-slate-400'}>
                  {passwordChecks.number ? '✓' : '○'} Number (0-9)
                </span>
                <span className={passwordChecks.special ? 'text-emerald-500' : 'text-slate-400'}>
                  {passwordChecks.special ? '✓' : '○'} Special Symbol
                </span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={passwordSaving}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {passwordSaving ? <RefreshCw className="animate-spin" size={15} /> : <KeyRound size={15} />}
              {passwordSaving ? 'Updating Password...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. SESSION SECURITY */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-600/10 text-purple-600 flex items-center justify-center font-bold">
            <Lock size={20} />
          </div>
          <div>
            <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Session Security</h4>
            <p className="text-xs text-slate-500">Configure active session timeouts and manage multi-device access</p>
          </div>
        </div>

        {sessionFeedback && (
          <div className={`p-4 mb-6 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            sessionFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
          }`}>
            {sessionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{sessionFeedback.text}</span>
          </div>
        )}

        <div className="space-y-6 max-w-2xl">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Inactivity Session Timeout
            </label>
            <select
              value={settings.session_timeout || '30 Minutes'}
              onChange={(e) => updateSetting('session_timeout', e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 w-full sm:w-72 cursor-pointer"
            >
              <option value="15 Minutes">15 Minutes</option>
              <option value="30 Minutes">30 Minutes</option>
              <option value="1 Hour">1 Hour</option>
              <option value="4 Hours">4 Hours</option>
              <option value="8 Hours">8 Hours</option>
              <option value="24 Hours">24 Hours</option>
            </select>
          </div>

          {/* Active Session Info */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">Active Session (Current Device)</p>
                <p className="text-[11px] text-slate-400 font-medium">Windows PC • Web Browser • Authenticated</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase rounded-md border border-emerald-500/20">
              Active
            </span>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleLogoutOtherSessions}
              disabled={loggingOutOthers}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loggingOutOthers ? <RefreshCw className="animate-spin" size={15} /> : <Lock size={15} />}
              {loggingOutOthers ? 'Terminating Sessions...' : 'Logout All Other Sessions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SettingGroup = ({ title, description, children }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
      <h4 className="font-bold text-slate-900 dark:text-white">{title}</h4>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
    <div className="p-6 space-y-6">
      {children}
    </div>
  </div>
);

const SettingItem = ({ label, description, children, icon: Icon }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div className="flex items-start gap-4 max-w-md">
      {Icon && (
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 mt-1">
          <Icon size={20} />
        </div>
      )}
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
    </div>
    <div className="flex-shrink-0">
      {children}
    </div>
  </div>
);

const defaultWaafiForm = {
  merchantUid: '',
  apiUserId: '',
  apiKey: '',
  enabled: false,
  apiKeySet: false,
  apiKeyEncrypted: false,
  apiKeyUsable: false,
  configured: false,
  apiEndpoint: 'https://api.waafipay.net/asm',
  timeoutMs: 30000,
};

const asBoolean = (value) => (
  value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1'
);

const normalizeWaafiSettings = (payload = {}) => {
  const source = payload?.settings || payload?.data || payload || {};
  const merchantUid = source.waafi_merchant_uid ?? source.merchant_uid ?? source.merchantUid ?? '';
  const apiUserId = source.waafi_api_user_id ?? source.api_user_id ?? source.apiUserId ?? '';
  const apiKeySet = asBoolean(
    source.waafi_api_key_set ?? source.api_key_set ?? source.has_api_key ?? source.apiKeySet
  );
  const apiKeyEncrypted = asBoolean(
    source.waafi_api_key_encrypted ?? source.api_key_encrypted ?? source.apiKeyEncrypted
  );
  const apiKeyUsableValue = source.waafi_api_key_usable ?? source.api_key_usable ?? source.apiKeyUsable;
  const apiKeyUsable = apiKeyUsableValue === undefined ? apiKeySet : asBoolean(apiKeyUsableValue);
  const enabled = asBoolean(source.waafi_enabled ?? source.enabled);
  const configuredValue = source.configured ?? source.is_configured;

  return {
    merchantUid: String(merchantUid || ''),
    apiUserId: String(apiUserId || ''),
    apiKey: '',
    enabled,
    apiKeySet,
    apiKeyEncrypted,
    apiKeyUsable,
    configured: configuredValue === undefined
      ? Boolean(merchantUid && apiUserId && apiKeySet)
      : asBoolean(configuredValue),
    apiEndpoint: String(
      source.api_endpoint ?? source.api_url ?? source.hurmood_api_url ?? defaultWaafiForm.apiEndpoint
    ),
    timeoutMs: Number(
      source.timeout_ms ?? source.hurmood_timeout_ms ?? source.api_timeout_ms ?? defaultWaafiForm.timeoutMs
    ) || defaultWaafiForm.timeoutMs,
  };
};

const SettingsPage = () => {
  const toast = useToast();
  const [settings, setSettings] = React.useState({
    app_name: 'FuelDirect',
    support_email: 'support@fueldirect.com',
    session_timeout: '1 Hour',
    two_factor_auth: 'false',
    email_notifications: 'true',
    browser_push: 'true'
  });

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('subscriptions');

  // Subscription Pricing State
  const [pricingPlans, setPricingPlans] = React.useState([]);
  const [pricingHistory, setPricingHistory] = React.useState([]);
  const [pricingLoading, setPricingLoading] = React.useState(true);
  const [editingPlan, setEditingPlan] = React.useState(null);
  const [editPriceForm, setEditPriceForm] = React.useState({ price: '', status: 'active', plan_name: '', module_description: '' });
  const [updatingPricing, setUpdatingPricing] = React.useState(false);
  const [validationError, setValidationError] = React.useState('');

  const handleToggleModuleStatus = async (plan, newStatus) => {
    try {
      const response = await api.put(`/admin/subscription-pricing/${plan.id}`, {
        price: plan.price,
        status: newStatus,
        plan_name: plan.plan_name,
        module_description: plan.module_description
      });
      const data = response.data?.data || {};
      setPricingPlans(data.plans || []);
      setPricingHistory(data.history || []);
      toast.success(`${plan.plan_name} status updated to ${newStatus}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update module status.');
    }
  };

  // Waafi State
  const [vendors, setVendors] = React.useState([]);
  const [vendorsLoading, setVendorsLoading] = React.useState(true);
  const [vendorsError, setVendorsError] = React.useState('');
  const [selectedVendorId, setSelectedVendorId] = React.useState('');
  const [waafiForm, setWaafiForm] = React.useState(defaultWaafiForm);
  const [waafiLoading, setWaafiLoading] = React.useState(false);
  const [waafiSaving, setWaafiSaving] = React.useState(false);
  const [waafiError, setWaafiError] = React.useState('');
  const [waafiLoadFailed, setWaafiLoadFailed] = React.useState(false);
  const [showWaafiApiKey, setShowWaafiApiKey] = React.useState(false);
  const waafiRequestIdRef = React.useRef(0);

  const fetchSettings = React.useCallback(async () => {
    try {
      const response = await api.get('/admin/settings');
      const data = response.data;
      setSettings(prev => {
        const settingsObj = { ...prev };
        data.forEach(s => settingsObj[s.setting_key] = s.setting_value);
        return settingsObj;
      });
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubscriptionPricing = React.useCallback(async () => {
    setPricingLoading(true);
    try {
      const response = await api.get('/admin/subscription-pricing');
      const data = response.data?.data || {};
      setPricingPlans(data.plans || []);
      setPricingHistory(data.history || []);
    } catch (err) {
      console.error('Failed to fetch subscription pricing', err);
      toast?.error?.('Failed to load subscription pricing details.');
    } finally {
      setPricingLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchSettings();
    fetchSubscriptionPricing();
  }, [fetchSettings, fetchSubscriptionPricing]);

  const fetchVendors = React.useCallback(async () => {
    setVendorsLoading(true);
    setVendorsError('');

    try {
      const response = await api.get('/admin/vendors');
      const payload = response.data;
      const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.vendors) ? payload.vendors : (Array.isArray(payload?.data) ? payload.data : []));

      setVendors(rows);
      setSelectedVendorId((currentId) => {
        if (currentId && rows.some((vendor) => String(vendor.id) === String(currentId))) {
          return String(currentId);
        }
        return rows[0]?.id !== undefined ? String(rows[0].id) : '';
      });
    } catch (err) {
      setVendors([]);
      setSelectedVendorId('');
      setVendorsError(err.response?.data?.message || 'Failed to load vendors.');
    } finally {
      setVendorsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const loadWaafiSettings = React.useCallback(async (vendorId) => {
    const requestId = ++waafiRequestIdRef.current;
    if (!vendorId) {
      setWaafiForm(defaultWaafiForm);
      setWaafiError('');
      setWaafiLoadFailed(false);
      setWaafiLoading(false);
      return false;
    }

    setWaafiLoading(true);
    setWaafiError('');
    setWaafiLoadFailed(false);
    setWaafiForm(defaultWaafiForm);
    setShowWaafiApiKey(false);

    try {
      const response = await api.get(`/admin/vendors/${vendorId}/waafi-settings`);
      if (requestId !== waafiRequestIdRef.current) return false;
      setWaafiForm(normalizeWaafiSettings(response.data));
      setWaafiLoadFailed(false);
      return true;
    } catch (err) {
      if (requestId !== waafiRequestIdRef.current) return false;
      setWaafiError(err.response?.data?.message || 'Failed to load WaafiPay credentials.');
      setWaafiLoadFailed(true);
      return false;
    } finally {
      if (requestId === waafiRequestIdRef.current) {
        setWaafiLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    loadWaafiSettings(selectedVendorId);
  }, [loadWaafiSettings, selectedVendorId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/admin/settings', { settings });
      toast.success('System settings saved successfully.');
      fetchSettings();
    } catch (err) {
      console.error('Save error', err);
      toast.error(err.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleVendorSelection = (event) => {
    waafiRequestIdRef.current += 1;
    setSelectedVendorId(event.target.value);
    setWaafiForm(defaultWaafiForm);
    setWaafiError('');
    setWaafiLoadFailed(false);
    setShowWaafiApiKey(false);
  };

  const handleSaveWaafiSettings = async (event) => {
    event.preventDefault();
    if (!selectedVendorId) {
      toast.error('Please select a vendor.');
      return;
    }

    setWaafiSaving(true);
    setWaafiError('');

    try {
      const response = await api.put(`/admin/vendors/${selectedVendorId}/waafi-settings`, {
        merchant_uid: waafiForm.merchantUid,
        api_user_id: waafiForm.apiUserId,
        api_key: waafiForm.apiKey,
        enabled: waafiForm.enabled,
      });

      setWaafiForm(normalizeWaafiSettings(response.data));
      setWaafiLoadFailed(false);
      setShowWaafiApiKey(false);
      toast.success('WaafiPay merchant settings updated.');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save WaafiPay settings.';
      setWaafiError(message);
      toast.error(message);
    } finally {
      setWaafiSaving(false);
    }
  };

  // Open Edit Pricing Modal
  const openEditPricing = (plan) => {
    setEditingPlan(plan);
    setValidationError('');
    setEditPriceForm({
      price: String(plan.price || ''),
      status: plan.status || 'active',
      plan_name: plan.plan_name || '',
      module_description: plan.module_description || ''
    });
  };

  const validatePriceInput = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return 'Price is required.';
    }
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      return 'Price must be a valid number.';
    }
    if (num <= 0) {
      return 'Price must be greater than 0.';
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
      return 'Price must be a valid decimal number (up to 2 decimal places) and contain numbers only.';
    }
    return '';
  };

  // Submit Subscription Pricing Change
  const handleSavePricing = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;

    const errorMsg = validatePriceInput(editPriceForm.price);
    if (errorMsg) {
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    const numPrice = Number(editPriceForm.price);

    if (!editPriceForm.plan_name.trim()) {
      toast.error('Plan name is required.');
      return;
    }

    if (numPrice !== Number.parseFloat(editingPlan.price)) {
      if (!window.confirm(`Are you sure you want to change ${editingPlan.plan_name} monthly price from $${Number(editingPlan.price).toFixed(2)} to $${numPrice.toFixed(2)}?\n\nThis price will be applied to future vendor monthly billing.`)) {
        return;
      }
    }

    setUpdatingPricing(true);
    try {
      const response = await api.put(`/admin/subscription-pricing/${editingPlan.id}`, {
        price: numPrice,
        status: editPriceForm.status,
        plan_name: editPriceForm.plan_name.trim(),
        module_description: editPriceForm.module_description.trim()
      });

      const data = response.data?.data || {};
      setPricingPlans(data.plans || []);
      setPricingHistory(data.history || []);
      setEditingPlan(null);
      toast.success('Subscription pricing updated successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update subscription pricing.');
    } finally {
      setUpdatingPricing(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="space-y-10">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider transition-all relative ${
                activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-sm hover:bg-blue-700 transition-all text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? 'Syncing...' : 'Save Settings'}
        </button>
      </div>

      <div className="space-y-8">
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <SettingGroup title="General Configuration" description="Manage your platform's basic identity and support contact details.">
            <SettingItem 
              label="Application Name" 
              description="The name of your platform displayed across vendor portals and customer applications."
              icon={Globe}
            >
              <input 
                type="text" 
                value={settings.app_name} 
                onChange={(e) => updateSetting('app_name', e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-64 transition-colors font-semibold"
              />
            </SettingItem>
            <SettingItem 
              label="Support Email" 
              description="Contact email used for platform inquiries, support, and administrative receipts."
              icon={Mail}
            >
              <input 
                type="email" 
                value={settings.support_email} 
                onChange={(e) => updateSetting('support_email', e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-64 transition-colors font-semibold"
              />
            </SettingItem>
          </SettingGroup>
        )}

        {/* SUBSCRIPTIONS TAB (Replaces old Payments tab) */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-8">
            {/* 1. SUBSCRIPTION PRICING MANAGEMENT SECTION */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-blue-600" size={20} />
                    <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Subscription Pricing</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure fixed monthly vendor subscription fees based on active business modules. Changes take effect on future billing periods.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchSubscriptionPricing}
                  disabled={pricingLoading}
                  className="self-start md:self-auto px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <RefreshCw size={14} className={pricingLoading ? 'animate-spin' : ''} />
                  Refresh Pricing
                </button>
              </div>

              {/* Pricing Cards Grid / Table */}
              <div className="p-6">
                {pricingLoading ? (
                  <div className="py-12 flex items-center justify-center gap-3 text-slate-500 text-xs font-bold">
                    <RefreshCw className="animate-spin" size={18} /> Loading subscription pricing plans...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {pricingPlans.map((plan) => {
                      const IconComponent = getModuleIcon(plan.plan_code);
                      return (
                        <div key={plan.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between hover:shadow-sm transition-all relative">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                <IconComponent size={20} />
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${plan.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                {plan.status === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </div>

                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{plan.plan_name}</h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed min-h-[32px]">{plan.module_description}</p>

                            <div className="my-4 border-t border-slate-200 dark:border-slate-700/60 pt-3">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Monthly Price</span>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">${Number(plan.price).toFixed(2)}</span>
                                <span className="text-[10px] font-bold text-slate-400">/ month</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                              <Toggle 
                                checked={plan.status === 'active'} 
                                onChange={(val) => handleToggleModuleStatus(plan, val ? 'active' : 'inactive')}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                              <span>Updated: {new Date(plan.updated_at).toLocaleDateString()}</span>
                              <button
                                type="button"
                                onClick={() => openEditPricing(plan)}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all inline-flex items-center gap-1 shadow-sm text-[10px]"
                              >
                                <Edit2 size={11} /> Edit Price
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 2. PRICING AUDIT LOG HISTORY */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <History className="text-slate-400" size={18} />
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Pricing Audit History</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-bold tracking-wider border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-3">Plan Name</th>
                      <th className="px-6 py-3">Price Change</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Updated By</th>
                      <th className="px-6 py-3">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {pricingHistory.length > 0 ? (
                      pricingHistory.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-white">{h.plan_name}</td>
                          <td className="px-6 py-3.5">
                            <span className="line-through text-slate-400 mr-2">${Number(h.old_price).toFixed(2)}</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">${Number(h.new_price).toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-3.5 capitalize text-slate-600 dark:text-slate-300">
                            {h.old_status !== h.new_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                          </td>
                          <td className="px-6 py-3.5 text-slate-600 dark:text-slate-400">{h.changed_by_name || 'System Admin'}</td>
                          <td className="px-6 py-3.5 text-slate-400">{h.formatted_date || new Date(h.created_at).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-slate-400">
                          No historical pricing changes recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. WAAFIPAY / HURMOOD MERCHANT CREDENTIALS */}
            <SettingGroup
              title="Hurmood / WaafiPay Merchant Settings"
              description="Manage each vendor's WaafiPay merchant credentials for automated payout and collection gateways."
            >
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div className="w-full max-w-xl">
                  <label
                    htmlFor="waafi-vendor"
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2"
                  >
                    <Store size={15} />
                    Vendor Account
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="waafi-vendor"
                      value={selectedVendorId}
                      onChange={handleVendorSelection}
                      disabled={vendorsLoading || waafiSaving || vendors.length === 0}
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-60 transition-colors cursor-pointer font-medium"
                    >
                      {vendors.length === 0 && (
                        <option value="">{vendorsLoading ? 'Loading vendors...' : 'No vendors available'}</option>
                      )}
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={String(vendor.id)}>
                          {vendor.display_name || vendor.business_name || vendor.name || `Vendor #${vendor.id}`}
                          {vendor.email ? ` — ${vendor.email}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedVendorId && !waafiLoading && !waafiError && (
                  <span
                    className={`inline-flex self-start lg:self-auto items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                      waafiForm.configured
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                    {waafiForm.configured ? 'Configured' : 'Setup incomplete'}
                  </span>
                )}
              </div>

              {selectedVendorId && !waafiLoadFailed && (
                <form onSubmit={handleSaveWaafiSettings} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="waafi-merchant-uid" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Merchant UID
                      </label>
                      <input
                        id="waafi-merchant-uid"
                        type="text"
                        value={waafiForm.merchantUid}
                        onChange={(e) => setWaafiForm((prev) => ({ ...prev, merchantUid: e.target.value }))}
                        placeholder="M100..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors font-medium"
                      />
                    </div>

                    <div>
                      <label htmlFor="waafi-api-user-id" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        API User ID
                      </label>
                      <input
                        id="waafi-api-user-id"
                        type="text"
                        value={waafiForm.apiUserId}
                        onChange={(e) => setWaafiForm((prev) => ({ ...prev, apiUserId: e.target.value }))}
                        placeholder="U100..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={waafiSaving}
                      className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-sm hover:bg-blue-700 transition-all text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      {waafiSaving ? 'Saving Merchant Keys...' : 'Save WaafiPay Settings'}
                    </button>
                  </div>
                </form>
              )}
            </SettingGroup>
          </div>
        )}

        {/* SECURITY TAB */}
        {/* SECURITY TAB */}
        {activeTab === 'security' && (
          <AdminSecuritySection settings={settings} updateSetting={updateSetting} />
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <SettingGroup title="System Alerts & Notifications" description="Choose how and when administrative alerts are dispatched.">
            <SettingItem 
              label="Email Notifications" 
              description="Receive email alerts for new vendor applications, pending subscriptions, and order escalations."
              icon={Bell}
            >
              <Toggle 
                checked={settings.email_notifications === 'true'} 
                onChange={(val) => updateSetting('email_notifications', val ? 'true' : 'false')}
              />
            </SettingItem>
          </SettingGroup>
        )}
      </div>

      {/* MODAL: EDIT SUBSCRIPTION PRICING */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit2 size={18} className="text-blue-600" /> Edit Subscription Pricing
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updating {editingPlan.plan_name} Module
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePricing} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Plan Name <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={editPriceForm.plan_name}
                  onChange={(e) => setEditPriceForm({ ...editPriceForm, plan_name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Module Description / Features
                </label>
                <input
                  type="text"
                  value={editPriceForm.module_description}
                  onChange={(e) => setEditPriceForm({ ...editPriceForm, module_description: e.target.value })}
                  placeholder="e.g. Petrol & Diesel Station Module"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Monthly Subscription Fee ($) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-slate-500 text-sm">$</span>
                  <input
                    required
                    type="text"
                    value={editPriceForm.price}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditPriceForm({ ...editPriceForm, price: val });
                      setValidationError(validatePriceInput(val));
                    }}
                    className={`w-full bg-slate-50 dark:bg-slate-800 border ${validationError ? 'border-rose-500 focus:border-rose-500' : 'border-slate-300 dark:border-slate-700 focus:border-blue-500'} rounded-xl pl-8 pr-4 py-2.5 text-lg font-black text-slate-900 dark:text-white outline-none`}
                  />
                  {validationError && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">{validationError}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Plan Status
                </label>
                <select
                  value={editPriceForm.status}
                  onChange={(e) => setEditPriceForm({ ...editPriceForm, status: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="active">Active (Available for vendor settlements)</option>
                  <option value="inactive">Inactive (Disabled)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingPricing}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingPricing ? <RefreshCw className="animate-spin" size={15} /> : <Save size={15} />}
                  {updatingPricing ? 'Updating...' : 'Save Pricing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
