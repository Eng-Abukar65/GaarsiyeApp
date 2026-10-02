import React from 'react';
import api from '../utils/api';
import {
  Truck,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  Eye,
  TrendingUp,
  ArrowUpRight,
  Download,
  Users,
  X
} from 'lucide-react';
import { filterMockData } from '../utils/filterMockData';
import { useToast, useConfirm, PageLoader, EmptyState, usePagination, Pagination, FormError } from '../components/ui';

const DriverStatCard = ({ title, value, icon: Icon, trend, trendValue, colorClass }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</h3>
      </div>
      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center`}>
        <Icon size={20} className="text-white" />
      </div>
    </div>
    <div className={`flex items-center gap-1 text-[10px] font-bold ${trend === 'up' ? 'text-success' : 'text-danger'}`}>
      {trend === 'up' ? <ArrowUpRight size={12} /> : <TrendingUp size={12} className="rotate-180" />}
      {trendValue} 
      <span className="text-slate-500 font-normal ml-1">Live data</span>
    </div>
  </div>
);

const DriversPage = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [drivers, setDrivers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('All Drivers');
  const [selectedDriver, setSelectedDriver] = React.useState(null);

  const [showModal, setShowModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [editingDriver, setEditingDriver] = React.useState(null);
  const [formError, setFormError] = React.useState('');

  const filteredDrivers = React.useMemo(() => {
    let filtered = drivers || [];
    
    // Search
    if (searchTerm) {
      filtered = filtered.filter(d => 
        ((d.first_name || '') + ' ' + (d.last_name || '')).toLowerCase().includes(searchTerm.toLowerCase()) || 
        (d.username || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Tab filter
    if (activeTab === 'Online Drivers') {
      filtered = filtered.filter(d => d.is_online === 1);
    } else if (activeTab === 'Offline Drivers') {
      filtered = filtered.filter(d => d.is_online === 0);
    }
    
    return filtered;
  }, [drivers, searchTerm, activeTab]);

  const { pageItems, page, setPage, totalPages } = usePagination(filteredDrivers, 10);

  const [formData, setFormData] = React.useState({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    vehicle_type: 'Truck',
    plate_number: '',
    license_number: '',
    address: '',
    status: 'offline',
    vendor_id: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    guardian_name: '', guardian_phone: '',
    sponsor_name: '', sponsor_phone: '', sponsor_address: ''
  });

  const handleExport = () => {
    if (drivers.length === 0) {
      toast.info('No data to export.');
      return;
    }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Vehicle', 'Plate', 'Status'];
    const csvRows = drivers.map(d => [
      d.id,
      `${d.first_name || ''} ${d.last_name || ''}`.trim(),
      d.email,
      d.phone,
      d.vehicle_type,
      d.plate_number,
      d.status
    ].map(esc).join(','));
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drivers_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${drivers.length} drivers.`);
  };

  const handleOnboard = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const response = await api.post('/admin/drivers', formData);
      if (response.status === 200 || response.status === 201) {
        const temporaryPassword = response.data?.initialPassword;
        if (temporaryPassword) {
          toast.success(`Driver onboarded successfully.\nTemporary password: ${temporaryPassword}`, 15000);
        } else {
          toast.success(response.data?.message || 'Driver onboarded successfully.');
        }
        setShowModal(false);
        setFormData({ 
          full_name: '', username: '', email: '', phone: '',
          vehicle_type: 'Truck', plate_number: '', license_number: '', address: '', status: 'offline', vendor_id: '',
          emergency_contact_name: '', emergency_contact_phone: '', guardian_name: '', guardian_phone: '',
          sponsor_name: '', sponsor_phone: '', sponsor_address: ''
        });
        fetchDrivers();
      }
    } catch (err) {
      console.error('Failed to onboard driver', err);
      setFormError(err.response?.data?.message || 'Failed to onboard driver. Please check inputs.');
    }
  };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/drivers');
      setDrivers(filterMockData(response.data));
    } catch (err) {
      console.error('Failed to fetch drivers', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDrivers();
  }, []);

  const handleUpdateStatus = async (driverId, newStatus) => {
    try {
      await api.put(`/admin/drivers/${driverId}`, { status: newStatus });
      fetchDrivers();
    } catch (err) {
      console.error('Failed to update driver status', err);
    }
  };

  const handleEditDriver = (driver) => {
    setFormError('');
    setEditingDriver(driver);
    setFormData({
      full_name: `${driver.first_name} ${driver.last_name}`,
      username: driver.username,
      email: driver.email,
      phone: driver.phone,
      vehicle_type: driver.vehicle_type,
      plate_number: driver.plate_number,
      license_number: driver.license_number,
      address: driver.address,
      status: driver.status,
      vendor_id: driver.vendor_id || '',
      emergency_contact_name: driver.emergency_contact_name || '', emergency_contact_phone: driver.emergency_contact_phone || '',
      guardian_name: driver.guardian_name || '', guardian_phone: driver.guardian_phone || '',
      sponsor_name: driver.guarantor_name || driver.sponsor_name || '',
      sponsor_phone: driver.guarantor_phone || driver.sponsor_phone || '',
      sponsor_address: driver.guarantor_address || driver.sponsor_address || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateDriver = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.put(`/admin/drivers/${editingDriver.id}`, formData);
      toast.success('Driver updated successfully.');
      setShowEditModal(false);
      fetchDrivers();
    } catch (err) {
      console.error('Update driver error', err);
      setFormError(err.response?.data?.message || 'Failed to update driver.');
    }
  };

  const handleDeleteDriver = async (driver) => {
    const ok = await confirm({
      title: 'Remove this driver?',
      message: `${driver.first_name || ''} ${driver.last_name || ''}`.trim() + ' will be permanently removed from the fleet. This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/drivers/${driver.id}`);
      toast.success('Driver removed.');
      fetchDrivers();
    } catch (err) {
      console.error('Delete driver error', err);
      toast.error(err.response?.data?.message || 'Failed to remove driver.');
    }
  };

  if (loading) return <PageLoader label="Loading drivers..." />;

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case 'available': 
      case 'online': return 'text-success bg-success/10';
      case 'busy': return 'text-warning bg-warning/10';
      case 'offline': return 'text-slate-500 bg-slate-500/10';
      default: return 'text-slate-500 bg-slate-500/10';
    }
  };

  return (
    <div className="space-y-10">
      {/* Onboard Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Register New Driver</h3>
              <form onSubmit={handleOnboard} className="space-y-5">
                 <FormError message={formError} />
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Full Name</label>
                      <input 
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="John Doe"
                        value={formData.full_name}
                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Username</label>
                      <input 
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="johndoe123"
                        value={formData.username}
                        onChange={e => setFormData({...formData, username: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Email</label>
                      <input 
                        required
                        type="email"
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="driver@example.com"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Phone</label>
                      <input 
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="+252..."
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2 flex items-end">
                     <p className="text-xs text-slate-500">A random initial password will be emailed securely.</p>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Vehicle Type</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="Truck, Van, etc."
                        value={formData.vehicle_type}
                        onChange={e => setFormData({...formData, vehicle_type: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Plate Number</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="ABC-1234"
                        value={formData.plate_number}
                        onChange={e => setFormData({...formData, plate_number: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">License Number</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="LIC-123456"
                        value={formData.license_number}
                        onChange={e => setFormData({...formData, license_number: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2 col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Address</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="Driver Address"
                        value={formData.address}
                        onChange={e => setFormData({...formData, address: e.target.value})}
                      />
                   </div>
                   {[
                     ['Emergency Contact Name', 'emergency_contact_name'], ['Emergency Contact Phone', 'emergency_contact_phone'],
                     ['Parent / Guardian Name', 'guardian_name'], ['Parent / Guardian Phone', 'guardian_phone'],
                     ['Sponsor Name', 'sponsor_name'], ['Sponsor Phone', 'sponsor_phone'],
                     ['Sponsor Address', 'sponsor_address']
                   ].map(([label, key]) => (
                     <div key={key} className={`space-y-2 ${key === 'sponsor_address' ? 'col-span-2' : ''}`}>
                       <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">{label}</label>
                       <input required className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white"
                         value={formData[key]} onChange={e => setFormData({...formData, [key]: e.target.value})} />
                     </div>
                   ))}
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Assigned Vendor ID (Optional)</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        placeholder="Vendor ID"
                        value={formData.vendor_id}
                        onChange={e => setFormData({...formData, vendor_id: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Status</label>
                      <select
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.status}
                        onChange={e => setFormData({...formData, status: e.target.value})}
                      >
                         <option value="offline">Offline</option>
                         <option value="available">Available</option>
                         <option value="busy">Busy</option>
                      </select>
                   </div>
                 </div>
                 <div className="flex justify-end gap-4 mt-8">
                    <button 
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-8 py-3 text-slate-600 dark:text-slate-400 font-bold text-sm hover:text-slate-900 dark:text-white transition-colors"
                    >
                       Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-10 py-3 bg-primary-600 text-white font-bold rounded-2xl shadow-lg shadow-primary-600/20 hover:bg-primary-500 transition-all"
                    >
                       Register Driver
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Driver Details Modal */}
      {selectedDriver && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button onClick={() => setSelectedDriver(null)} aria-label="Close" className="absolute top-6 right-6 p-2 -m-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={18} /></button>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Driver Details</h3>
              <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Full Name:</strong> <span className="text-slate-900 dark:text-white text-base">{selectedDriver.first_name} {selectedDriver.last_name}</span></p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Username:</strong> {selectedDriver.username || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Email:</strong> {selectedDriver.email || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Phone:</strong> {selectedDriver.phone || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Vehicle Type:</strong> {selectedDriver.vehicle_type || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Plate Number:</strong> {selectedDriver.plate_number || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">License Number:</strong> {selectedDriver.license_number || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Address:</strong> {selectedDriver.address || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Emergency Contact:</strong> {selectedDriver.emergency_contact_name || 'N/A'} - {selectedDriver.emergency_contact_phone || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Parent / Guardian:</strong> {selectedDriver.guardian_name || 'N/A'} - {selectedDriver.guardian_phone || 'N/A'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Sponsor:</strong> {selectedDriver.sponsor_name || 'N/A'} - {selectedDriver.sponsor_phone || 'N/A'} ({selectedDriver.sponsor_address || 'No address'})</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Assigned Vendor:</strong> {selectedDriver.vendor_name || 'None'}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Total Deliveries:</strong> {selectedDriver.total_deliveries || 0}</p>
                <p><strong className="text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest block mb-1">Rating:</strong> {selectedDriver.rating || 'N/A'}</p>
              </div>
           </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Drivers</h2>
          <p className="text-slate-500 text-sm">Manage your delivery personnel.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-slate-50 transition-colors">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { setFormError(''); setShowModal(true); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold hover:bg-primary-700 transition-colors">
            <UserPlus size={16} /> Add Driver
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DriverStatCard title="Total Drivers" value={(drivers?.length || 0).toLocaleString()} icon={Users} trend="up" trendValue="Live" colorClass="bg-blue-600" />
        <DriverStatCard title="Available Drivers" value={(drivers?.filter(d => d.is_online === 1 && d.status !== 'busy').length || 0).toString()} icon={Truck} trend="up" trendValue="Online" colorClass="bg-teal-600" />
        <DriverStatCard title="Busy Deliveries" value={(drivers?.filter(d => d.status === 'busy').length || 0).toString()} icon={TrendingUp} trend="up" trendValue="In transit" colorClass="bg-indigo-600" />
      </div>

      {/* List Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex gap-4">
            {['All Drivers', 'Online Drivers', 'Offline Drivers'].map((tab) => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
             <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:outline-primary-600 w-48"
                />
             </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Driver</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vehicle Info</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {pageItems.length > 0 ? (
                pageItems.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 font-bold text-xs">
                          {(d.first_name || d.username || 'D').substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{d.first_name} {d.last_name}</p>
                          <p className="text-[10px] text-slate-500">{d.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                      <p className="text-xs font-medium">{d.vehicle_type || 'N/A'}</p>
                      <p className="text-[10px]">{d.plate_number || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        d.status === 'busy' ? 'text-indigo-600 bg-indigo-500/10' : 
                        d.is_online === 1 ? 'text-success bg-success/10' : 'text-slate-500 bg-slate-500/10'
                      }`}>
                        {d.status === 'busy' ? 'Busy' : d.is_online === 1 ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                      {d.vendor_name || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedDriver(d)} className="p-2 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors" title="View Details">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleEditDriver(d)} className="p-2 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors" title="Edit Driver">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteDriver(d)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove Driver">
                           <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">
                    <EmptyState
                      icon={Truck}
                      title="No drivers found"
                      subtitle={searchTerm ? 'Try adjusting your search or filter.' : 'Register your first driver to build the fleet.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={filteredDrivers.length} shown={pageItems.length} onChange={setPage} />
      </div>
      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Update Driver Profile</h3>
              <form onSubmit={handleUpdateDriver} className="space-y-5">
                 <FormError message={formError} />
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Full Name</label>
                      <input 
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.full_name}
                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Email</label>
                      <input 
                        required
                        type="email"
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Phone</label>
                      <input 
                        required
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Vehicle Type</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.vehicle_type}
                        onChange={e => setFormData({...formData, vehicle_type: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Plate Number</label>
                      <input 
                        className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-2xl py-3 px-5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
                        value={formData.plate_number}
                        onChange={e => setFormData({...formData, plate_number: e.target.value})}
                      />
                   </div>
                 </div>
                 <div className="flex justify-end gap-4 mt-8">
                    <button 
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="px-8 py-3 text-slate-600 dark:text-slate-400 font-bold text-sm hover:text-slate-900 dark:text-white transition-colors"
                    >
                       Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-10 py-3 bg-primary-600 text-white font-bold rounded-2xl shadow-lg shadow-primary-600/20 hover:bg-primary-500 transition-all"
                    >
                       Update Driver
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default DriversPage;
