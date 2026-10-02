import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { stockPercent } from '../../utils/progress';
import { useNavigate } from 'react-router-dom';
import LogPurchaseModal from '../../components/vendor/LogPurchaseModal';
import {
  BadgePercent,
  Megaphone,
  Package,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
} from 'lucide-react';

/* ─── helpers ──────────────────────────────────────────────────────────── */
const getOfferBadge = (item) => {
  if (!item.offer_id || item.offer_status === 'none' || item.offer_status === 'Expired') return null;
  const pct = Number(item.discount_percent || 0);
  if (pct > 0) return { label: `${pct}% OFF`, color: 'red' };
  const title = (item.offer_title || '').toLowerCase();
  if (title.includes('buy') && title.includes('get')) return { label: 'Buy 1 Get 1', color: 'orange' };
  if (title.includes('free') && title.includes('deliver')) return { label: 'Free Delivery', color: 'blue' };
  return { label: item.offer_title || 'Special Offer', color: 'green' };
};

const badgeClasses = {
  red:    'bg-red-100 text-red-700 border border-red-200',
  orange: 'bg-orange-100 text-orange-700 border border-orange-200',
  blue:   'bg-blue-100 text-blue-700 border border-blue-200',
  green:  'bg-green-100 text-green-700 border border-green-200',
};

const statCards = [
  { label: 'Total Products', key: 'totalProducts', Icon: Package, iconClass: 'text-primary', bg: 'bg-primary/10' },
  { label: 'Active Offers', key: 'activeOffers', Icon: Tag, iconClass: 'text-rose-600', bg: 'bg-rose-100' },
  { label: 'On Promotion', key: 'withOffers', Icon: Megaphone, iconClass: 'text-orange-600', bg: 'bg-orange-100' },
  { label: 'Avg Discount', key: 'avgDiscount', Icon: BadgePercent, iconClass: 'text-green-600', bg: 'bg-green-100' },
];

const stockTone = {
  primary: 'bg-primary-container/50 text-primary',
  tertiary: 'bg-orange-100 text-orange-600',
  error: 'bg-red-100 text-red-600',
};

const stockBarTone = {
  primary: 'bg-primary',
  tertiary: 'bg-orange-500',
  error: 'bg-red-500',
};

function Countdown({ endDate }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const calc = () => {
      const diff = new Date(endDate) - Date.now();
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 48) {
        const d = Math.floor(h / 24);
        setLabel(`${d}d ${h % 24}h left`);
      } else {
        setLabel(`${h}h ${m}m ${s}s`);
      }
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endDate]);
  return <span className="text-[10px] font-bold text-orange-600 tabular-nums">{label}</span>;
}

/* ─── offer modal ──────────────────────────────────────────────────────── */

/* ─── main component ───────────────────────────────────────────────────── */
const InventoryManagement = () => {
  const navigate = useNavigate();
  const [inventory, setInventory]       = useState([]);
  const [lpgMonitoring, setLpgMonitoring] = useState({ tanks: [], orders: [] });
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [message, setMessage]           = useState({ text: '', type: '' });
  const [suppliers, setSuppliers]       = useState([]);
  const [filter, setFilter]             = useState('all');   // all | with_offers | without_offers
  const [showLogPurchaseModal, setShowLogPurchaseModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [deletingOfferId, setDeletingOfferId] = useState(null);

  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');

  const flash = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const fetchInventory = useCallback(async () => {
    if (!user || !user.id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/vendor/inventory?vendorId=${user.id}`);
      setInventory(res.data || []);
      const monitoringRes = await api.get(`/vendor/lpg-monitoring?vendorId=${user.id}`);
      setLpgMonitoring(monitoringRes.data || { tanks: [], orders: [] });
    } catch (err) {
      console.error('Failed to fetch inventory', err);
      setError(err.response?.data?.message || 'Failed to fetch inventory records');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchSuppliers = useCallback(async () => {
    if (!user || !user.id) return;
    try {
      const res = await api.get(`/vendor/suppliers?vendorId=${user.id}`);
      if (res.data) {
        setSuppliers(res.data);
        if (res.data.length > 0) setSelectedSupplierId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && user.id) {
      fetchInventory();
      fetchSuppliers();
    } else {
      setLoading(false);
    }
  }, [fetchInventory, fetchSuppliers]);

  /* derived stats */
  const activeOffers   = inventory.filter(i => i.offer_status === 'Active').length;
  const avgDiscount    = activeOffers > 0
    ? (inventory.filter(i => i.offer_status === 'Active').reduce((s, i) => s + Number(i.discount_percent || 0), 0) / activeOffers).toFixed(1)
    : 0;
  const withOffers     = inventory.filter(i => i.offer_id && i.offer_status !== 'none' && i.offer_status !== 'Expired').length;

  /* filtered list */
  const filteredInventory = inventory.filter(item => {
    if (filter === 'with_offers')    return item.offer_id && item.offer_status === 'Active';
    if (filter === 'without_offers') return !item.offer_id || item.offer_status === 'none' || item.offer_status === 'Expired';
    return true;
  });

  /* restock */
  const handleRestock = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !selectedSupplierId) { flash('Please select a supplier', 'error'); return; }
    try {
      const res = await api.post('/vendor/purchase', {
        product_id: selectedProduct.id,
        quantity: purchaseQty,
        supplier_id: selectedSupplierId,
        vendor_id: user?.id,
      });
      if (res.data.success) { flash('Stock purchased successfully!'); setShowBuyModal(false); fetchInventory(); }
      else flash(res.data.message || 'Failed to purchase stock', 'error');
    } catch (err) {
      flash(err.response?.data?.message || 'Network error, please try again.', 'error');
    }
  };

  /* delete offer */
  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm('Remove this offer?')) return;
    setDeletingOfferId(offerId);
    try {
      await api.delete(`/vendor/offers/${offerId}`);
      flash('Offer removed successfully!');
      fetchInventory();
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to delete offer', 'error');
    } finally {
      setDeletingOfferId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-8">
      {/* ── Shared Log Purchase Modal ── */}
      <LogPurchaseModal
        isOpen={showLogPurchaseModal}
        onClose={() => setShowLogPurchaseModal(false)}
        onSuccess={(msg) => {
          flash(msg || 'Purchase logged and stock updated successfully.');
          fetchInventory();
        }}
        initialProductId={selectedProduct?.id}
        lockProduct={true}
        productsList={inventory}
        suppliersList={suppliers}
      />

      {(!user || !user.id) ? (
        <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
          <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
          <p className="text-on-surface-variant font-medium mb-6">
            No authenticated vendor session was found. Please sign in to access this page.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            Go to Login
          </button>
        </div>
      ) : error ? (
        <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg animate-fade-in">
          <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Error Loading Inventory</h2>
          <p className="text-on-surface-variant font-medium mb-6">{error}</p>
          <button
            onClick={() => fetchInventory()}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : (
        <>

      {/* ── Header ── */}
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold font-headline text-on-surface">Inventory & Promotions</h2>
          <p className="text-on-surface-variant font-medium mt-1">Manage stock levels, prices, and active discount campaigns.</p>
          {message.text && (
            <div className={`mt-3 px-4 py-3 rounded-xl text-sm font-bold animate-fade-in ${message.type === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
              {message.text}
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/vendor/products_management')}
          className="bg-primary hover:bg-primary-dim text-on-primary px-6 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 shrink-0"
        >
          <Plus size={18} />
          New Product
        </button>
      </section>

      {/* Dynamic LPG Monitoring */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 p-6">
        <h3 className="text-lg font-bold font-headline mb-4">Dynamic LPG Monitoring</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lpgMonitoring.tanks.map((tank) => (
            <div key={tank.product_id} className={`p-4 rounded-xl border ${tank.low_level_alarm ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex justify-between gap-3">
                <strong>{tank.name}</strong>
                <span className={tank.low_level_alarm ? 'text-red-700 font-bold' : 'text-green-700 font-bold'}>
                  {tank.low_level_alarm ? 'Low-level alarm' : 'Available'}
                </span>
              </div>
              <p className="mt-2 text-sm">{Number(tank.liters_remaining).toLocaleString()} Liters Remaining</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {lpgMonitoring.orders.map((order) => (
            <div key={order.order_id} className="flex justify-between p-3 bg-surface-container-low rounded-xl text-sm">
              <span className="font-bold">{order.customer_name}: {order.liters_ordered} Liters</span>
              <span className="text-on-surface-variant capitalize">{String(order.status).replaceAll('_', ' ')}</span>
            </div>
          ))}
          {lpgMonitoring.tanks.length === 0 && lpgMonitoring.orders.length === 0 && (
            <p className="text-sm text-on-surface-variant">No LPG inventory is configured.</p>
          )}
        </div>
      </section>

      {/* ── Stats Cards ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const values = {
            totalProducts: inventory.length,
            activeOffers,
            withOffers,
            avgDiscount: `${avgDiscount}%`,
          };
          const Icon = s.Icon;
          return (
            <div key={s.label} className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/15 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon size={20} className={s.iconClass} />
              </div>
              <div className="text-2xl font-black text-on-surface">{values[s.key]}</div>
              <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          );
        })}
      </section>

      {/* ── Inventory Cards Grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {inventory.length > 0 ? inventory.map(item => {
          const badge     = getOfferBadge(item);
          const isHealthy = item.stock > (item.reorder_level || 50);
          const isWarning = item.stock > 0 && item.stock <= (item.reorder_level || 50);
          const color     = isHealthy ? 'primary' : isWarning ? 'tertiary' : 'error';
          // Real fill level from the database; null when capacity isn't configured.
          const fillPercent = stockPercent(item.stock, item.max_stock_level);

          return (
            <div key={item.id} className="relative bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/15 shadow-sm hover:shadow-md transition-all group">
              {badge && (
                <div className={`absolute top-3 right-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${badgeClasses[badge.color]}`}>
                  {badge.label}
                </div>
              )}
              <div className={`w-11 h-11 ${stockTone[color]} rounded-lg flex items-center justify-center mb-3`}>
                <Package size={20} />
              </div>
              <h4 className="font-bold text-on-surface text-sm pr-16 leading-snug">{item.name}</h4>
              <p className="text-[10px] text-on-surface-variant mt-0.5">PROD-{item.id}</p>

              {/* Pricing */}
              <div className="mt-3 space-y-0.5">
                {badge ? (
                  <>
                    <div className="text-slate-400 line-through text-xs font-medium">${Number(item.original_price || item.selling_price).toFixed(2)}</div>
                    <div className="text-rose-600 font-black text-lg">${Number(item.discounted_price || item.selling_price).toFixed(2)}</div>
                    {item.offer_end_date && <Countdown endDate={item.offer_end_date} />}
                  </>
                ) : (
                  <div className="text-on-surface font-bold text-base">${Number(item.selling_price || 0).toFixed(2)}</div>
                )}
              </div>

              {/* Stock bar — real fill from stock / max capacity, clamped 0-100.
                  With no configured capacity we show no bar rather than a fake one. */}
              <div className="mt-3">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-on-surface-variant">Stock</span>
                  <span className="font-bold">
                    {item.stock} {item.unit}
                    {fillPercent !== null && (
                      <span className="text-on-surface-variant font-medium"> / {item.max_stock_level} ({Math.round(fillPercent)}%)</span>
                    )}
                  </span>
                </div>
                {fillPercent === null ? (
                  <p className="text-[10px] italic text-on-surface-variant/70">
                    Set a maximum capacity to show fill level
                  </p>
                ) : (
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`${stockBarTone[color]} h-full rounded-full transition-all`}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setSelectedProduct(item); setShowLogPurchaseModal(true); }}
                  className="flex-1 py-2 bg-surface-container-high text-on-surface text-xs font-bold rounded-lg hover:bg-primary hover:text-on-primary transition-all">
                  Restock
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="col-span-full text-center py-16 text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
            {loading ? 'Loading Inventory…' : 'No Products Found'}
          </div>
        )}
      </section>

      {/* ── Detailed Table ── */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
        {/* Table header */}
        <div className="p-6 border-b border-outline-variant/10 flex flex-wrap gap-4 items-center justify-between">
          <h3 className="text-lg font-bold font-headline">Detailed Inventory Records</h3>
          <div className="flex gap-2 flex-wrap">
            {/* Filter pills */}
            {[
              { key: 'all',            label: 'All Products' },
              { key: 'with_offers',    label: 'With Offers' },
              { key: 'without_offers', label: 'No Offer' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filter === f.key ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}>
                {f.label}
              </button>
            ))}
            <button onClick={() => { flash('CSV exported!'); }}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface-container-low rounded-lg hover:bg-surface-container-high transition-colors">
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-on-surface-variant text-[10px] font-bold uppercase tracking-[0.1em] bg-surface-container-low border-b border-outline-variant/10">
                <th className="px-6 py-4">Item & ID</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Stock</th>
                <th className="px-6 py-4">Availability Status</th>
                <th className="px-6 py-4">Offers</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {filteredInventory.length > 0 ? filteredInventory.map(row => {
                const badge     = getOfferBadge(row);
                const isHealthy = row.stock > (row.reorder_level || 50);
                const health    = isHealthy ? 'Available' : row.stock > 0 ? 'Low Stock' : 'Out of Stock';

                return (
                  <tr key={row.id} className="hover:bg-surface-container-low/40 transition-colors group">
                    {/* Item */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-on-surface">{row.name}</div>
                      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">PROD-{row.id}</div>
                      <div className="text-[10px] text-primary font-bold uppercase mt-0.5">{row.company_name}</div>
                    </td>

                    {/* Price — with strike-through if discounted */}
                    <td className="px-6 py-4">
                      {badge ? (
                        <div>
                          <div className="text-slate-400 line-through text-xs">${Number(row.original_price).toFixed(2)}</div>
                          <div className="text-rose-600 font-black text-base">${Number(row.discounted_price).toFixed(2)}</div>
                          <div className="text-[10px] text-green-600 font-bold">Save ${(Number(row.original_price) - Number(row.discounted_price)).toFixed(2)}</div>
                        </div>
                      ) : (
                        <span className="font-semibold text-on-surface-variant">${Number(row.selling_price || 0).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Stock */}
                    <td className="px-6 py-4 font-bold text-on-surface">{row.stock} {row.unit}</td>

                    {/* Availability status */}
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${health === 'Available' ? 'bg-green-100 text-green-700' : health === 'Low Stock' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {health}
                      </span>
                    </td>

                    {/* Offers column */}
                    <td className="px-6 py-4">
                      {badge ? (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full ${badgeClasses[badge.color]}`}>
                            {badge.label}
                          </span>
                          {row.offer_end_date && <div><Countdown endDate={row.offer_end_date} /></div>}
                          {row.offer_description && (
                            <div className="text-[10px] text-slate-500 max-w-[140px] truncate" title={row.offer_description}>{row.offer_description}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium italic">No active offer</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setSelectedProduct(row); setShowLogPurchaseModal(true); }}
                          title="Restock" className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-primary/10">
                          <ShoppingCart size={18} />
                        </button>
                        {row.offer_id && row.offer_status === 'Active' && (
                          <button onClick={() => handleDeleteOffer(row.offer_id)} title="Remove Offer"
                            disabled={deletingOfferId === row.offer_id}
                            className="p-2 text-red-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-40">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="6" className="py-14 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                    {loading ? 'Loading…' : `No ${filter !== 'all' ? 'matching ' : ''}products found`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}
    </div>
  );
};

export default InventoryManagement;
