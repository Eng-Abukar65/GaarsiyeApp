import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import api from '../utils/api';
import {
  getToken,
  getRole,
  getUser,
  setSession as persistSession,
  clearSession,
  isAuthenticated as checkAuthenticated,
} from '../utils/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSessionState] = useState(() => ({
    token: getToken(),
    role: getRole(),
    user: getUser(),
  }));

  const login = useCallback(({ token, role, user, mustChangePassword }) => {
    persistSession({ token, role, user, mustChangePassword });
    setSessionState({ token, role, user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore network/logout errors — we clear locally regardless
    } finally {
      clearSession();
      setSessionState({ token: null, role: '', user: null });
    }
  }, []);

  const value = useMemo(
    () => ({
      ...session,
      isAuthenticated: checkAuthenticated(),
      login,
      logout,
    }),
    [session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
