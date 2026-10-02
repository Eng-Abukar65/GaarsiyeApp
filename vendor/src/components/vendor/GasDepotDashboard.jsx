import React from 'react';
import {
  Flame, Boxes, PackageCheck, PackageX, TriangleAlert, Banknote,
  ClipboardList, CheckCircle2, Truck, Warehouse,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import api from '../../utils/api';
import {
  StatCard, ChartCard, TableCard, OrderStatusBadge, StockStatusBadge, DashboardLoading,
  DashboardError, ModuleHeader, useModuleStats, money, num, dayLabel, BLUE, GREEN, AMBER,
} from './dashboardUi';

const GasDepotDashboard = () => {
  const { data, loading, error, reload } = useModuleStats(api, 'gas');

  if (loading) return <DashboardLoading label="Loading Gas Depot dashboard…" />;
  if (error) return <DashboardError message={error} onRetry={reload} />;

  const { cards, charts, tables } = data;

  return (
    <section className="space-y-6">
      <ModuleHeader
        icon={Flame}
        title="Gas Depot Dashboard"
        subtitle="Cylinder stock, gas orders, and delivery performance."
        onRefresh={reload}
        accent="bg-orange-500 shadow-orange-500/20"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Flame} tone="amber" label="LPG Stock" value={num(cards.total_stock)} sub="Units / KG" />
        <StatCard icon={Boxes} tone="indigo" label="Cylinder Types" value={num(cards.cylinder_types)} />
        <StatCard icon={PackageCheck} tone="green" label="Filled Cylinders" value={num(cards.filled_cylinders)} sub="In stock" />
        <StatCard icon={PackageX} tone="slate" label="Empty Cylinders" value={num(cards.empty_cylinders)} sub="Not tracked" />
        <StatCard icon={TriangleAlert} tone="red" label="Low Stock" value={num(cards.low_stock)} sub="Below threshold" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Banknote} tone="green" label="Today's Sales" value={money(cards.today_sales)} />
        <StatCard icon={Banknote} tone="blue" label="Total Revenue" value={money(cards.total_revenue)} sub="Delivered orders" />
        <StatCard icon={ClipboardList} tone="amber" label="Pending Orders" value={num(cards.pending_orders)} />
        <StatCard icon={CheckCircle2} tone="green" label="Completed Orders" value={num(cards.completed_orders)} />
        <StatCard icon={Truck} tone="sky" label="Active Deliveries" value={num(cards.active_deliveries)} />
        <StatCard icon={Warehouse} tone="indigo" label="Gas Inventory" value={money(cards.inventory_value)} sub="Stock value" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Gas Sales (last 7 days)" empty={!charts.daily.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip labelFormatter={dayLabel} />
              <Bar dataKey="quantity" name="Units sold" fill={AMBER} radius={[6, 6, 0, 0]} />
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

        <ChartCard title="Inventory Movement (current stock)" empty={!charts.inventory.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.inventory} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="stock" fill={BLUE} radius={[0, 6, 6, 0]} />
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

      {/* Gas inventory — only this module's products */}
      <TableCard
        title="Gas Inventory"
        headers={['Product', 'Stock', 'Unit', 'Price', 'Stock Value', 'Status']}
        emptyLabel="No gas products in inventory yet"
        rows={tables.inventory.map((p) => (
          <tr key={p.id} className="hover:bg-surface-container-low/30 transition-colors">
            <td className="py-3 px-5 font-medium">{p.name}</td>
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
          headers={['Order', 'Customer', 'Qty', 'Amount', 'Status']}
          emptyLabel="No gas orders yet"
          rows={tables.recent_orders.map((o) => (
            <tr key={o.id} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-bold text-blue-700">#{String(o.id).padStart(4, '0')}</td>
              <td className="py-3 px-5">{o.customer_name}</td>
              <td className="py-3 px-5">{num(o.quantity)}</td>
              <td className="py-3 px-5 font-bold">{money(o.amount)}</td>
              <td className="py-3 px-5"><OrderStatusBadge status={o.status} /></td>
            </tr>
          ))}
        />

        <TableCard
          title="Stock Alerts"
          headers={['Product', 'Stock', 'Unit']}
          emptyLabel="All gas stock is healthy"
          rows={tables.low_stock_products.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="hover:bg-surface-container-low/30 transition-colors">
              <td className="py-3 px-5 font-medium">{p.name}</td>
              <td className="py-3 px-5 font-bold text-red-600">{num(p.stock)}</td>
              <td className="py-3 px-5 text-on-surface-variant">{p.unit || '—'}</td>
            </tr>
          ))}
        />
      </div>
    </section>
  );
};

export default GasDepotDashboard;
