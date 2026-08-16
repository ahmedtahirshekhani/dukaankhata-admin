'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  Store,
  Phone,
  Mail,
  Ban,
  Trash2,
  Filter,
  Activity,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  shopName: string;
  phone?: string;
  subscription: {
    plan: string;
    status: string;
    expiresAt: string;
  };
  monthlyRevenue: number;
  totalTransactions: number;
  lastActivity?: string;
  createdAt: string;
}

type SortField = 'lastActivity' | 'name' | 'shopName' | 'expiry' | 'revenue';

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [subStateFilter, setSubStateFilter] = useState('all');

  // Sorting State - Default: Last Activity Recent on top
  const [sortBy, setSortBy] = useState<SortField>('lastActivity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination State (Max 20 per page)
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Renewal Modal State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [renewalDays, setRenewalDays] = useState(30);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro');
  const [renewing, setRenewing] = useState(false);

  // Delete Confirmation Modal State (Only for BLOCKED users)
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionSuccess, setActionSuccess] = useState('');

  // Fetch real users with multi-filter, sorting & pagination query
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (statusFilter !== 'all') query.set('status', statusFilter);
      if (planFilter !== 'all') query.set('plan', planFilter);
      if (subStateFilter !== 'all') query.set('subState', subStateFilter);
      query.set('sortBy', sortBy);
      query.set('sortOrder', sortOrder);
      query.set('page', page.toString());
      query.set('limit', limit.toString());

      const res = await fetch(`/api/admin/users?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setTotalUsers(data.totalUsers || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch merchants:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter, subStateFilter, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to Page 1 when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  // Column Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Block / Suspend / Unblock merchant
  const handleToggleStatus = async (user: User) => {
    const isCurrentlyBlocked =
      user.status === 'suspended' ||
      user.status === 'blocked' ||
      user.subscription?.status === 'login_blocked';
    const newStatus = isCurrentlyBlocked ? 'active' : 'suspended';

    try {
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(
          newStatus === 'suspended'
            ? `Blocked merchant ${user.name}. Access restricted.`
            : `Unblocked merchant ${user.name}. Account reactivated.`
        );
        setTimeout(() => setActionSuccess(''), 3500);
        fetchUsers();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  // Renew Subscription
  const handleRenewSubscription = async () => {
    if (!selectedUser) return;
    setRenewing(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser._id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: renewalDays, plan: selectedPlan }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        setTimeout(() => setActionSuccess(''), 4000);
        setSelectedUser(null);
        fetchUsers();
      }
    } catch (err) {
      console.error('Renewal error:', err);
    } finally {
      setRenewing(false);
    }
  };

  // Confirm and execute full purge deletion for blocked merchant
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message || `Blocked merchant ${userToDelete.name} and all data deleted.`);
        setTimeout(() => setActionSuccess(''), 4000);
        setUserToDelete(null);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to delete merchant user.');
      }
    } catch (err) {
      console.error('Delete user error:', err);
      alert('An unexpected error occurred while deleting user.');
    } finally {
      setDeleting(false);
    }
  };

  // Format relative last activity time
  const formatLastActivity = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} mins ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
    if (diffSeconds < 172800) return 'Yesterday';
    if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)} days ago`;
    return date.toLocaleDateString();
  };

  // Format subscription status in brackets
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

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40 ml-1 inline" />;
    return sortOrder === 'desc' ? (
      <ArrowDown className="w-3 h-3 text-sky-600 ml-1 inline font-bold" />
    ) : (
      <ArrowUp className="w-3 h-3 text-sky-600 ml-1 inline font-bold" />
    );
  };

  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, totalUsers);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Merchant Directory</h2>
          <p className="text-xs text-slate-500">
            Filter, sort by recent activity, renew plans, or delete blocked merchants (Max 20 per page)
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition self-start sm:self-auto shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
      )}

      {/* Multi-Filters Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-sky-600" />
            <span>Filter & Sort Merchants</span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Sorted by: <span className="text-sky-700 font-bold capitalize">{sortBy === 'lastActivity' ? 'Last Activity (Recent on Top)' : sortBy}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              placeholder="Search name, email, or shop..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
            />
          </div>

          {/* Account Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Blocked / Suspended</option>
            </select>
          </div>

          {/* Subscription Plan Filter */}
          <div>
            <select
              value={planFilter}
              onChange={(e) => handleFilterChange(setPlanFilter, e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer font-medium"
            >
              <option value="all">All Plans</option>
              <option value="trial">Trial Plan</option>
              <option value="starter">Starter Plan</option>
              <option value="pro">Pro Plan</option>
              <option value="enterprise">Enterprise Plan</option>
            </select>
          </div>

          {/* Expiry State Filter */}
          <div>
            <select
              value={subStateFilter}
              onChange={(e) => handleFilterChange(setSubStateFilter, e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer font-medium"
            >
              <option value="all">All Expirations</option>
              <option value="active">Active Subscriptions</option>
              <option value="expiring_soon">Expiring Soon (≤ 7 Days)</option>
              <option value="expired">Expired Subscriptions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Table with Column Sorting */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Merchant Details</span>
                  {renderSortIcon('name')}
                </th>
                <th
                  onClick={() => handleSort('shopName')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Shop Name</span>
                  {renderSortIcon('shopName')}
                </th>
                <th className="py-3.5 px-5">Account Status</th>
                <th
                  onClick={() => handleSort('expiry')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Subscription Plan</span>
                  {renderSortIcon('expiry')}
                </th>

                {/* LAST ACTIVITY SORTABLE COLUMN */}
                <th
                  onClick={() => handleSort('lastActivity')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition bg-sky-50/50"
                >
                  <span className="font-bold text-sky-700">Last Activity</span>
                  {renderSortIcon('lastActivity')}
                </th>

                <th
                  onClick={() => handleSort('revenue')}
                  className="py-3.5 px-5 text-right cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Invoiced Revenue</span>
                  {renderSortIcon('revenue')}
                </th>
                <th className="py-3.5 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-600" />
                    <span>Loading merchants...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No merchant accounts match your filter & sorting criteria.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isBlocked =
                    user.status === 'suspended' ||
                    user.status === 'blocked' ||
                    user.subscription?.status === 'login_blocked';

                  const expiryDate = user.subscription?.expiresAt
                    ? new Date(user.subscription.expiresAt)
                    : null;
                  const isExpired = expiryDate ? expiryDate < new Date() : false;
                  const daysRemaining = expiryDate
                    ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 3600 * 24))
                    : 0;

                  const subStatusText = formatSubStatus(user);

                  return (
                    <tr key={user._id} className="hover:bg-slate-50 transition">
                      {/* Name & Email */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                              <span>{user.name}</span>
                              {user.role === 'admin' && (
                                <span className="px-1.5 py-0.5 text-[9px] bg-sky-100 text-sky-700 border border-sky-200 rounded font-semibold uppercase">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Shop Name */}
                      <td className="py-3.5 px-5 font-semibold text-slate-700">
                        {user.shopName || 'N/A'}
                        {user.phone && <div className="text-slate-400 text-[11px] font-normal">{user.phone}</div>}
                      </td>

                      {/* Account Status */}
                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isBlocked
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isBlocked ? (
                            <>
                              <Ban className="w-3 h-3 text-rose-600" />
                              <span>BLOCKED</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>ACTIVE</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* SUBSCRIPTION PLAN WITH STATUS IN BRACKET: Pro (Active) */}
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-sky-700 text-xs">
                          <span className="capitalize">{user.subscription?.plan || 'trial'}</span>{' '}
                          <span className={`text-[11px] font-semibold ${
                            isBlocked || isExpired ? 'text-rose-600' : 'text-slate-500'
                          }`}>
                            ({subStatusText})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {!isBlocked && !isExpired && (
                            <span>{daysRemaining} days left • Exp: {expiryDate?.toLocaleDateString()}</span>
                          )}
                          {isExpired && !isBlocked && (
                            <span className="text-rose-600 font-semibold">Expired on {expiryDate?.toLocaleDateString()}</span>
                          )}
                          {isBlocked && (
                            <span className="text-rose-600 font-semibold">Access Restricted</span>
                          )}
                        </div>
                      </td>

                      {/* USER LAST ACTIVITY COLUMN */}
                      <td className="py-3.5 px-5 bg-sky-50/20">
                        <div className="flex items-center space-x-1 text-slate-900 font-bold text-[11px]">
                          <Activity className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>{formatLastActivity(user.lastActivity)}</span>
                        </div>
                        {user.lastActivity && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(user.lastActivity).toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Revenue */}
                      <td className="py-3.5 px-5 text-right font-extrabold text-slate-900">
                        Rs. {(user.monthlyRevenue || 0).toLocaleString()}
                      </td>

                      {/* Action Buttons: Renew, Block/Unblock, Delete User (Only for BLOCKED users) */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* RENEW BUTTON */}
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setSelectedPlan((user.subscription?.plan?.toLowerCase() as any) || 'pro');
                            }}
                            className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shadow-xs transition"
                          >
                            <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                            <span>Renew</span>
                          </button>

                          {/* BLOCK / UNBLOCK BUTTON */}
                          <button
                            onClick={() => handleToggleStatus(user)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold border transition ${
                              isBlocked
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isBlocked ? 'Unblock' : 'Block'}
                          </button>

                          {/* DELETE USER BUTTON (DISPLAYED ONLY IF ACCOUNT STATUS IS BLOCKED) */}
                          {user.role !== 'admin' && isBlocked && (
                            <button
                              onClick={() => setUserToDelete(user)}
                              title="Delete blocked merchant completely with all data"
                              className="p-1 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS BAR */}
        {!loading && totalUsers > 0 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing <span className="font-bold text-slate-900">{startIndex}</span> to{' '}
              <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
              <span className="font-bold text-slate-900">{totalUsers}</span> merchants
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold flex items-center space-x-1 transition disabled:opacity-40 disabled:hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="px-3 py-1 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold flex items-center space-x-1 transition disabled:opacity-40 disabled:hover:bg-white"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RENEWAL MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>Renew Subscription: {selectedUser.name}</span>
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['starter', 'pro', 'enterprise'] as const).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`py-2 rounded-xl font-bold uppercase border transition ${
                        selectedPlan === plan
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '+30 Days', days: 30 },
                    { label: '+90 Days', days: 90 },
                    { label: '+1 Year', days: 365 },
                  ].map((opt) => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setRenewalDays(opt.days)}
                      className={`py-2 rounded-xl font-semibold border transition ${
                        renewalDays === opt.days
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleRenewSubscription}
                disabled={renewing}
                className="flex-1 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-sky-600/20 flex items-center justify-center space-x-1 disabled:opacity-50"
              >
                {renewing ? 'Saving...' : 'Confirm Renewal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL POPUP (FOR BLOCKED MERCHANTS ONLY) */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">Confirm Permanent Deletion</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to permanently delete this blocked merchant?
                </p>
              </div>
              <button
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Merchant Details Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Merchant:</span>
                <span className="font-bold text-slate-900">{userToDelete.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-mono text-slate-700">{userToDelete.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Shop Name:</span>
                <span className="font-semibold text-slate-800">{userToDelete.shopName || 'N/A'}</span>
              </div>
            </div>

            {/* Purge Warning Alert */}
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium rounded-xl space-y-1 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Permanent Cascade Purge:</span>
                <p className="mt-0.5 text-rose-700">
                  This will permanently delete the user account, associated shops, sales invoices, ledger transactions, product inventories, and subscription records across all collections.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-rose-600/20 flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? 'Purging Data...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
