import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { vRequired, vPositive, vNonNegative, buildErrors } from '../../utils/formValidation';
import { Lock, AlertTriangle, Calendar, FileText, Hash } from 'lucide-react';

const FieldErr = ({ msg }) => (msg ? <p className="text-xs font-medium text-red-500 mt-1">{msg}</p> : null);

const LogPurchaseModal = ({
  isOpen,
  onClose,
  onSuccess,
  initialProductId = '',
  lockProduct = false,
  productsList = [],
  suppliersList = []
}) => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  
  const [products, setProducts] = useState(productsList);
  const [suppliers, setSuppliers] = useState(suppliersList);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const todayStr = new Date().toISOString().split('T')[0];

  const getInitialFormData = (selectedProdId = '') => ({
    product_id: selectedProdId ? String(selectedProdId) : '',
    supplier_id: '',
    invoice_number: '',
    quantity: '',
    cost_price: '',
    selling_price: '',
    purchase_date: todayStr,
    notes: ''
  });

  const [formData, setFormData] = useState(() => getInitialFormData(initialProductId));

  useEffect(() => {
    if (!isOpen) return;

    setMessage('');
    setFieldErrors({});

    const loadData = async () => {
      if (!user || !user.id) return;
      try {
        setLoadingInitial(true);
        let currentProds = productsList;
        let currentSupps = suppliersList;

        if (!currentProds || currentProds.length === 0 || !currentSupps || currentSupps.length === 0) {
          const [prodRes, suppRes] = await Promise.all([
            api.get(`/vendor/products?vendorId=${user.id}`),
            api.get(`/vendor/suppliers?vendorId=${user.id}`)
          ]);
          currentProds = prodRes.data || [];
          currentSupps = suppRes.data || [];
          setProducts(currentProds);
          setSuppliers(currentSupps);
        } else {
          setProducts(currentProds);
          setSuppliers(currentSupps);
        }

        setFormData(getInitialFormData(initialProductId));
      } catch (err) {
        console.error('Failed to load modal dependencies', err);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadData();
  }, [isOpen, initialProductId]);

  useEffect(() => {
    if (initialProductId && products.length > 0) {
      setFormData(prev => ({
        ...prev,
        product_id: String(initialProductId)
      }));
    }
  }, [initialProductId, products]);

  const handleProductChange = (e) => {
    const newId = e.target.value;
    setFormData(prev => ({
      ...prev,
      product_id: newId
    }));
  };

  const handleLogPurchase = async (e) => {
    e.preventDefault();
    if (!user || !user.id) return;
    if (submitting) return;

    const errors = buildErrors({
      product_id: vRequired(formData.product_id, 'Product'),
      supplier_id: vRequired(formData.supplier_id, 'Supplier'),
      quantity: vPositive(formData.quantity, 'Quantity'),
      cost_price: vNonNegative(formData.cost_price, 'Unit cost'),
      selling_price: vPositive(formData.selling_price, 'Sell price'),
    });

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage('Please correct the highlighted fields.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const payload = {
        vendor_id: user.id,
        product_id: formData.product_id,
        supplier_id: formData.supplier_id,
        quantity: parseFloat(formData.quantity),
        cost_price: parseFloat(formData.cost_price),
        selling_price: parseFloat(formData.selling_price),
        invoice_number: formData.invoice_number,
        reference_number: formData.invoice_number,
        purchase_date: formData.purchase_date,
        notes: formData.notes
      };

      const response = await api.post('/vendor/purchase', payload);

      if (response.data?.success) {
        const successMsg = response.data.message || 'Purchase logged and stock updated successfully.';
        if (onSuccess) onSuccess(successMsg, response.data);
        onClose();
      } else {
        const errMsg = response.data?.message || 'Failed to complete purchase transaction.';
        setMessage(`Error: ${errMsg}`);
      }
    } catch (err) {
      console.error('Procurement Transaction Error:', err);
      if (err.response?.data?.errors) {
        setFieldErrors(err.response.data.errors);
      }
      setMessage(err.response?.data?.message || 'Network Error: Could not connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProductObj = products.find(p => String(p.id) === String(formData.product_id));

  const getProductCategoryType = (product) => {
    if (!product) return null;
    const catId = String(product.category_id || '');
    if (catId === '1') return 'Petrol/Diesel';
    if (catId === '2') return 'Gas Cylinder';
    if (catId === '3') return 'Spare Parts';
    const unit = String(product.unit || '').toLowerCase();
    if (unit === 'liters' || unit === 'l') return 'Petrol/Diesel';
    if (unit === 'kg') return 'Gas Cylinder';
    return 'Spare Parts';
  };

  const selectedProductCategory = getProductCategoryType(selectedProductObj);

  const availableSuppliers = suppliers.filter(s => {
    if (!selectedProductCategory) return true;
    const types = Array.isArray(s.supplier_types) ? s.supplier_types : [];
    if (types.length === 0) return true;
    return types.includes(selectedProductCategory);
  });

  const selectedSupplierObj = suppliers.find(s => String(s.id) === String(formData.supplier_id));

  const getSupplierName = (supplier) => {
    return supplier.business_name || supplier.name || supplier.email || supplier.contact_person || `Supplier #${supplier.id}`;
  };

  const getSupplierOptionLabel = (supplier) => {
    const name = getSupplierName(supplier);
    const email = supplier.email || supplier.contact_person || '';
    if (email && supplier.phone) return `${name} - ${email} (${supplier.phone})`;
    if (email) return `${name} - ${email}`;
    return supplier.phone ? `${name} (${supplier.phone})` : name;
  };

  const renderSupplierBadges = (supplierTypes) => {
    const types = Array.isArray(supplierTypes) ? supplierTypes : [];
    if (types.length === 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          Not Assigned
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {types.map((type) => (
          <span key={type} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {type}
          </span>
        ))}
      </div>
    );
  };

  const rawQty = parseFloat(formData.quantity);
  const rawCost = parseFloat(formData.cost_price);
  const rawSell = parseFloat(formData.selling_price);

  const hasValidFinancials =
    !isNaN(rawQty) && rawQty > 0 &&
    !isNaN(rawCost) && rawCost >= 0 &&
    !isNaN(rawSell) && rawSell > 0;

  const calcTotalCost = hasValidFinancials ? rawQty * rawCost : 0;
  const calcRevenue = hasValidFinancials ? rawQty * rawSell : 0;
  const calcProfit = hasValidFinancials ? calcRevenue - calcTotalCost : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl p-8 shadow-2xl overflow-y-auto max-h-[90vh] animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold font-headline text-on-surface">Log New Purchase</h3>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-bold animate-fade-in ${message.startsWith('Error') || message.includes('Please correct') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleLogPurchase} className="space-y-5">
          {/* Product & Supplier Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600">
                Product {lockProduct && '(Selected for Restock)'}
              </label>
              {lockProduct ? (
                <div className="p-3 bg-slate-100 rounded-xl font-bold text-slate-800 border border-slate-200 flex justify-between items-center text-sm">
                  <span>{selectedProductObj?.name || `Product #${formData.product_id}`}</span>
                  <Lock size={14} className="text-slate-400" />
                </div>
              ) : (
                <select
                  required
                  disabled={loadingInitial}
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                  value={formData.product_id}
                  onChange={handleProductChange}
                >
                  <option value="">Select a product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <FieldErr msg={fieldErrors.product_id} />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600">
                Select Supplier {selectedProductCategory && `(${selectedProductCategory} Suppliers)`}
              </label>
              <select
                required
                disabled={loadingInitial}
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                value={formData.supplier_id}
                onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
              >
                <option value="">Select a supplier</option>
                {availableSuppliers.map(s => (
                  <option key={s.id} value={s.id}>{getSupplierOptionLabel(s)}</option>
                ))}
              </select>
              {selectedSupplierObj && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Provides:</span>
                  {renderSupplierBadges(selectedSupplierObj.supplier_types)}
                </div>
              )}
              {availableSuppliers.length === 0 && selectedProductCategory && (
                <p className="text-[10px] text-red-500 font-bold mt-1">No matching suppliers found for {selectedProductCategory}. Please add or update a supplier in Suppliers Directory.</p>
              )}
              <FieldErr msg={fieldErrors.supplier_id} />
            </div>
          </div>

          {/* Reference Number & Purchase Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600 flex items-center gap-1">
                <Hash size={12} /> Reference / Invoice Number
              </label>
              <input
                type="text"
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                placeholder="Enter invoice number"
                value={formData.invoice_number}
                onChange={e => setFormData({ ...formData, invoice_number: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600 flex items-center gap-1">
                <Calendar size={12} /> Purchase Date
              </label>
              <input
                type="date"
                required
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                placeholder="Select purchase date"
                value={formData.purchase_date}
                onChange={e => setFormData({ ...formData, purchase_date: e.target.value })}
              />
            </div>
          </div>

          {/* Quantity, Cost, Selling Price */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600">Quantity</label>
              <input
                type="number"
                min="1"
                required
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                placeholder="Enter quantity"
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: e.target.value })}
              />
              <FieldErr msg={fieldErrors.quantity} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
                placeholder="Enter unit cost"
                value={formData.cost_price}
                onChange={e => setFormData({ ...formData, cost_price: e.target.value })}
              />
              <FieldErr msg={fieldErrors.cost_price} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600">Sell Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm text-green-700 focus:ring-2 focus:ring-primary/20"
                placeholder="Enter selling price"
                value={formData.selling_price}
                onChange={e => setFormData({ ...formData, selling_price: e.target.value })}
              />
              <FieldErr msg={fieldErrors.selling_price} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold uppercase mb-1.5 text-slate-600 flex items-center gap-1">
              <FileText size={12} /> Notes / Remarks
            </label>
            <input
              type="text"
              className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20"
              placeholder="Enter notes (optional)"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {/* Financial summary */}
          <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10">
            <h4 className="text-xs font-bold uppercase text-primary mb-3">Financial Projections</h4>
            {hasValidFinancials ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Cost</p>
                    <p className="text-base font-extrabold text-slate-700">${calcTotalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Expected Revenue</p>
                    <p className="text-base font-extrabold text-slate-700">${calcRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Projected Profit</p>
                    <p className={`text-base font-extrabold ${calcProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ${calcProfit.toFixed(2)}
                    </p>
                  </div>
                </div>
                {calcProfit <= 0 && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-[10px] font-bold uppercase">
                    <AlertTriangle size={14} />
                    <span>Selling price is below or equal to cost price.</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 font-medium">Enter quantity, unit cost, and selling price to calculate projections.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-6 py-3 font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-8 py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2 ${
                submitting ? 'bg-slate-400 cursor-not-allowed text-white' : 'bg-primary text-on-primary hover:bg-primary-dim'
              }`}
            >
              {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
              {submitting ? 'Logging Purchase...' : 'Confirm & Log Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LogPurchaseModal;

