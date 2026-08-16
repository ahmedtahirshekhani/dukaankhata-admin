'use client';

import { useState, useEffect } from 'react';
import { Receipt, RefreshCw, Store, CheckCircle2, ShoppingBag, DollarSign } from 'lucide-react';

interface Order {
  _id: string;
  invoiceNo: string;
  merchantName: string;
  shopName: string;
  customerName: string;
  totalAmount: number;
  status: string;
  date: string;
}

export default function StoreOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Store Sales Invoices</h2>
          <p className="text-xs text-slate-500">
            Real customer sales invoices recorded across all DukaanKhata merchant stores
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition self-start sm:self-auto shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          <span>Refresh Invoices</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-5">Invoice #</th>
                <th className="py-3.5 px-5">Merchant & Shop</th>
                <th className="py-3.5 px-5">Customer Name</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5 text-right">Invoice Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-600" />
                    <span>Loading store invoices...</span>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No store sales invoices recorded yet.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o._id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-5 font-mono font-bold text-sky-700">
                      {o.invoiceNo}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-slate-900">{o.merchantName}</div>
                      <div className="text-slate-500 text-[11px] flex items-center space-x-1 mt-0.5">
                        <Store className="w-3 h-3 text-slate-400" />
                        <span>{o.shopName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 font-semibold">
                      {o.customerName}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-slate-500 text-[11px]">
                      {new Date(o.date).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold text-slate-900 text-sm">
                      Rs. {o.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
