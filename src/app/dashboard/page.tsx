'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Store,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Database,
  ArrowUpRight,
  Receipt,
} from 'lucide-react';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalShops: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  trialSubscriptions: number;
  totalRevenue: number;
  totalOrders: number;
  waitlistCount: number;
}

interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  shopName: string;
  status: string;
  subscription: {
    plan: string;
    status: string;
    expiresAt: string;
  };
  monthlyRevenue: number;
  createdAt: string;
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentUsers(data.recentUsers || []);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatSubStatus = (user: User) => {
    const isBlocked =
      user.status === 'suspended' ||
      user.status === 'blocked' ||
      user.subscription?.status === 'login_blocked';

    const expiryDate = user.subscription?.expiresAt
      ? new Date(user.subscription.expiresAt)
      : null;
    const isExpired = expiryDate ? expiryDate < new Date() : false;

    if (isBlocked) return 'Login Blocked';
    if (isExpired) return 'Expired';
    const subStat = (user.subscription?.status || 'active').toLowerCase();
    if (subStat === 'in_trial' || subStat === 'trial') return 'Trial';
    if (subStat === 'active') return 'Active';
    return subStat.replace('_', ' ');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
      {/* Hero Header Banner */}
      <div className="bg-gradient-to-r from-sky-600 via-sky-700 to-cyan-600 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl shadow-sky-600/10">
        <div className="space-y-2 max-w-2xl z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/20 text-white rounded-full text-xs font-semibold backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DukaanKhata Super Admin Dashboard</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Platform Executive Control Center
          </h2>
          <p className="text-xs md:text-sm text-sky-100 opacity-90">
            Real-time merchant monitoring, subscription plans, and platform revenue stats.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 z-10 w-full md:w-auto">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition backdrop-blur-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Stats</span>
          </button>

          <Link
            href="/dashboard/users"
            className="w-full sm:w-auto px-4 py-2.5 bg-white text-sky-700 hover:bg-sky-50 rounded-xl text-xs font-bold shadow-lg flex items-center justify-center space-x-2 transition"
          >
            <Users className="w-4 h-4" />
            <span>Manage Merchants</span>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Merchants */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Registered Merchants
            </span>
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900">{stats?.totalUsers ?? 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              {stats?.totalShops ?? 0} total active shop workspaces
            </p>
          </div>
        </div>

        {/* Account Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Accounts
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-emerald-600">{stats?.activeUsers ?? 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              {stats?.suspendedUsers ?? 0} blocked / suspended
            </p>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Subscriptions
            </span>
            <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-teal-600">
              {stats?.activeSubscriptions ?? 0}
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
              <span className="text-amber-600 font-semibold">{stats?.trialSubscriptions ?? 0} trial</span>
              <span>•</span>
              <span className="text-rose-600 font-semibold">{stats?.expiredSubscriptions ?? 0} expired</span>
            </div>
          </div>
        </div>

        {/* Total Invoiced Volume */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Invoiced Revenue
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-slate-900">
              Rs. {(stats?.totalRevenue ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {(stats?.totalOrders ?? 0).toLocaleString()} total recorded store sales
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Merchant Directory Preview Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Registered Merchants</h3>
              <p className="text-xs text-slate-500">Latest merchant store signups</p>
            </div>

            <Link
              href="/dashboard/users"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center space-x-1"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Merchant & Contact</th>
                  <th className="py-3 px-4">Shop Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Subscription Plan</th>
                  <th className="py-3 px-4 text-right">Invoiced Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No merchants found.
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{user.name}</div>
                        <div className="text-slate-500 text-[11px]">{user.email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {user.shopName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            user.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sky-700 text-xs">
                          <span className="capitalize">{user.subscription?.plan || 'trial'}</span>{' '}
                          <span className="text-[11px] font-semibold text-slate-500">
                            ({formatSubStatus(user)})
                          </span>
                        </div>
                        <div className="text-slate-400 text-[10px] mt-0.5">
                          Exp:{' '}
                          {user.subscription?.expiresAt
                            ? new Date(user.subscription.expiresAt).toLocaleDateString()
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        Rs. {(user.monthlyRevenue || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Store className="w-5 h-5 text-sky-600" />
              <span>Super Admin Actions</span>
            </h3>

            <div className="space-y-3">
              <Link
                href="/dashboard/users"
                className="w-full flex items-center justify-between p-3.5 bg-sky-50 hover:bg-sky-100/80 border border-sky-200/80 rounded-xl transition text-xs font-semibold text-sky-800"
              >
                <span>Renew Merchant Subscriptions</span>
                <ArrowUpRight className="w-4 h-4 text-sky-600" />
              </Link>

              <Link
                href="/dashboard/users?status=suspended"
                className="w-full flex items-center justify-between p-3.5 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/80 rounded-xl transition text-xs font-semibold text-rose-800"
              >
                <span>View Blocked Accounts</span>
                <ArrowUpRight className="w-4 h-4 text-rose-600" />
              </Link>

              <Link
                href="/dashboard/orders"
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition text-xs font-semibold text-slate-700"
              >
                <span>View Store Invoices</span>
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
