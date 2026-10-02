import React, { useCallback, useState, useEffect } from 'react';
import api from '../../utils/api';
import { io } from 'socket.io-client';
import { hasBusinessType, resolveBusinessTypes } from '../../utils/businessType';
import CarWashBookings from './CarWashBookings';
import OrderDetailsModal from '../../components/vendor/OrderDetailsModal';

const OrdersList = () => {
  const [user] = useState(() => JSON.parse(localStorage.getItem('vendor_user') || 'null'));
  const businessTypes = resolveBusinessTypes(null, user);
  const isCarWashVendor = hasBusinessType(businessTypes, 'Car Services') || hasBusinessType(businessTypes, 'Car Wash');
  const isCarWashOnly =
    isCarWashVendor &&
    businessTypes.every((type) => ['car services', 'car wash'].includes(String(type || '').trim().toLowerCase()));
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  // Order Details Modal state (product orders only — never car wash)
  const [detailOrderId, setDetailOrderId] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/vendor/orders?vendorId=${user?.id}`);
      setOrders(response.data || []);
    } catch (err) {
      console.error('Failed to fetch orders', err);
      setError(err.response?.data?.message || 'Failed to load orders list');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await api.get('/vendor/drivers/available');
      const freshDrivers = Array.isArray(response.data?.drivers) ? response.data.drivers : [];
      setDrivers(freshDrivers);
      setSelectedDriverId((currentId) => (
        freshDrivers.some((driver) => String(driver.id) === String(currentId)) ? currentId : ''
      ));
    } catch (err) {
      console.error('Failed to fetch drivers', err);
      setDrivers([]);
      setSelectedDriverId('');
    }
  }, []);

  useEffect(() => {
    if (isCarWashOnly) {
      setLoading(false);
      return;
    }
    if (user && user.id) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [fetchOrders, isCarWashOnly, user]);

  useEffect(() => {
    if (!showAssignModal) return undefined;
    fetchDrivers();
    const timer = window.setInterval(fetchDrivers, 15000);
    return () => window.clearInterval(timer);
  }, [fetchDrivers, showAssignModal]);

  useEffect(() => {
    if (isCarWashOnly) return undefined;
    if (!user?.id) return undefined;
    const token = localStorage.getItem('vendor_token');
    const socketUrl = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
    const socket = io(socketUrl, { auth: { token }, transports: ['websocket'], reconnection: true });
    const refreshAssignment = (payload) => {
      setMessage(payload?.message || 'A new order assignment requires your response.');
      fetchOrders();
    };
    socket.on('order-assignment-created', refreshAssignment);
    socket.on('order-assignment-overdue', refreshAssignment);
    return () => socket.disconnect();
  }, [fetchOrders, isCarWashOnly, user?.id]);

  const handleAcceptOrder = async (orderId) => {
    try {
      const response = await api.patch(`/vendor/orders/${orderId}/accept?vendorId=${user.id}`);
      if (response.data.success) {
        setMessage('✅ Order accepted successfully!');
        fetchOrders();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Accept order error', err);
      const errorMsg = err.response?.data?.message || 'Failed to accept order.';
      setMessage(`❌ ${errorMsg}`);
    }
  };

  const handleAssignDriver = async () => {
    if (!selectedDriverId) {
      setMessage('⚠️ Please select a driver.');
      return;
    }
    try {
      const response = await api.post(`/vendor/orders/${selectedOrderId}/assign-driver`, { driverId: selectedDriverId });
      if (response.data.success || response.status === 200) {
        setMessage('✅ Driver assigned and delivery created!');
        setShowAssignModal(false);
        fetchOrders();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Assign driver error', err);
      setMessage(`❌ ${err.response?.data?.message || 'Failed to assign driver.'}`);
      setSelectedDriverId('');
      fetchDrivers();
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-orange-100 text-orange-600';
      case 'pending_driver_assignment': return 'bg-amber-100 text-amber-700';
      case 'confirmed': return 'bg-amber-100 text-amber-700';
      case 'accepted': return 'bg-blue-100 text-blue-600';
      case 'driver assigned': return 'bg-purple-100 text-purple-600';
      case 'on the way': return 'bg-sky-100 text-sky-600';
      case 'delivered': return 'bg-green-100 text-green-600';
      case 'cancelled': return 'bg-red-100 text-red-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (!user || !user.id) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
        <p className="text-on-surface-variant font-medium mb-6">
          No authenticated vendor session was found. Please sign in to access this page.
        </p>
        <button
          onClick={() => window.location.href = '/login'}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // Car Wash-only vendors must always use the dedicated booking state machine.
  // Mixed-business vendors retain the generic Orders page and get Wash Bookings
  // as a separate sidebar destination.
  if (isCarWashOnly) return <CarWashBookings />;

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg animate-fade-in">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Error Loading Orders</h2>
        <p className="text-on-surface-variant font-medium mb-6">{error}</p>
        <button
          onClick={() => fetchOrders()}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8">
      {/* Page Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold font-headline text-on-surface tracking-tight">
            {isCarWashVendor ? 'Booking Management' : 'Order Management'}
          </h2>
          <p className="text-on-surface-variant font-medium">
            {isCarWashVendor
              ? 'Real-time overview of car services bookings, progress, and completion status.'
              : "Real-time overview of your store's customer transactions."}
          </p>
          {message && (
            <div className={`mt-4 p-4 rounded-xl text-sm font-bold animate-fade-in ${message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high text-on-surface font-bold rounded-xl hover:bg-surface-container-highest transition-colors shadow-sm border border-outline-variant/10"
          >
            <span className="material-symbols-outlined text-lg">file_download</span>
            Export
          </button>
        </div>
      </section>

      {/* Dashboard Stats */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: isCarWashVendor ? 'Pending Bookings' : 'Pending', value: orders.filter(o => o.status === 'pending').length, color: 'orange' },
          { label: isCarWashVendor ? 'Confirmed' : 'Accepted', value: orders.filter(o => o.status === 'accepted' || o.status === 'pending_driver_assignment' || o.status === 'confirmed').length, color: 'blue' },
          { label: isCarWashVendor ? 'Assigned Crew' : 'Assigned', value: orders.filter(o => o.status === 'driver assigned').length, color: 'purple' },
          { label: isCarWashVendor ? 'In Progress' : 'In Transit', value: orders.filter(o => o.status === 'on the way').length, color: 'sky' }
        ].map((stat, idx) => (
          <div key={idx} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/10 shadow-sm">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">{stat.label}</p>
            <h3 className="text-3xl font-bold text-on-surface font-headline">{stat.value}</h3>
          </div>
        ))}
      </section>

      {/* Table Container */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/30 border-b border-outline-variant/10">
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {isCarWashVendor ? 'Booking ID' : 'Order ID'}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {isCarWashVendor ? 'Amount' : 'Total'}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Assigned / Response</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm">
              {orders.length > 0 ? orders.map((order) => (
                <tr key={order.id} className="group hover:bg-surface-container-low/30 transition-colors">
                  <td className="px-8 py-5 font-bold text-primary font-headline tracking-wide">#ORD-{(order.id).toString().padStart(4, '0')}</td>
                  <td className="px-6 py-5">
                    <span className="font-bold text-on-surface">{order.customer_name ?? 'Guest'}</span>
                  </td>
                  <td className="px-6 py-5 font-bold text-on-surface">${order.total_amount}</td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full ${getStatusColor(order.status)} text-[10px] font-bold uppercase tracking-wider border border-outline-variant/10`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-xs text-on-surface-variant">
                    <div>Assigned: {order.vendor_assigned_at ? new Date(order.vendor_assigned_at).toLocaleString() : 'N/A'}</div>
                    <div>Response: {order.vendor_responded_at ? new Date(order.vendor_responded_at).toLocaleString() : 'Waiting'}</div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      {(order.status === 'pending' || order.status === 'pending_payment') && (
                        <button 
                          onClick={() => handleAcceptOrder(order.id)}
                          className="px-4 py-2 bg-primary text-on-primary rounded-xl text-[10px] font-bold hover:bg-primary-dim transition-all shadow-md"
                        >
                          {isCarWashVendor ? 'Confirm' : 'Accept'}
                        </button>
                      )}
                      {['accepted', 'pending_driver_assignment', 'confirmed'].includes((order.status || '').toLowerCase()) && (
                        <button 
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setShowAssignModal(true);
                          }}
                          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-bold hover:bg-purple-700 transition-all shadow-md"
                        >
                          {isCarWashVendor ? 'Assign Crew' : 'Assign Driver'}
                        </button>
                      )}
                      {order.status === 'driver assigned' && (
                        <span className="text-[10px] font-bold text-on-surface-variant italic">Waiting for Driver...</span>
                      )}
                      <button 
                        onClick={() => {
                          if (order && order.id) {
                            setDetailOrderId(order.id);
                            setIsDetailsModalOpen(true);
                          }
                        }}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                        title="View order details"
                      >
                        <span className="material-symbols-outlined text-xl">visibility</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-50">
                    {loading ? 'Loading Orders...' : 'No Data Available'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Assign Driver Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="px-8 py-6 bg-purple-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-headline font-bold">Assign Driver</h3>
              <button onClick={() => setShowAssignModal(false)} className="material-symbols-outlined hover:bg-white/20 p-2 rounded-full transition-colors">close</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Available Drivers</label>
                <select 
                  value={selectedDriverId} 
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  disabled={drivers.length === 0}
                  className="w-full bg-surface-container-high px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-purple-600 outline-none"
                >
                  <option value="">{drivers.length === 0 ? 'No online drivers available' : 'Select a driver...'}</option>
                  {drivers.map(driver => (
                    <option key={driver.id} value={driver.id}>{driver.first_name} {driver.last_name} ({driver.vehicle_type})</option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <p className="text-xs font-semibold text-amber-700">
                    No online drivers are currently available.
                  </p>
                )}
              </div>
              <div className="pt-4">
                <button 
                  onClick={handleAssignDriver}
                  disabled={drivers.length === 0 || !selectedDriverId}
                  className="w-full bg-purple-600 disabled:bg-purple-300 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg"
                >
                  Confirm Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Details Modal (product orders only) ── */}
      <OrderDetailsModal
        isOpen={isDetailsModalOpen}
        orderId={detailOrderId}
        onClose={() => setIsDetailsModalOpen(false)}
        onRefreshList={fetchOrders}
      />
    </div>
  );
};

export default OrdersList;
