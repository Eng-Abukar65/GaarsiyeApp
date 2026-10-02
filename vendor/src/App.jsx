import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext';
import { ToastProvider, ConfirmProvider, ErrorBoundary } from './components/admin/ui';
import ProtectedRoute from './routes/ProtectedRoute';
import { isAuthenticated, getRole, roleHome } from './utils/auth';

// ── Auth / public ──
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import NotFound from './pages/NotFound';
import AccessDenied from './pages/AccessDenied';

// ── Admin shell + pages ──
import AdminLayout from './components/admin/Layout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminVendors from './pages/admin/Vendors';
import AdminDrivers from './pages/admin/Drivers';
import AdminProducts from './pages/admin/Products';
import AdminOperations from './pages/admin/Operations';
import AdminReports from './pages/admin/Reports';
import AdminSettings from './pages/admin/Settings';
import AdminSettlements from './pages/admin/Settlements';
import AdminModuleRequests from './pages/admin/ModuleRequests';

// ── Vendor shell + pages ──
import VendorLayout from './components/vendor/Layout';
import VendorDashboard from './pages/vendor/DashboardOverview';
import VendorProducts from './pages/vendor/ProductsManagement';
import VendorPurchases from './pages/vendor/PurchasesHistory';
import VendorInventory from './pages/vendor/InventoryManagement';
import VendorOrders from './pages/vendor/OrdersList';
import VendorDeliveries from './pages/vendor/DeliveryTracking';
import VendorDrivers from './pages/vendor/DriversFleetManagement';
import VendorSuppliers from './pages/vendor/SuppliersDirectory';
import VendorReports from './pages/vendor/ReportGenerator';
import VendorAnalytics from './pages/vendor/ReportsAnalytics';
import VendorReviews from './pages/vendor/CustomerReviews';
import VendorZones from './pages/vendor/DeliveryZones';
import VendorOffers from './pages/vendor/OffersPromotions';
import VendorSettings from './pages/vendor/Settings';
import VendorSettlements from './pages/vendor/Settlements';
import VendorCarWashBookings from './pages/vendor/CarWashBookings';
import VendorCarWashServices from './pages/vendor/CarWashServices';
import OrderDetail from './pages/vendor/OrderDetail';
import CarWashBookingDetail from './pages/vendor/CarWashBookingDetail';
// CarWashWorkers is now embedded inside DriversFleetManagement (Personnel Management page)

// ── Car Wash Worker shell + pages ──
import WorkerLayout from './components/worker/WorkerLayout';
import WorkerHome from './pages/worker/WorkerHome';
import WorkerJobs from './pages/worker/WorkerJobs';
import WorkerJobDetail from './pages/worker/WorkerJobDetail';
import WorkerHistory from './pages/worker/WorkerHistory';
import WorkerProfile from './pages/worker/WorkerProfile';
import WorkerNotifications from './pages/worker/WorkerNotifications';
import WorkerChangePassword from './pages/worker/WorkerChangePassword';

// Sends "/" to the right place based on the current session.
const RootRedirect = () => (
  <Navigate to={isAuthenticated() ? roleHome(getRole()) : '/login'} replace />
);

function App() {
  React.useEffect(() => {
    // Theme preference (admin pages support dark mode).
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <Router>
      <AuthProvider>
        <ErrorBoundary>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />
                <Route path="/vendor/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/vendor/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/vendor/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/vendor/reset-password" element={<ResetPassword />} />
                <Route path="/access-denied" element={<AccessDenied />} />

                {/* Admin area — admin role only */}
                <Route element={<ProtectedRoute role="admin" />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="vendors" element={<AdminVendors />} />
                    <Route path="drivers" element={<AdminDrivers />} />
                    <Route path="products" element={<AdminProducts />} />
                    <Route path="categories" element={<Navigate to="/admin/products" replace />} />
                    <Route path="operations" element={<AdminOperations />} />
                    <Route path="payments" element={<Navigate to="/admin/settlements" replace />} />
                    <Route path="reports" element={<AdminReports />} />
                    <Route path="commissions" element={<Navigate to="/admin/settlements" replace />} />
                    <Route path="settlements" element={<AdminSettlements />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="module-requests" element={<AdminModuleRequests />} />
                  </Route>
                </Route>

                {/* Vendor area — vendor role only */}
                <Route element={<ProtectedRoute role="vendor" />}>
                  <Route path="/vendor" element={<VendorLayout />}>
                    <Route index element={<VendorDashboard />} />
                    <Route path="products_management" element={<VendorProducts />} />
                    <Route path="products" element={<Navigate to="/vendor/products_management" replace />} />
                    <Route path="purchases_history" element={<VendorPurchases />} />
                    <Route path="purchases" element={<Navigate to="/vendor/purchases_history" replace />} />
                    <Route path="inventory_management" element={<VendorInventory />} />
                    <Route path="inventory" element={<Navigate to="/vendor/inventory_management" replace />} />
                    <Route path="orders_list" element={<VendorOrders />} />
                    <Route path="orders" element={<Navigate to="/vendor/orders_list" replace />} />
                    <Route path="orders/:orderId" element={<OrderDetail />} />
                    <Route path="delivery_tracking" element={<VendorDeliveries />} />
                    <Route path="deliveries" element={<Navigate to="/vendor/delivery_tracking" replace />} />
                    <Route path="delivery_tracking/:orderId" element={<OrderDetail />} />
                    <Route path="drivers_fleet_management" element={<VendorDrivers />} />
                    <Route path="drivers" element={<Navigate to="/vendor/drivers_fleet_management" replace />} />
                    <Route path="suppliers_directory" element={<VendorSuppliers />} />
                    <Route path="suppliers" element={<Navigate to="/vendor/suppliers_directory" replace />} />
                    <Route path="reports_analytics" element={<VendorReports />} />
                    <Route path="reports" element={<Navigate to="/vendor/reports_analytics" replace />} />
                    <Route path="analytics" element={<VendorAnalytics />} />
                    <Route path="customer_reviews" element={<VendorReviews />} />
                    <Route path="reviews" element={<Navigate to="/vendor/customer_reviews" replace />} />
                    <Route path="delivery_zones" element={<VendorZones />} />
                    <Route path="zones" element={<Navigate to="/vendor/delivery_zones" replace />} />
                    <Route path="offers_promotions" element={<VendorOffers />} />
                    <Route path="offers" element={<Navigate to="/vendor/offers_promotions" replace />} />
                    <Route path="settings" element={<VendorSettings />} />
                    <Route path="settlements" element={<VendorSettlements />} />
                    <Route path="car_wash_services" element={<VendorCarWashServices />} />
                    <Route path="car-wash-services" element={<Navigate to="/vendor/car_wash_services" replace />} />
                    <Route path="car_wash_workers" element={<Navigate to="/vendor/drivers_fleet_management" replace />} />
                    <Route path="car_wash_bookings" element={<VendorCarWashBookings />} />
                    <Route path="car-wash-bookings" element={<Navigate to="/vendor/car_wash_bookings" replace />} />
                    <Route path="car_wash_bookings/:bookingId" element={<CarWashBookingDetail />} />
                  </Route>
                </Route>

                {/* Car Wash Worker area — car_wash_worker role only */}
                <Route element={<ProtectedRoute role="car_wash_worker" />}>
                  <Route path="/worker" element={<WorkerLayout />}>
                    <Route index element={<WorkerHome />} />
                    <Route path="jobs" element={<WorkerJobs />} />
                    <Route path="jobs/:id" element={<WorkerJobDetail />} />
                    <Route path="history" element={<WorkerHistory />} />
                    <Route path="profile" element={<WorkerProfile />} />
                    <Route path="notifications" element={<WorkerNotifications />} />
                    <Route path="change-password" element={<WorkerChangePassword />} />
                  </Route>
                </Route>
                {/* Alias so /car-wash-worker also lands on the worker app */}
                <Route path="/car-wash-worker" element={<Navigate to="/worker" replace />} />

                {/* Root + fallback */}
                <Route path="/" element={<RootRedirect />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );
}

export default App;
