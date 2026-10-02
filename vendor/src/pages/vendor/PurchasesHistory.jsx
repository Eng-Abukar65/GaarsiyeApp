import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import LogPurchaseModal from '../../components/vendor/LogPurchaseModal';

const PurchasesHistory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLockedProduct, setIsLockedProduct] = useState(false);

  useEffect(() => {
    if (user && user.id) {
      fetchPurchases();
      fetchInitialData();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const isNewPurchase = searchParams.get('newPurchase') === 'true';
    const prodIdParam = searchParams.get('productId');
    if (isNewPurchase || prodIdParam) {
      if (prodIdParam) {
        setSelectedProductId(prodIdParam);
        setIsLockedProduct(true);
      }
      setShowModal(true);
    }
  }, [searchParams]);

  const fetchPurchases = async () => {
    if (!user || !user.id) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/vendor/purchases?vendorId=${user.id}`);
      setPurchases(response.data || []);
    } catch (err) {
      console.error('Failed to fetch purchases', err);
      setError(err.response?.data?.message || 'Failed to load purchases.');
    } finally {
      setLoading(false);
    }
  };

  const fetchInitialData = async () => {
    if (!user || !user.id) return;
    try {
      const [prodRes, suppRes] = await Promise.all([
        api.get(`/vendor/products?vendorId=${user.id}`),
        api.get(`/vendor/suppliers?vendorId=${user.id}`)
      ]);
      setProducts(prodRes.data || []);
      setSuppliers(suppRes.data || []);
    } catch (err) {
      console.error('Failed to fetch initial data', err);
    }
  };

  const totalSpending = purchases.reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0);
  const totalExpectedProfit = purchases.reduce((sum, p) => sum + parseFloat(p.expected_profit || 0), 0);
  const activeSuppliersCount = [...new Set(purchases.map(p => p.supplier_id))].length;

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-10">
      {/* Log Purchase Modal rendered unconditionally to ensure hook count consistency */}
      <LogPurchaseModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedProductId('');
          setIsLockedProduct(false);
          navigate('/vendor/purchases_history', { replace: true });
        }}
        onSuccess={(msg) => {
          setMessage(msg);
          fetchPurchases();
          setTimeout(() => setMessage(''), 5000);
        }}
        initialProductId={selectedProductId}
        lockProduct={isLockedProduct}
        productsList={products}
        suppliersList={suppliers}
      />

      {(!user || !user.id) ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md">
            <div className="text-4xl mb-4">🔐</div>
            <h2 className="text-xl font-bold text-red-700 mb-2">Authentication Required</h2>
            <p className="text-red-600 mb-4">Please log in to view your purchase history.</p>
            <button onClick={() => window.location.href = '/login'} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700">Go to Login</button>
          </div>
        </div>
      ) : (!loading && error) ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-yellow-700 mb-2">Error Loading Purchases</h2>
            <p className="text-yellow-600 mb-4">{error}</p>
            <button onClick={fetchPurchases} className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700">Retry</button>
          </div>
        </div>
      ) : (
        <>
          {/* Page Header Section */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold font-headline tracking-tight text-on-surface">Supplier Purchases</h2>
              <p className="text-on-surface-variant mt-1 font-medium">Track and manage inbound inventory from your supplier network.</p>
              {message && (
                <div className={`mt-4 p-4 rounded-xl text-sm font-bold animate-fade-in ${message.includes('Error') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
                  {message}
                </div>
              )}
            </div>
            <button 
              onClick={() => {
                setSelectedProductId('');
                setIsLockedProduct(false);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-[#2563EB]/15 transition-all active:scale-95 text-sm shrink-0"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Log Purchase
            </button>
          </section>

      {/* KPI Bento Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Spending (MTD)', value: `$${totalSpending.toLocaleString()}`, trend: 'Acquisition Cost', color: 'slate' },
          { label: 'Expected Profit', value: `$${totalExpectedProfit.toLocaleString()}`, trend: 'Projected Earnings', color: 'green' },
          { label: 'Active Suppliers', value: activeSuppliersCount.toString(), trend: 'In Network', color: 'primary' },
          { label: 'Margin Average', value: totalSpending > 0 ? `${((totalExpectedProfit / (totalSpending + totalExpectedProfit)) * 100).toFixed(1)}%` : '0%', trend: 'Efficiency', color: 'primary' }
        ].map((stat, idx) => (
          <div key={idx} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/10 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">{stat.label}</p>
            <h3 className="text-3xl font-extrabold font-headline text-on-surface">{stat.value}</h3>
            <div className={`mt-4 flex items-center gap-1 text-[10px] font-bold ${stat.color === 'green' ? 'text-green-600' : stat.color === 'orange' ? 'text-orange-600' : stat.color === 'slate' ? 'text-slate-500' : 'text-primary'}`}>
              {stat.trend}
            </div>
          </div>
        ))}
      </section>

      {/* Filter & Table Section */}
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-surface-container-low/30 border-b border-outline-variant/10">
          <h3 className="text-lg font-bold font-headline text-on-surface">Procurement History</h3>
          <div className="flex items-center gap-3 text-xs font-bold text-on-surface-variant">
            <span>Showing {purchases.length} total purchases</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/30 border-b border-outline-variant/10">
                <th className="px-8 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ID</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Supplier</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Invoice</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Product</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cost</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Exp. Revenue</th>
                <th className="px-8 py-4 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Exp. Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 text-sm font-medium text-on-surface">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-on-surface-variant font-bold uppercase tracking-widest">Loading Records...</td>
                </tr>
              ) : purchases.length > 0 ? purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-surface-container-low/30 transition-colors">
                  <td className="px-8 py-5 font-bold text-primary text-[10px]">#PUR-{purchase.id}</td>
                  <td className="px-6 py-5 font-semibold">
                    <div>{purchase.supplier_name}</div>
                    {purchase.supplier_email && (
                      <div className="text-[10px] text-on-surface-variant font-bold mt-1">{purchase.supplier_email}</div>
                    )}
                    {purchase.supplier_phone && (
                      <div className="text-[10px] text-on-surface-variant font-bold mt-1">{purchase.supplier_phone}</div>
                    )}
                  </td>
                  <td className="px-6 py-5 font-bold text-primary">{purchase.invoice_number || '-'}</td>
                  <td className="px-6 py-5 text-on-surface-variant">{purchase.product_name}</td>
                  <td className="px-6 py-5 text-on-surface-variant">{new Date(purchase.purchase_date).toLocaleDateString()}</td>
                  <td className="px-6 py-5 font-bold text-slate-500">${parseFloat(purchase.total_amount).toFixed(2)}</td>
                  <td className="px-6 py-5 font-bold text-slate-700">${parseFloat(purchase.expected_revenue || 0).toFixed(2)}</td>
                  <td className="px-8 py-5 text-right font-bold text-green-600">${parseFloat(purchase.expected_profit || 0).toFixed(2)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                    No Purchases Yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Insight Card */}
      <section className="bg-primary p-8 rounded-2xl relative overflow-hidden text-on-primary shadow-md flex flex-col md:flex-row items-center gap-8">
        <div className="flex-1 relative z-10">
          <h4 className="text-2xl font-bold font-headline mb-2">Procurement Optimization</h4>
          <p className="text-on-primary/80 leading-relaxed font-medium">Your current procurement flow is now fully synchronized with your backend database for maximum accuracy and transparency.</p>
          <div className="mt-6 flex gap-4">
            <button 
              onClick={() => navigate('/vendor/inventory_management')}
              className="bg-white text-primary px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors"
            >
              Analyze Stock Levels
            </button>
          </div>
        </div>
        <div className="w-64 h-40 bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm relative z-10 border border-white/10 flex items-center justify-center">
           <span className="material-symbols-outlined text-[100px] opacity-20">analytics</span>
        </div>
      </section>
        </>
      )}
    </div>
  );
};

export default PurchasesHistory;
