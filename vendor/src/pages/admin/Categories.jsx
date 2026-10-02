import React from 'react';
import api from '../../utils/api';
import { Tags, Plus, Search, Edit2, Trash2, Package } from 'lucide-react';
import {
  useToast,
  useConfirm,
  Modal,
  Field,
  fieldClass,
  FormError,
  Toggle,
  PageLoader,
  EmptyState,
  ErrorState,
  usePagination,
  Pagination,
} from '../../components/admin/ui';

const emptyForm = { name: '', image_url: '', is_active: true };

const CategoriesPage = () => {
  const toast = useToast();
  const confirm = useConfirm();

  const [categories, setCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(emptyForm);
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const fetchCategories = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/admin/categories');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((c) => (c.name || '').toLowerCase().includes(term));
  }, [categories, search]);

  const { pageItems, page, setPage, totalPages } = usePagination(filtered, 10);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name || '', image_url: cat.image_url || '', is_active: cat.is_active === 1 || cat.is_active === true });
    setFieldErrors({});
    setFormError('');
    setShowModal(true);
  };

  // Client-side validation mirrors the backend rules for instant feedback.
  const validate = () => {
    const errors = {};
    const name = form.name.trim();
    if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), image_url: form.image_url.trim() || null, is_active: form.is_active ? 1 : 0 };
      if (editing) {
        await api.put(`/admin/categories/${editing.id}`, payload);
        toast.success('Category updated.');
      } else {
        await api.post('/admin/categories', payload);
        toast.success('Category created.');
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      // Surface backend field-level errors inline when present.
      const backendErrors = err.response?.data?.errors;
      if (backendErrors) setFieldErrors(backendErrors);
      setFormError(err.response?.data?.message || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (cat.product_count > 0) {
      toast.error(`"${cat.name}" has ${cat.product_count} linked product(s). Deactivate it instead.`);
      return;
    }
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete "${cat.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/categories/${cat.id}`);
      toast.success('Category deleted.');
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category.');
    }
  };

  const toggleActive = async (cat) => {
    try {
      await api.put(`/admin/categories/${cat.id}`, { is_active: cat.is_active ? 0 : 1 });
      toast.success(cat.is_active ? 'Category deactivated.' : 'Category activated.');
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update category.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Tags size={22} className="text-primary-600" /> Categories
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage product categories used across all vendors.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> New Category
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className={`${fieldClass} pl-10`}
        />
      </div>

      {loading ? (
        <PageLoader label="Loading categories" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={fetchCategories} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={search ? 'No matching categories' : 'No categories yet'}
          subtitle={search ? 'Try a different search term.' : 'Create your first product category.'}
          action={!search && (
            <button onClick={openCreate} className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700">
              <Plus size={16} /> New Category
            </button>
          )}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left">
                  <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Name</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Products</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageItems.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-3 font-semibold text-slate-900 dark:text-white">{cat.name}</td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <Package size={14} className="text-slate-400" /> {cat.product_count ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <button onClick={() => toggleActive(cat)}>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${cat.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(cat)} aria-label="Edit" className="p-2 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(cat)} aria-label="Delete" className="p-2 rounded-lg text-slate-400 hover:text-danger hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={filtered.length} shown={pageItems.length} onChange={setPage} />
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <FormError message={formError} />}
          <Field label="Category Name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={fieldClass}
              placeholder="e.g. Gas Cylinder"
              maxLength={80}
            />
            {fieldErrors.name && <p className="text-xs font-medium text-danger mt-1">{fieldErrors.name}</p>}
          </Field>
          <Field label="Image URL (optional)">
            <input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className={fieldClass}
              placeholder="https://..."
            />
          </Field>
          <Field label="Status">
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Category active" />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CategoriesPage;
