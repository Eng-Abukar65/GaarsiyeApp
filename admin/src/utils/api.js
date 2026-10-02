import axios from 'axios';

const resolveDefaultApiUrl = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return 'http://localhost:5001/api';
  }

  return 'http://' + window.location.hostname + ':5001/api';
};

// NOTE: this standalone admin app is superseded by the merged app in `vendor/`,
// which serves the admin UI at /admin/*. Deploy `vendor/`, not this. The guard
// below exists so that deploying this one by mistake fails loudly rather than
// firing every request at a host:5001 that does not exist.
const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

if (import.meta.env.PROD && !configuredApiUrl) {
  console.error(
    '[config] VITE_API_URL is not set. A production build cannot derive the API ' +
    'URL from the page host — set it to e.g. https://your-backend.up.railway.app/api.'
  );
}

export const API_URL = configuredApiUrl || resolveDefaultApiUrl();
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const getUploadUrl = (urlPath) => {
  if (!urlPath) return '';
  if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) return urlPath;
  const baseUrl = SOCKET_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5001' : 'http://localhost:5001');
  return `${baseUrl.replace(/\/+$/, '')}/${urlPath.replace(/^\/+/, '')}`;
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error.config?.url || '');
    const isLoginEndpoint =
      requestUrl.includes('/staff/login') ||
      requestUrl.includes('/admin/login') ||
      requestUrl.includes('/forgot-password') ||
      requestUrl.includes('/reset-password');

    if (error.response && (error.response.status === 401 || error.response.status === 403) && !isLoginEndpoint) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
