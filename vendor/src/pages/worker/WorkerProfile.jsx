import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Store, Phone, Mail, User as UserIcon, ShieldCheck, CalendarDays, Lock, LogOut, Star,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Loader, ErrorState, InfoRow } from '../../components/worker/workerUi';
import { parseSkills, fmtDate } from './workerStatus';

const WorkerProfile = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s] = await Promise.all([
        api.get('/worker/profile'),
        api.get('/worker/stats').catch(() => ({ data: { data: null } })),
      ]);
      setProfile(p.data?.data || null);
      setStats(s.data?.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) return <div className="min-h-screen bg-slate-50"><Loader label="Loading profile…" /></div>;
  if (!profile) return <ErrorState message={error} onRetry={load} />;

  const name = profile.name ||
    `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Worker';
  const isAvailable = profile.availability_status === 'available';
  const isActive = profile.worker_status === 'active';
  const skills = parseSkills(profile.skills);
  const completed = Number(profile.completed_jobs_count || stats?.completed || 0);
  const rating = Number(profile.rating || 0);

  // Completion rate derived from real numbers: finished vs. all jobs ever handled.
  const openNow = Number(stats?.pending || 0) + Number(stats?.active || 0);
  const totalHandled = completed + openNow;
  const completionRate = totalHandled > 0 ? Math.round((completed / totalHandled) * 100) : null;

  return (
    <div>
      {/* Blue header with avatar */}
      <div className="rounded-b-[28px] bg-gradient-to-b from-blue-600 to-blue-500 px-5 pt-5 pb-14 text-white shadow-lg shadow-blue-600/20">
        <h1 className="text-center text-lg font-bold">Profile</h1>
        <div className="mt-4 flex flex-col items-center">
          <Avatar name={name} src={profile.profile_image} size={84} ring />
          <p className="mt-3 text-[18px] font-bold">{name}</p>
          <p className="text-[13px] text-white/85">Car Services Worker</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
            <span className={`h-2 w-2 rounded-full ${isAvailable ? 'bg-green-400' : 'bg-slate-300'}`} />
            {isAvailable ? 'Available' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="-mt-8 space-y-3 px-5 pb-8">
        {/* Details card */}
        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
          <InfoRow icon={Store} label="Vendor" value={profile.vendor_business_name || profile.vendor_name} />
          <div className="h-px bg-slate-100" />
          <InfoRow icon={Phone} label="Phone" value={profile.phone} />
          <div className="h-px bg-slate-100" />
          <InfoRow icon={Mail} label="Email" value={profile.email} />
          <div className="h-px bg-slate-100" />
          <InfoRow icon={UserIcon} label="Username" value={profile.username} />
          <div className="h-px bg-slate-100" />
          <InfoRow
            icon={ShieldCheck}
            label="Account Status"
            value={isActive ? 'Active' : 'Inactive'}
            valueClass={isActive ? 'text-green-600' : 'text-rose-600'}
          />
          {profile.last_login ? (
            <>
              <div className="h-px bg-slate-100" />
              <InfoRow icon={CalendarDays} label="Last Login" value={fmtDate(profile.last_login)} />
            </>
          ) : null}
        </div>

        {/* Skills */}
        {skills.length > 0 ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
            <p className="mb-2.5 text-[13px] font-bold text-slate-900">My Skills</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s, i) => (
                <span key={i} className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12.5px] font-semibold text-blue-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Metrics (all real) */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm shadow-slate-200/70">
            <p className="text-[20px] font-extrabold text-blue-600">{completed}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Completed</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm shadow-slate-200/70">
            <p className="flex items-center justify-center gap-1 text-[20px] font-extrabold text-amber-500">
              {rating.toFixed(1)} <Star size={15} className="fill-amber-400 text-amber-400" />
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Rating</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm shadow-slate-200/70">
            <p className="text-[20px] font-extrabold text-green-600">
              {completionRate == null ? '—' : `${completionRate}%`}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Completion</p>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-2xl bg-white shadow-sm shadow-slate-200/70">
          <button
            onClick={() => navigate('/worker/change-password')}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
              <Lock size={17} />
            </span>
            <span className="flex-1 text-[14px] font-semibold text-slate-800">Change Password</span>
          </button>
          <div className="h-px bg-slate-100" />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-rose-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <LogOut size={17} />
            </span>
            <span className="flex-1 text-[14px] font-semibold text-rose-600">Logout</span>
          </button>
        </div>
      </div>

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner">
              <LogOut size={26} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-slate-900">Confirm Logout</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Are you sure you want to log out?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-500/25 transition-all"
              >
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default WorkerProfile;
