'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Store,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalShops: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  trialSubscriptions: number;
  waitlistCount: number;
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
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

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
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
            Real-time merchant monitoring, subscription plans, and platform stats.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Merchants
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
      </div>

      <div className="max-w-xl">
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
          </div>
        </div>
      </div>
    </div>
  );
}
