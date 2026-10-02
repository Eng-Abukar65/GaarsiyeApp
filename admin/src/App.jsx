import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import VendorsPage from './pages/Vendors';
import OperationsPage from './pages/Operations';
import ReportsPage from './pages/Reports';
import LoginPage from './pages/Login';
import SettingsPage from './pages/Settings';
import DriversPage from './pages/Drivers';
import ProductsPage from './pages/Products';
import SubscriptionPayments from './pages/SubscriptionPayments';
import ModuleRequests from './pages/ModuleRequests';
import FinancialTransactions from './pages/FinancialTransactions';

import { Navigate, Outlet } from 'react-router-dom';

import api from './utils/api';
import { ToastProvider, ConfirmProvider, ErrorBoundary } from './components/ui';

const ProtectedRoute = () => {
  const token = localStorage.getItem('admin_token');
  
  React.useEffect(() => {
    if (token) {
      // Send initial heartbeat
      api.patch('/auth/heartbeat').catch(console.error);
      
      // Setup heartbeat interval (every 2 minutes)
      const interval = setInterval(() => {
        api.patch('/auth/heartbeat').catch(console.error);
      }, 120000);
      
      return () => clearInterval(interval);
    }
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

function App() {
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      // Default to light mode unless the user explicitly chose dark.
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <Router>
      <ErrorBoundary>
      <ToastProvider>
      <ConfirmProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="payments" element={<Navigate to="/settlements" replace />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="commissions" element={<Navigate to="/settlements" replace />} />
            <Route path="settlements" element={<SubscriptionPayments />} />
            <Route path="subscriptions" element={<SubscriptionPayments />} />
            <Route path="module-requests" element={<ModuleRequests />} />
            <Route path="financial-transactions" element={<FinancialTransactions />} />
          </Route>
        </Route>
      </Routes>
      </ConfirmProvider>
      </ToastProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
