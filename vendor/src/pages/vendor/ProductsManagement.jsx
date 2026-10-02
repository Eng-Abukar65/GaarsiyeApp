import React, { useState, useEffect } from 'react';
import api, { getUploadUrl } from '../../utils/api';
import { vRequired, vName, vPositive, vNonNegative, buildErrors } from '../../utils/formValidation';

const FieldErr = ({ msg }) => (msg ? <p className="text-xs font-medium text-red-500 mt-1">{msg}</p> : null);

const serviceTypeOptions = [
  { name: 'Petrol/Diesel', unit: 'Liters' },
  { name: 'Gas Cylinder', unit: 'KG' },
  { name: 'Spare Parts', unit: 'Units' },
];

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

const ProductsManagement = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentProductId, setCurrentProductId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    cost_price: '',
    selling_price: '',
    category_id: '',
    description: '',
    unit: 'Units',
    max_stock_level: '',
    is_active: true,
  });

  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validateProduct = () => {
    const errors = buildErrors({
      name: vName(formData.name, 'Item name'),
      selling_price: vPositive(formData.selling_price, 'Selling price'),
      cost_price: formData.cost_price === '' ? null : vNonNegative(formData.cost_price, 'Cost price'),
      stock_quantity: (formData.stock_quantity === '' || formData.stock_quantity === undefined)
        ? null : vNonNegative(formData.stock_quantity, 'Stock'),
      category_id: vRequired(formData.category_id, 'Category'),
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const pageTitle = 'Business Catalog';
  const pageSubtitle = 'Manage Petrol/Diesel, Gas Cylinder, and Spare Parts inventory.';
  const addButtonLabel = 'Add New Item';
  const modalTitle = editMode ? 'Edit Item' : 'Add New Item';
  const getDefaultCategoryId = () => {
    const defaultCategory = serviceTypeOptions
      .map((option) => categories.find((cat) => normalizeLabel(cat.name) === normalizeLabel(option.name)))
      .find(Boolean) || categories[0];
    return defaultCategory?.id || '';
  };
  const getCategoryByName = (name) => categories.find((cat) => normalizeLabel(cat.name) === normalizeLabel(name));
  const getSelectedCategoryName = () => {
    const selected = categories.find((cat) => String(cat.id) === String(formData.category_id));
    return selected?.name || '';
  };
  const getDefaultUnitForCategoryName = (categoryName) => {
    const normalized = normalizeLabel(categoryName);
    if (normalized === normalizeLabel('Gas Cylinder')) return 'KG';
    if (normalized === normalizeLabel('Petrol/Diesel')) return 'Liters';
    return 'Units';
  };
  const handleTypeSelection = (categoryName) => {
    const category = getCategoryByName(categoryName);
    if (!category) return;
    setFormData((prev) => ({
      ...prev,
      category_id: category.id,
      unit: getDefaultUnitForCategoryName(category.name),
    }));
  };

  useEffect(() => {
    if (user && user.id) {
      fetchProducts();
      fetchCategories();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/vendor/products?vendorId=${user.id}`);
      setProducts(response.data || []);
    } catch (err) {
      console.error('Failed to fetch products', err);
      setError(err.response?.data?.message || 'Failed to fetch items catalog');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/vendor/categories');
      const nextCategories = response.data || [];
      setCategories(nextCategories);
      if (nextCategories.length > 0 && !formData.category_id) {
        const defaultCategory = serviceTypeOptions
          .map((option) => nextCategories.find((cat) => normalizeLabel(cat.name) === normalizeLabel(option.name)))
          .find(Boolean) || nextCategories[0];
        setFormData(prev => ({ ...prev, category_id: defaultCategory?.id || '' }));
      }
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  };

  // Deduplicate physical product categories for filter bar
  const physicalCategories = categories.filter((cat) => {
    const norm = normalizeLabel(cat.name);
    return !['car wash', 'car service', 'car services'].includes(norm);
  }).reduce((acc, cat) => {
    const norm = normalizeLabel(cat.name);
    if (!acc.some(c => normalizeLabel(c.name) === norm)) {
      acc.push(cat);
    }
    return acc;
  }, []);

  // Filter out any service items from physical products
  const physicalProducts = products.filter(p => {
    const cat = categories.find(c => String(c.id) === String(p.category_id));
    const normName = cat ? normalizeLabel(cat.name) : '';
    return !['car wash', 'car service', 'car services'].includes(normName);
  });

  const filteredProducts = selectedCategory === 'All' 
    ? physicalProducts 
    : physicalProducts.filter(p => String(p.category_id) === String(selectedCategory));

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    setMessage(''); // clear any stale message

    try {
      const response = await api.delete(`/vendor/products/${id}`);

      if (response.data.success) {
        // Fix: use functional update to avoid stale closure
        setProducts(prev => prev.filter(p => p.id !== id));
        const msg = response.data.archived
          ? '⚠️ Item archived (linked to purchase history)'
          : '✅ Item deleted successfully!';
        setMessage(msg);
        setTimeout(() => setMessage(''), 4000);
      } else {
        setMessage(`❌ ${response.data.message || 'Failed to delete product'}`);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (err) {
      console.error('Delete failed:', err);
      setMessage('❌ Network error: Could not reach the server');
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateProduct()) return;

    // Validate is_active vs stock (prevent active status if stock < 0)
    if (formData.is_active && editMode && currentProductId) {
      const activeProduct = products.find(p => p.id === currentProductId);
      const stock = activeProduct ? parseInt(activeProduct.stock_quantity ?? activeProduct.stock ?? 0, 10) : 0;
      if (stock < 0) {
        setMessage('❌ Cannot enable an item with invalid stock.');
        return;
      }
    }

    const url = editMode 
      ? `/vendor/products/${currentProductId}`
      : '/vendor/products';
    
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        data.append(key, formData[key]);
      });
      data.append('vendor_id', user.id);
      if (selectedFile) {
        data.append('image', selectedFile);
      }

      const response = editMode
        ? await api.put(url, data, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post(url, data, { headers: { 'Content-Type': 'multipart/form-data' } });

      if (response.data.success) {
        setShowModal(false);
        setFieldErrors({});
        fetchProducts();
        setSelectedFile(null);
        setImagePreview(null);
        setMessage(editMode ? 'Item updated successfully!' : 'Item created successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`❌ ${response.data.message || 'Failed to save item'}`);
      }
    } catch (err) {
      console.error('Failed to save product', err);
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      setMessage(`❌ ${err.response?.data?.message || 'Failed to save item'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File is too large! Max 5MB.");
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    const defaultCatId = getDefaultCategoryId();
    const defaultCategoryName = categories.find((cat) => String(cat.id) === String(defaultCatId))?.name || '';
    setFormData({
      name: '',
      cost_price: '',
      selling_price: '',
      category_id: defaultCatId,
      description: '',
      unit: getDefaultUnitForCategoryName(defaultCategoryName),
      max_stock_level: '',
      is_active: true,
    });
    setSelectedFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setEditMode(true);
    setCurrentProductId(product.id);
    const categoryName = categories.find((cat) => String(cat.id) === String(product.category_id))?.name || '';
    setFormData({
      name: product.name,
      cost_price: product.cost_price || '',
      selling_price: product.selling_price || '',
      category_id: product.category_id,
      description: product.description || '',
      unit: product.unit || getDefaultUnitForCategoryName(categoryName),
      max_stock_level: product.max_stock_level ?? '',
      is_active: product.is_active !== undefined ? Boolean(product.is_active) : true,
    });
    setSelectedFile(null);
    setImagePreview(product.image_url ? getUploadUrl(product.image_url) : null);
    setShowModal(true);
  };

  const unitProfit = (parseFloat(formData.selling_price) || 0) - (parseFloat(formData.cost_price) || 0);
  const profitMargin = formData.selling_price > 0 ? (unitProfit / formData.selling_price) * 100 : 0;
  const selectedCategoryName = getSelectedCategoryName();

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

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg animate-fade-in">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Error Loading Items</h2>
        <p className="text-on-surface-variant font-medium mb-6">{error}</p>
        <button
          onClick={() => fetchProducts()}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-10">
      {/* Hero Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="font-headline text-3xl font-bold text-on-surface tracking-tight">{pageTitle}</h2>
          <p className="text-on-surface-variant font-medium">{pageSubtitle}</p>
          {message && (
            <div className={`mt-4 p-4 rounded-xl text-sm font-bold animate-fade-in ${message.includes('success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>
        <button 
          onClick={openAddModal}
          className="px-6 py-3 bg-primary hover:bg-primary-dim text-on-primary rounded-xl font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
          <span className="material-symbols-outlined">add</span>
          {addButtonLabel}
        </button>
      </section>

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-bold mb-6 font-headline">{modalTitle}</h3>
            <div className="mb-6 rounded-2xl border border-primary/10 bg-primary/5 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Select Business Type</p>
                  <p className="text-sm text-on-surface-variant">Choose the type this item belongs to before saving.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const defaultCategoryId = getDefaultCategoryId();
                    const defaultCategoryName = categories.find((cat) => String(cat.id) === String(defaultCategoryId))?.name || '';
                    setFormData((prev) => ({
                      ...prev,
                      category_id: defaultCategoryId,
                      unit: getDefaultUnitForCategoryName(defaultCategoryName),
                    }));
                  }}
                  className="self-start sm:self-auto text-xs font-bold text-primary hover:underline"
                >
                  Reset type
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {serviceTypeOptions.map((option) => {
                  const category = getCategoryByName(option.name);
                  const isSelected = String(formData.category_id) === String(category?.id || '');
                  return (
                    <button
                      key={option.name}
                      type="button"
                      disabled={!category}
                      onClick={() => handleTypeSelection(option.name)}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-primary/10 bg-white hover:border-primary hover:bg-primary/5'
                      } ${!category ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-on-surface">{option.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          {option.unit}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant leading-5">
                        {isSelected ? 'Selected for this item' : 'Tap to use this business type'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Item Name</label>
                  <input
                    className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                  <FieldErr msg={fieldErrors.name} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Selected Business Type</label>
                  <div className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold min-h-[52px] flex items-center">
                    {getSelectedCategoryName() || 'Choose a business type above'}
                  </div>
                </div>
              </div>

              <div>
                  <label className="block text-xs font-bold uppercase mb-2">Item Description</label>
                <textarea
                  rows={4}
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-medium resize-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe what this item includes."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase mb-2 text-primary">Cost Price ($)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full p-3 bg-primary/5 border border-primary/10 rounded-xl outline-none font-bold text-primary"
                    value={formData.cost_price}
                    onChange={e => setFormData({...formData, cost_price: e.target.value})}
                    placeholder="0.00"
                  />
                  <FieldErr msg={fieldErrors.cost_price} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-2 text-green-600">
                    Price ($) *
                  </label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={`w-full p-3 rounded-xl outline-none font-bold ${
                      formData.selling_price && parseFloat(formData.selling_price) <= 0
                        ? 'bg-red-50 border border-red-300 text-red-700'
                        : 'bg-green-50 border border-green-100 text-green-700'
                    }`}
                    value={formData.selling_price}
                    onChange={e => setFormData({...formData, selling_price: e.target.value})}
                    placeholder="0.00"
                  />
                  <FieldErr msg={fieldErrors.selling_price} />
                  {formData.selling_price && parseFloat(formData.selling_price) <= 0 && (
                    <p className="text-red-600 text-xs font-bold mt-1">⚠ Price must be greater than zero.</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-500">Unit Profit Insight</span>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${unitProfit > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {unitProfit > 0 ? 'Profitable' : 'Loss Warning'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Profit per Unit</p>
                    <p className={`text-xl font-bold ${unitProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>${unitProfit.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Margin (%)</p>
                    <p className={`text-xl font-bold ${unitProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>{profitMargin.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-4">
                <label className="block text-xs font-bold uppercase mb-2">
                  Item Image
                </label>
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {imagePreview ? (
                      <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <span className="material-symbols-outlined text-slate-400">image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden" 
                      id="product-image"
                    />
                    <label 
                      htmlFor="product-image"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-sm">upload</span>
                      {imagePreview ? 'Change Image' : 'Select Image'}
                    </label>
                    {imagePreview && (
                      <button 
                        type="button"
                        onClick={() => { setSelectedFile(null); setImagePreview(null); }}
                        className="block text-[10px] text-red-500 font-bold uppercase hover:underline"
                      >
                        Remove Image
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400">JPG, PNG or WebP. Max 5MB.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-2">
                  {normalizeLabel(selectedCategoryName) === normalizeLabel('Gas Cylinder')
                    ? 'Unit (KG)'
                    : normalizeLabel(selectedCategoryName) === normalizeLabel('Petrol/Diesel')
                      ? 'Unit (Liters)'
                      : 'Unit / Size'}
                </label>
                <input 
                  required
                  className="w-full p-3 bg-slate-100 rounded-xl outline-none font-bold"
                  value={formData.unit}
                  placeholder={
                    normalizeLabel(selectedCategoryName) === normalizeLabel('Gas Cylinder')
                      ? 'KG'
                      : normalizeLabel(selectedCategoryName) === normalizeLabel('Petrol/Diesel')
                        ? 'Liters'
                        : 'Units'
                  }
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                />
              </div>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="checkbox"
                  id="product-active"
                  checked={formData.is_active}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 accent-primary rounded"
                />
                <label htmlFor="product-active" className="text-sm font-bold cursor-pointer">
                  Item Active (visible to customers)
                </label>
              </div>
              <div className="flex justify-end gap-4 mt-8">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 font-bold text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editMode ? 'Update Item' : 'Create Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters & Category Navigation */}
      <section className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        <button 
          onClick={() => setSelectedCategory('All')}
          className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all ${selectedCategory === 'All' ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
        >
          All
        </button>
        {physicalCategories.map((cat) => (
          <button 
            key={cat.id} 
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all ${selectedCategory === cat.id ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            {cat.name}
          </button>
        ))}
      </section>

      {/* Product Table */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-outline-variant/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low/50 border-b border-outline-variant/10">
              <th className="py-5 px-8 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Item Information</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Category</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cost</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Sell</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Profit</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
              <th className="py-5 px-6 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest w-48">Stock Level</th>
              <th className="py-5 px-8 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5 text-sm">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((p) => {
                const name = p?.name ?? 'Unknown';
                const id = p?.id ?? 0;
                const category = categories.find(c => c.id === p.category_id)?.name ?? 'General';
                const cost = p?.cost_price ?? '0.00';
                const sell = p?.selling_price ?? '0.00';
                const profit = sell - cost;
                const stock = p?.stock_quantity ?? 0;
                const unit = p?.unit ?? 'Units';
                const stockPercent = Math.min(100, (stock / 1000) * 100);

                return (
                  <tr key={id} className="group hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-4">
                        {p.image_url ? (
                          <div className="w-12 h-12 rounded-xl border border-outline-variant/10 overflow-hidden shadow-sm">
                            <img src={getUploadUrl(p.image_url)} className="w-full h-full object-cover" alt={name} />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold">
                            {name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-on-surface">{name}</p>
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">ID: ITEM-{id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-6">
                      <span className={`px-3 py-1 rounded-full bg-primary-container text-on-primary-container text-[10px] font-bold uppercase`}>{category}</span>
                    </td>
                    <td className="py-6 px-6 font-bold text-slate-500">${cost}</td>
                    <td className="py-6 px-6 font-bold text-green-600 font-headline">${sell}</td>
                    <td className={`py-6 px-6 font-bold ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>${profit.toFixed(2)}</td>
                    <td className="py-6 px-6">
                      {sell <= 0 ? (
                        <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">Pricing Error</span>
                      ) : p.is_active ? (
                        <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase">Active</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">Inactive</span>
                      )}
                    </td>
                    <td className="py-6 px-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase">
                          <span className="text-on-surface">{stock} {unit}</span>
                          <span className={stock < 50 ? 'text-red-500' : 'text-on-surface-variant'}>
                            {stockPercent.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${stock < 50 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${stockPercent}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-8 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(p)}
                          className="p-2 rounded-lg text-on-surface-variant hover:text-primary transition-colors hover:bg-primary-container/20"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteProduct(id)}
                          className="p-2 rounded-lg text-on-surface-variant hover:text-red-500 transition-colors hover:bg-red-50"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="5" className="py-12 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-50">
                  {loading ? 'Loading Items...' : 'No Items Found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default ProductsManagement;
