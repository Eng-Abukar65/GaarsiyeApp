import axios from 'axios';
import { getToken, clearSession } from './auth';

/**
 * Development fallback: the backend runs on port 5001 on whatever host is
 * serving the dev server, so a phone on the LAN hitting 192.168.x.x:5173 still
 * finds the API.
 *
 * This is DEV ONLY. Deriving `http://<host>:5001` from a Vercel deployment
 * produces a URL that does not exist, and the browser blocks it as mixed
 * content anyway. A production build without VITE_API_URL is a misconfiguration
 * that must be loud, not silently degraded into requests that time out.
 */
const resolveDefaultApiUrl = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return 'http://localhost:5001/api';
  }
  return 'http://' + window.location.hostname + ':5001/api';
};

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

if (import.meta.env.PROD && !configuredApiUrl) {
  // Thrown at module load so it surfaces immediately in the browser console and
  // in the Vercel build preview, instead of as a wall of failed XHRs later.
  console.error(
    '[config] VITE_API_URL is not set. Add it in Vercel → Project → Settings → ' +
    'Environment Variables as e.g. https://your-backend.up.railway.app/api, then redeploy.'
  );
}

// Centralized, environment-configurable API base URL.
export const API_URL = configuredApiUrl || resolveDefaultApiUrl();
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const getUploadUrl = (urlPath) => {
  if (!urlPath) return '';
  if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) return urlPath;
  return `${SOCKET_URL.replace(/\/+$/, '')}/${urlPath.replace(/^\/+/, '')}`;
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const requestUrl = String(originalRequest?.url || '');

    // Skip auto-redirect for login/register endpoints — let Login.jsx handle auth errors directly.
    // (Heartbeat and other session-management endpoints should still trigger redirect on 401/403.)
    const isLoginEndpoint =
      requestUrl.includes('/staff/login') ||
      requestUrl.includes('/vendor/login') ||
      requestUrl.includes('/forgot-password') ||
      requestUrl.includes('/reset-password') ||
      requestUrl.includes('/admin/login');

    // Unauthorized / forbidden from a protected endpoint → clear session and bounce to login.
    if ((status === 401 || status === 403) && !isLoginEndpoint) {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Retry a failed request once (network blips), but never retry auth failures.
    if (originalRequest && !originalRequest._retry && !status) {
      originalRequest._retry = true;
      try {
        return await api(originalRequest);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
