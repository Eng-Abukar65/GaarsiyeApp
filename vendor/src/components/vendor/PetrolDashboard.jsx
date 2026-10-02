import React from 'react';
import {
  Fuel, Droplet, Banknote, ClipboardList, CheckCircle2, Truck, Warehouse,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import api from '../../utils/api';
import {
  StatCard, ChartCard, TableCard, OrderStatusBadge, StockStatusBadge, DashboardLoading,
  DashboardError, ModuleHeader, useModuleStats, money, num, dayLabel, BLUE, GREEN, AMBER,
} from './dashboardUi';

const PetrolDashboard = () => {
  const { data, loading, error, reload } = useModuleStats(api, 'petrol');

  if (loading) return <DashboardLoading label="Loading Petrol Station dashboard…" />;
  if (error) return <DashboardError message={error} onRetry={reload} />;

  const { cards, charts, tables } = data;

  return (
    <section className="space-y-6">
      <ModuleHeader
        icon={Fuel}
        title="Petrol Station Dashboard"
        subtitle="Fuel stock levels, sales, and delivery performance."
        onRefresh={reload}
        accent="bg-blue-600 shadow-blue-600/20"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={Fuel} tone="blue" label="Petrol Stock" value={num(cards.petrol_stock)} sub="Liters" />
        <StatCard icon={Droplet} tone="amber" label="Diesel Stock" value={num(cards.diesel_stock)} sub="Liters" />
        <StatCard icon={Banknote} tone="green" label="Total Revenue" value={money(cards.total_revenue)} sub="Delivered" />
        <StatCard icon={ClipboardList} tone="amber" label="Pending Orders" value={num(cards.pending_orders)} />
        <StatCard icon={CheckCircle2} tone="green" label="Completed Orders" value={num(cards.completed_orders)} />
        <StatCard icon={Truck} tone="sky" label="Active Deliveries" value={num(cards.active_deliveries)} />
        <StatCard icon={Warehouse} tone="indigo" label="Fuel Inventory" value={money(cards.inventory_value)} sub="Stock value" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Petrol vs Diesel Sales (last 7 days)" empty={!(charts.fuel_split || []).length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.fuel_split || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="petrol" name="Petrol" fill={BLUE} radius={[6, 6, 0, 0]} />
              <Bar dataKey="diesel" name="Diesel" fill={AMBER} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue Trend" empty={!charts.daily.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="revenue" stroke={GREEN} strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fuel Volume Sold" empty={!charts.daily.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} />
              <Bar dataKey="quantity" name="Liters" fill={BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Deliveries (last 7 days)" empty={!charts.daily_deliveries.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.daily_deliveries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} />
              <Bar dataKey="deliveries" fill={GREEN} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Fuel inventory — only this module's products */}
      <TableCard
        title="Fuel Inventory"
        headers={['Product', 'Stock', 'Unit', 'Price', 'Stock Value', 'Status']}
        emptyLabel="No fuel products in inventory yet"
        rows={tables.inventory.map((p) => (
          <tr key={p.id} className="hover:bg-surface-container-low/30 transition-colors">
            <td className="py-3 px-5 font-medium capitalize">{p.name}</td>
            <td className="py-3 px-5 font-bold">{num(p.stock)}</td>
            <td className="py-3 px-5 text-on-surface-variant">{p.unit || '—'}</td>
            <td className="py-3 px-5">{money(p.selling_price)}</td>
            <td className="py-3 px-5 font-bold">{money(p.stock_value)}</td>
            <td className="py-3 px-5"><StockStatusBadge status={p.status} /></td>
          </tr>
        ))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TableCard
          title="Recent Orders"
          headers={['Order', 'Customer', 'Amount', 'Status']}
          emptyLabel="No fuel orders yet"
          rows={tables.recent_orders.map((o) => (
            <tr key={o.id} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-bold text-blue-700">#{String(o.id).padStart(4, '0')}</td>
              <td className="py-3 px-5">{o.customer_name}</td>
              <td className="py-3 px-5 font-bold">{money(o.amount)}</td>
              <td className="py-3 px-5"><OrderStatusBadge status={o.status} /></td>
            </tr>
          ))}
        />

        <TableCard
          title="Fuel Transactions"
          headers={['Order', 'Liters', 'Amount', 'Payment']}
          emptyLabel="No fuel transactions yet"
          rows={tables.recent_orders.map((o) => (
            <tr key={`tx-${o.id}`} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-bold text-blue-700">#{String(o.id).padStart(4, '0')}</td>
              <td className="py-3 px-5">{num(o.quantity)}</td>
              <td className="py-3 px-5 font-bold">{money(o.amount)}</td>
              <td className="py-3 px-5"><OrderStatusBadge status={o.payment_status || 'unpaid'} /></td>
            </tr>
          ))}
        />
      </div>
    </section>
  );
};

export default PetrolDashboard;
