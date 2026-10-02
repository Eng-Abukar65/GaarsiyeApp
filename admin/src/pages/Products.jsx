import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Package, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'error' | 'inactive' | 'ok'
  const [sortConfig, setSortConfig] = useState({ key: 'vendor_name', dir: 'asc' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/products');
      setProducts(res.data);
    } catch (err) {
      setError('Failed to load products.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const hasPricingError = (p) => !p.selling_price || parseFloat(p.selling_price) <= 0;
  const hasStockError = (p) => p.stock !== undefined && parseInt(p.stock) <= 0;

  const filtered = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.vendor_name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q);

    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'error' && hasPricingError(p)) ||
      (filterStatus === 'inactive' && !p.is_active) ||
      (filterStatus === 'ok' && !hasPricingError(p) && p.is_active);

    return matchesSearch && matchesFilter;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortConfig.key] ?? '';
    const bVal = b[sortConfig.key] ?? '';
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortConfig.dir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  };

  const SortIcon = ({ col }) =>
    sortConfig.key === col
      ? sortConfig.dir === 'asc' ? <ChevronUp size={12} className="inline ml-1" /> : <ChevronDown size={12} className="inline ml-1" />
      : null;

  const pricingErrors = products.filter(hasPricingError).length;
  const inactiveCount = products.filter((p) => !p.is_active).length;

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Package size={26} className="text-primary-600" />
            Products Oversight
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Monitor all vendor products in read-only mode.
          </p>
        </div>
        {/* Stats badges */}
        <div className="flex gap-3 flex-wrap">
          <div className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white">
            {products.length} Total
          </div>
          {pricingErrors > 0 && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-700/40 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle size={14} />
              {pricingErrors} Pricing Error{pricingErrors !== 1 ? 's' : ''}
            </div>
          )}
          {inactiveCount > 0 && (
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-700/40 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400">
              {inactiveCount} Inactive
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name, vendor, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl outline-none text-sm border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 focus:border-primary-500 transition-colors"
        />
        <div className="flex gap-2">
          {[
            { val: 'all', label: 'All' },
            { val: 'error', label: 'Pricing Error' },
            { val: 'inactive', label: 'Inactive' },
            { val: 'ok', label: 'Active & Valid' },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={`px-3 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                filterStatus === val
                  ? 'bg-primary-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/30 rounded-xl text-red-700 dark:text-red-400 font-bold text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                {[
                  { key: 'name', label: 'Product' },
                  { key: 'vendor_name', label: 'Vendor' },
                  { key: 'category', label: 'Category' },
                  { key: 'selling_price', label: 'Price' },
                  { key: 'stock', label: 'Stock' },
                  { key: 'is_active', label: 'Status' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="py-4 px-5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors select-none"
                  >
                    {label}
                    <SortIcon col={key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-500 dark:text-slate-400 font-bold">
                    Loading products...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-500 dark:text-slate-400 font-bold">
                    No products found.
                  </td>
                </tr>
              ) : (
                sorted.map((p) => {
                  const isPricingError = hasPricingError(p);
                  const isStockError = hasStockError(p);
                  const price = parseFloat(p.selling_price) || 0;
                  const stock = parseInt(p.stock) ?? 0;

                  return (
                    <tr
                      key={p.id}
                      className={`group transition-colors ${
                        isPricingError
                          ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border-l-2 border-l-red-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Product Name */}
                      <td className="py-4 px-5">
                        <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">ID: {p.id}</div>
                      </td>
                      {/* Vendor */}
                      <td className="py-4 px-5 text-slate-700 dark:text-slate-300 font-medium">{p.vendor_name || '—'}</td>
                      {/* Category */}
                      <td className="py-4 px-5">
                        <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase">
                          {p.category || '—'}
                        </span>
                      </td>
                      {/* Price */}
                      <td className="py-4 px-5">
                        {isPricingError ? (
                          <div className="flex items-center gap-2">
                            <span className="text-red-600 dark:text-red-400 font-bold">${price.toFixed(2)}</span>
                            <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[9px] font-bold uppercase border border-red-200 dark:border-red-700/40">
                              Pricing Error
                            </span>
                          </div>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 font-bold">${price.toFixed(2)}</span>
                        )}
                      </td>
                      {/* Stock */}
                      <td className="py-4 px-5">
                        <span className={`font-bold ${isStockError ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {stock} {p.unit || ''}
                          {isStockError && (
                            <span className="ml-1 text-[9px] text-red-600 dark:text-red-400 font-bold uppercase">(Out)</span>
                          )}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="py-4 px-5">
                        {isPricingError ? (
                          <span className="px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase border border-red-200 dark:border-red-700/30">
                            Error
                          </span>
                        ) : p.is_active ? (
                          <span className="px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase border border-green-200 dark:border-green-700/30">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default Products;
