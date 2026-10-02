import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import api from '../../utils/api';
import { TopBar } from '../../components/worker/workerUi';

const Field = ({ label, value, onChange }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-slate-500">{label}</label>
      <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500">
        <Lock size={16} className="text-slate-400" />
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={onChange}
          className="w-full bg-transparent px-3 py-3 text-[14px] font-medium text-slate-800 focus:outline-none"
          placeholder="••••••••"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-slate-400" aria-label="Toggle">
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
};

const WorkerChangePassword = () => {
  const navigate = useNavigate();
  const mustChange = localStorage.getItem('worker_must_change_password') === 'true';

  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.new_password.length < 6) return setError('New password must be at least 6 characters.');
    if (form.new_password !== form.confirm_password) return setError('The new passwords do not match.');

    setSaving(true);
    try {
      await api.put('/worker/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      localStorage.removeItem('worker_must_change_password');
      setDone(true);
      setTimeout(() => navigate('/worker/profile', { replace: true }), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <TopBar title="Change Password" onBack={() => navigate('/worker/profile')} />
      <div className="px-5 pt-5">
        {mustChange && !done ? (
          <div className="mb-4 flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            You are using a temporary password. Please set a new one to continue.
          </div>
        ) : null}

        {done ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-green-50 px-4 py-10 text-center">
            <CheckCircle2 size={40} className="text-green-500" />
            <p className="text-[15px] font-bold text-green-700">Password updated</p>
            <p className="text-[13px] text-green-600/80">Taking you back to your profile…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm shadow-slate-200/70">
            {error ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-600">{error}</p>
            ) : null}
            <Field label="Current password" value={form.current_password} onChange={set('current_password')} />
            <Field label="New password" value={form.new_password} onChange={set('new_password')} />
            <Field label="Confirm new password" value={form.confirm_password} onChange={set('confirm_password')} />
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-[15px] font-bold text-white active:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default WorkerChangePassword;
