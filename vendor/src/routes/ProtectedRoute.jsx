import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { isAuthenticated, getRole, roleHome } from '../utils/auth';

// Requires a valid session. Optionally enforces a specific role.
// - Not authenticated            → /login (remembers where they wanted to go)
// - Authenticated, wrong role    → redirected to their own dashboard
const ProtectedRoute = ({ role }) => {
  const location = useLocation();
  const authed = isAuthenticated();
  const currentRole = getRole();

  React.useEffect(() => {
    if (!authed) return undefined;
    // Keep the session alive with periodic heartbeats (both portals used this).
    api.patch('/auth/heartbeat').catch(() => {});
    const interval = setInterval(() => {
      api.patch('/auth/heartbeat').catch(() => {});
    }, 120000);
    return () => clearInterval(interval);
  }, [authed]);

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && currentRole !== role) {
    // A logged-in user hitting another role's area is sent to their own dashboard.
    return <Navigate to={roleHome(currentRole)} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
