// ─── Unified auth storage ─────────────────────────────────────────────────────
// Single source of truth for the logged-in staff session (admin OR vendor).
// We persist canonical `auth_*` keys AND mirror the role-specific legacy keys
// (`vendor_token`/`vendor_user`, `admin_token`/`admin_user`) so pre-existing
// admin/vendor page code that still reads the legacy keys keeps working unchanged.

export const AUTH_TOKEN_KEY = 'auth_token';
export const AUTH_ROLE_KEY = 'auth_role';
export const AUTH_USER_KEY = 'auth_user';

const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
};

export const normalizeRole = (value) => {
  const role = String(value || '').trim().toLowerCase();
  return role === 'admin' || role === 'vendor' || role === 'car_wash_worker' ? role : '';
};

export const getToken = () =>
  localStorage.getItem(AUTH_TOKEN_KEY) ||
  localStorage.getItem('vendor_token') ||
  localStorage.getItem('admin_token') ||
  null;

export const getRole = () => normalizeRole(localStorage.getItem(AUTH_ROLE_KEY));

export const getUser = () => safeParse(localStorage.getItem(AUTH_USER_KEY));

export const isAuthenticated = () => Boolean(getToken()) && Boolean(getRole());

// Where a role's landing dashboard lives.
export const roleHome = (role) => {
  const r = normalizeRole(role);
  if (r === 'admin') return '/admin';
  if (r === 'vendor') return '/vendor';
  if (r === 'car_wash_worker') return '/worker';
  return '/login';
};

export const setSession = ({ token, role, user, mustChangePassword = false }) => {
  const normalizedRole = normalizeRole(role);
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_ROLE_KEY, normalizedRole);
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }

  // Mirror legacy keys so existing page code keeps working.
  if (normalizedRole === 'vendor') {
    localStorage.setItem('vendor_token', token);
    if (user) localStorage.setItem('vendor_user', JSON.stringify(user));
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    if (mustChangePassword) {
      localStorage.setItem('vendor_must_change_password', 'true');
    } else {
      localStorage.removeItem('vendor_must_change_password');
    }
  } else if (normalizedRole === 'admin') {
    localStorage.setItem('admin_token', token);
    if (user) localStorage.setItem('admin_user', JSON.stringify(user));
    localStorage.removeItem('vendor_token');
    localStorage.removeItem('vendor_user');
    localStorage.removeItem('vendor_must_change_password');
  } else if (normalizedRole === 'car_wash_worker') {
    // Workers use the canonical auth_* keys plus a worker_user mirror; clear any
    // stale admin/vendor session so cross-role state can't leak.
    if (user) localStorage.setItem('worker_user', JSON.stringify(user));
    if (mustChangePassword) {
      localStorage.setItem('worker_must_change_password', 'true');
    } else {
      localStorage.removeItem('worker_must_change_password');
    }
    ['vendor_token', 'vendor_user', 'vendor_must_change_password', 'admin_token', 'admin_user']
      .forEach((key) => localStorage.removeItem(key));
  }
};

export const clearSession = () => {
  [
    AUTH_TOKEN_KEY,
    AUTH_ROLE_KEY,
    AUTH_USER_KEY,
    'vendor_token',
    'vendor_user',
    'vendor_must_change_password',
    'vendor_settings_tab',
    'admin_token',
    'admin_user',
    'worker_user',
    'worker_must_change_password',
  ].forEach((key) => localStorage.removeItem(key));
};
