// Derived from the configured API base URL, never hardcoded: a literal
// localhost here resolves to the user's own machine once the app is on Vercel.
import { SOCKET_URL } from './api';

const API_ORIGIN = SOCKET_URL;

export const VENDOR_PROFILE_EVENT = 'vendor-profile-updated';

export const readStoredVendor = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('vendor_user') || 'null');
    const sanitized = sanitizeVendorProfile(stored);
    if (sanitized && sanitized !== stored) {
      localStorage.setItem('vendor_user', JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return null;
  }
};

export const getVendorDisplayName = (vendor) => {
  return vendor?.business_name || vendor?.name || 'Vendor Admin';
};

export const getVendorInitials = (vendor) => {
  const name = getVendorDisplayName(vendor).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'VA';
};

export const resolveAssetUrl = (value) => {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  return `${API_ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export const getVendorLogoUrl = (vendor) => {
  return resolveAssetUrl(vendor?.logo || vendor?.logo_url);
};

const sanitizeVendorProfile = (vendor) => {
  if (!vendor) return vendor;
  const next = { ...vendor };
  delete next.waafi_api_key;
  return next;
};

export const storeVendorProfile = (vendor) => {
  if (!vendor) return null;
  const previous = readStoredVendor() || {};
  const logo = vendor.logo || vendor.logo_url || previous.logo || previous.logo_url || '';
  const next = sanitizeVendorProfile({
    ...previous,
    ...vendor,
    name: vendor.name || vendor.business_name || previous.name,
    business_name: vendor.business_name || vendor.name || previous.business_name,
    logo,
    logo_url: logo,
  });
  localStorage.setItem('vendor_user', JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(VENDOR_PROFILE_EVENT, { detail: next }));
  return next;
};
