import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, ClipboardList, History, User } from 'lucide-react';

// ─── Car Services Worker shell ────────────────────────────────────────────────────
// A phone-framed container (centered on desktop, full width on mobile) with a
// simple 4-item bottom navigation, exactly like the reference design. Each
// screen renders its own blue header inside the scroll area.

const NAV = [
  { to: '/worker', end: true, icon: Home, label: 'Home' },
  { to: '/worker/jobs', icon: ClipboardList, label: 'Jobs' },
  { to: '/worker/history', icon: History, label: 'History' },
  { to: '/worker/profile', icon: User, label: 'Profile' },
];

const WorkerLayout = () => (
  <div className="min-h-screen w-full bg-slate-200/50 flex justify-center">
    <div className="relative flex min-h-screen w-full max-w-md flex-col bg-slate-50 shadow-xl">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {/* Bottom navigation — sticks to the bottom of the phone column */}
      <nav className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 active:text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={22} strokeWidth={isActive ? 2.6 : 2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  </div>
);

export default WorkerLayout;
