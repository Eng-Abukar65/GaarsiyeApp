import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { readStoredVendor, storeVendorProfile, VENDOR_PROFILE_EVENT } from '../utils/vendorIdentity';

export const useVendorProfile = ({ fetchOnMount = true } = {}) => {
  const [vendor, setVendor] = useState(() => readStoredVendor());
  const [loading, setLoading] = useState(Boolean(fetchOnMount));

  const refreshVendor = useCallback(async () => {
    const stored = readStoredVendor();
    if (!stored?.id && !localStorage.getItem('vendor_token')) {
      setLoading(false);
      return null;
    }

    try {
      const response = await api.get('/vendor/profile');
      const fresh = response.data?.vendor;
      if (fresh) {
        const next = storeVendorProfile(fresh);
        setVendor(next);
        return next;
      }
    } catch (error) {
      console.error('Failed to refresh vendor profile', error);
    } finally {
      setLoading(false);
    }

    return stored;
  }, []);

  useEffect(() => {
    const syncFromStorage = (event) => {
      if (event?.detail) {
        setVendor(event.detail);
      } else {
        setVendor(readStoredVendor());
      }
    };

    window.addEventListener(VENDOR_PROFILE_EVENT, syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(VENDOR_PROFILE_EVENT, syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  useEffect(() => {
    if (fetchOnMount) refreshVendor();
    else setLoading(false);
  }, [fetchOnMount, refreshVendor]);

  return { vendor, setVendor, loading, refreshVendor };
};
