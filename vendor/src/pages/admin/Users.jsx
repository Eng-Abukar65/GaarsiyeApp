import React from 'react';
import api from '../../utils/api';
import {
  Users as UsersIcon,
  UserPlus,
  Download,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  Truck,
  UserCheck,
  Slash,
  Wifi
} from 'lucide-react';
import {
  useToast,
  useConfirm,
  Modal,
  Field,
  fieldClass,
  PageLoader,
  EmptyState,
  usePagination,
  Pagination,
  StatusBadge
} from '../../components/admin/ui';
import { vName, vEmail, vPhone, buildErrors } from '../../utils/formValidation';

const FieldError = ({ msg }) => (msg ? <p className="text-xs font-medium text-danger mt-1">{msg}</p> : null);

const UserStatCard = ({ title, value, icon: Icon, subtitle, colorClass }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
    <div className="flex justify-between items-start mb-3">
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>
      </div>
      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center`}>
        {React.createElement(Icon, { size: 20, className: 'text-white' })}
      </div>
    </div>
    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{subtitle}</p>
  </div>
);

const emptyForm = { username: '', email: '', phone: '', role: 'customer' };

const roleLabels = {
  admin: 'Admin',
  customer: 'Customer',
  driver: 'Driver',
  vendor: 'Vendor',
};

const UsersPage = () => {
  const toast = useToast();
  const confirm = useConfirm();

  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('all');
  const [showModal, setShowModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formData, setFormData] = React.useState(emptyForm);
  const [editingUser, setEditingUser] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [fieldErrors, setFieldErrors] = React.useState({});

  const validateUserForm = () => {
    const errors = buildErrors({
      username: vName(formData.username, 'Full name'),
      email: vEmail(formData.email),
      phone: vPhone(formData.phone, true),
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Never';
    const diffInMinutes = Math.floor((Date.now() - new Date(lastSeen)) / 60000);
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} h ago`;
    return new Date(lastSeen).toLocaleDateString();
  };

  const filteredUsers = React.useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (users || []).filter((u) => {
      const displayName = u.business_name || u.name || u.username || '';
      const matchesSearch =
        displayName.toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.phone || '').toLowerCase().includes(term);

      let matchesRole = true;
      if (roleFilter === 'online') matchesRole = u.is_online === 1;
      else if (roleFilter === 'offline') matchesRole = u.is_online === 0;
      // Role filters (customer/driver/vendor/admin) are applied server-side.

      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchTerm]);

  const { pageItems, page, setPage, totalPages } = usePagination(filteredUsers, 10);

  const fetchUsers = React.useCallback(async (role, showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const roleParam = role && !['all', 'online', 'offline'].includes(role) ? role : null;
      const response = await api.get(roleParam ? `/admin/users?role=${roleParam}` : '/admin/users');
      const rawData = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];
      setUsers(rawData);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = React.useCallback(async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }, []);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  React.useEffect(() => {
    fetchUsers(roleFilter, true);
    // Refresh every 15s to keep online/offline status current
    const intervalId = setInterval(() => fetchUsers(roleFilter), 15000);
    return () => clearInterval(intervalId);
  }, [roleFilter, fetchUsers]);

  const handleUpdateStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const ok = await confirm({
      title: `${newStatus === 'suspended' ? 'Suspend' : 'Reactivate'} this user?`,
      message: `${user.username || user.name || 'This user'} will be ${newStatus === 'suspended' ? 'blocked from signing in' : 'able to sign in again'}.`,
      confirmLabel: newStatus === 'suspended' ? 'Suspend' : 'Reactivate',
      danger: newStatus === 'suspended',
    });
    if (!ok) return;
    try {
      await api.patch(`/admin/users/${user.id}/status`, { status: newStatus });
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`);
      fetchUsers(roleFilter);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username || user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'customer',
    });
    setFieldErrors({});
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!validateUserForm()) return;
    setSaving(true);
    try {
      const updatePayload = {
        username: formData.username,
        email: formData.email,
        phone: formData.phone,
      };
      await api.put(`/admin/users/${editingUser.id}`, updatePayload);
      toast.success('User updated successfully.');
      setShowEditModal(false);
      fetchUsers(roleFilter);
    } catch (err) {
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      toast.error(err.response?.data?.message || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user) => {
    const ok = await confirm({
      title: 'Delete this user?',
      message: `${user.username || user.name || 'This user'} and their account access will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      const response = await api.delete(`/admin/users/${user.id}`);
      toast.success(response.data?.message || 'User deleted.');
      fetchUsers(roleFilter);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete operation failed.');
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!validateUserForm()) return;
    setSaving(true);
    try {
      await api.post('/admin/users', formData);
      setShowModal(false);
      setFormData(emptyForm);
      setFieldErrors({});
      fetchUsers(roleFilter);
      toast.success('User created. Credentials sent (or shown to admin if email is off).');
    } catch (err) {
      if (err.response?.data?.errors) setFieldErrors(err.response.data.errors);
      toast.error(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (filteredUsers.length === 0) {
      toast.info('No data to export.');
      return;
    }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'Username', 'Email', 'Phone', 'Role', 'Status', 'Joined Date'];
    const csvRows = filteredUsers.map((u) =>
      [u.id, u.username, u.email, u.phone, u.role, u.status, u.created_at ? new Date(u.created_at).toLocaleDateString() : ''].map(esc).join(',')
    );
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredUsers.length} users.`);
  };

  const getRoleStyle = (role) => {
    switch ((role || '').toUpperCase()) {
      case 'CUSTOMER': return 'text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'DRIVER': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'VENDOR': return 'text-violet-600 dark:text-violet-400 bg-violet-500/10';
      case 'ADMIN': return 'text-slate-700 dark:text-slate-300 bg-slate-500/10';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-500/10';
    }
  };

  const onlineCount = users.filter((u) => u.is_online === 1).length;
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;

  if (loading) return <PageLoader label="Loading users..." />;

  const renderUserFormFields = ({ roleReadOnly = false } = {}) => (
    <>
      <Field label="Full Name" required>
        <input
          className={fieldClass}
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
        />
        <FieldError msg={fieldErrors.username} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input
            type="email"
            className={fieldClass}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <FieldError msg={fieldErrors.email} />
        </Field>
        <Field label="Phone" required>
          <input
            className={fieldClass}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <FieldError msg={fieldErrors.phone} />
        </Field>
      </div>
      <Field label="Role">
        {roleReadOnly ? (
          <>
            <input
              className={`${fieldClass} cursor-not-allowed bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300`}
              value={roleLabels[String(formData.role || '').toLowerCase()] || formData.role || 'Customer'}
              readOnly
              aria-readonly="true"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Role cannot be changed from the user editor.
            </p>
          </>
        ) : (
          <select
            className={fieldClass}
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          >
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="vendor">Vendor</option>
          </select>
        )}
      </Field>
    </>
  );

  return (
    <div className="space-y-8">
      {/* Add User Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New User">
        <form onSubmit={handleAddUser} className="space-y-4">
          {renderUserFormFields()}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit User">
        <form onSubmit={handleUpdateUser} className="space-y-4">
          {renderUserFormFields({ roleReadOnly: true })}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Users</h2>
          <p className="text-slate-500 text-sm">Manage your platform users and their roles.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { setFormData(emptyForm); setFieldErrors({}); setShowModal(true); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold hover:bg-primary-700 transition-colors">
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <UserStatCard title="Total Users" value={(users?.length || 0).toLocaleString()} icon={UsersIcon} subtitle="In current view" colorClass="bg-blue-600" />
        <UserStatCard title="Online Now" value={onlineCount.toString()} icon={Wifi} subtitle="Active sessions" colorClass="bg-emerald-600" />
        <UserStatCard title="Active Drivers" value={(stats?.activeDrivers || 0).toString()} icon={Truck} subtitle="Fleet on duty" colorClass="bg-amber-600" />
        <UserStatCard title="Suspended" value={suspendedCount.toString()} icon={UserCheck} subtitle="Blocked accounts" colorClass="bg-rose-600" />
      </div>

      {/* Filter & Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-primary-600"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold uppercase cursor-pointer"
          >
            <option value="all">All Users</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="customer">Customer</option>
            <option value="driver">Driver</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {pageItems.length > 0 ? (
                pageItems.map((user) => (
                  <tr key={user.id || `vendor-${user.vendor_id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 font-bold text-xs">
                          {(user.business_name || user.username || user.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {user.business_name || user.username || user.name || 'Unknown'}
                          </span>
                          {user.business_name && user.username && (
                            <span className="text-[10px] text-slate-500">{user.username}</span>
                          )}
                          <span className="text-[10px] text-slate-500 uppercase">ID: {user.id ?? `V-${user.vendor_id}`}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-700 dark:text-slate-300">{user.email || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500">{user.phone || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleStyle(user.role || 'customer')}`}>
                        {user.role || 'Customer'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={user.is_online ? 'online' : 'offline'} />
                        {!user.is_online && (
                          <span className="text-[9px] text-slate-500 uppercase">
                            Last seen {formatLastSeen(user.last_seen)}
                          </span>
                        )}
                        {user.status === 'suspended' && <StatusBadge status="suspended" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEditUser(user)} disabled={!user.id} className={`p-2 rounded-lg transition-colors ${user.id ? 'text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20' : 'text-slate-300 cursor-not-allowed'}`} title={user.id ? 'Edit User' : 'No user account to edit'}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleUpdateStatus(user)} disabled={!user.id} className={`p-2 rounded-lg transition-colors ${!user.id ? 'text-slate-300 cursor-not-allowed' : user.status === 'suspended' ? 'text-success/60 hover:text-success hover:bg-success/10' : 'text-slate-400 hover:text-warning hover:bg-warning/10'}`} title={!user.id ? 'No user account to update' : user.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
                          {user.status === 'suspended' ? <CheckCircle size={14} /> : <Slash size={14} />}
                        </button>
                        <button onClick={() => handleDeleteUser(user)} disabled={!user.id} className={`p-2 rounded-lg transition-colors ${user.id ? 'text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-slate-300 cursor-not-allowed'}`} title={user.id ? 'Delete User' : 'No user account to delete'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">
                    <EmptyState
                      icon={UsersIcon}
                      title="No users found"
                      subtitle={searchTerm ? 'Try adjusting your search or filter.' : 'Users will appear here once they register.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={filteredUsers.length} shown={pageItems.length} onChange={setPage} />
      </div>
    </div>
  );
};

export default UsersPage;
