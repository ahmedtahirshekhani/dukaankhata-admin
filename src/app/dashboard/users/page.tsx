'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  Store,
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
  MessageSquare,
} from 'lucide-react';
import {
  canDeleteMerchant,
  getCycleDays,
  PRO_MONTHLY_AMOUNT,
  PRO_YEARLY_AMOUNT,
  type BillingCycle,
} from '@/lib/subscriptions';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format-date';

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
    amount?: number;
    billingCycle?: string;
  };
  monthlyRevenue: number;
  totalTransactions: number;
  lastActivity?: string;
  createdAt: string;
}

type SortField = 'lastActivity' | 'name' | 'shopName' | 'expiry' | 'revenue' | 'orders' | 'createdAt';

const PRO_BILLING_OPTIONS: { label: string; cycle: BillingCycle; days: number; amount: number }[] = [
  { label: 'Monthly', cycle: 'monthly', days: getCycleDays('monthly'), amount: PRO_MONTHLY_AMOUNT },
  { label: 'Yearly', cycle: 'yearly', days: getCycleDays('yearly'), amount: PRO_YEARLY_AMOUNT },
];

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearchRef = useRef('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [subStateFilter, setSubStateFilter] = useState('all');
  const initializedFromUrl = useRef(false);

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
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [renewing, setRenewing] = useState(false);

  // Delete Confirmation Modal State ((blocked or expired) and inactive 60+ days)
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;

    const params = new URLSearchParams(window.location.search);
    const urlStatus = params.get('status');
    const urlPlan = params.get('plan');
    const urlSubState = params.get('subState');
    const urlSearch = params.get('search');

    if (urlStatus) setStatusFilter(urlStatus);
    if (urlPlan) setPlanFilter(urlPlan);
    if (urlSubState) setSubStateFilter(urlSubState);
    if (urlSearch) {
      setSearchInput(urlSearch);
      setSearch(urlSearch);
      debouncedSearchRef.current = urlSearch;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearchRef.current !== searchInput) {
        debouncedSearchRef.current = searchInput;
        setSearch(searchInput);
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
        if (data.page && data.page !== page) {
          setPage(data.page);
        }
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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, statusFilter, planFilter, subStateFilter, sortBy, sortOrder]);

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
        body: JSON.stringify({
          days: renewalDays,
          plan: 'pro',
          billingCycle,
        }),
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

  // Confirm and execute full purge deletion for inactive merchant
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message || `Merchant ${userToDelete.name} and all data deleted.`);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);

    try {
      const res = await fetch('/api/admin/users/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        setTimeout(() => setActionSuccess(''), 5000);
        setBulkDeleteOpen(false);
        setSelectedIds(new Set());
        fetchUsers();
      } else {
        alert(data.error || 'Failed to delete selected merchants.');
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('An unexpected error occurred while deleting merchants.');
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
    return formatDisplayDate(date);
  };

  const canDeleteUser = (user: User) =>
    canDeleteMerchant({
      role: user.role,
      userStatus: user.status,
      subStatus: user.subscription?.status,
      subPlan: user.subscription?.plan,
      expiresAt: user.subscription?.expiresAt,
      lastActivity: user.lastActivity,
      createdAt: user.createdAt,
    });

  const deletableUsersOnPage = users.filter(canDeleteUser);
  const selectedUsers = users.filter((u) => selectedIds.has(u._id));
  const allDeletableSelected =
    deletableUsersOnPage.length > 0 &&
    deletableUsersOnPage.every((u) => selectedIds.has(u._id));
  const someDeletableSelected = deletableUsersOnPage.some((u) => selectedIds.has(u._id));

  const toggleUserSelection = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllDeletable = () => {
    if (allDeletableSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletableUsersOnPage.forEach((u) => next.delete(u._id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletableUsersOnPage.forEach((u) => next.add(u._id));
        return next;
      });
    }
  };

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
    if (subStat === 'payment_pending') return 'Payment Pending';
    if (subStat === 'payment_expire') return 'Payment Expired';
    if (subStat === 'in_trial' || subStat === 'trial') return 'Trial';
    if (subStat === 'active') return 'Active';
    return subStat.replace(/_/g, ' ');
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
  const columnCount = 11;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Merchant Directory</h2>
          <p className="text-xs text-slate-500">
            Filter, sort by recent activity, renew plans, or bulk-delete inactive merchants (Max 20 per page)
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
            Sorted by:{' '}
            <span className="text-sky-700 font-bold capitalize">
              {sortBy === 'lastActivity'
                ? 'Last Activity (Recent on Top)'
                : sortBy === 'createdAt'
                  ? 'Created At'
                  : sortBy === 'shopName'
                    ? 'Shop Name'
                    : sortBy === 'expiry'
                      ? 'Subscription Expiry'
                      : sortBy === 'revenue'
                        ? 'Store Revenue'
                        : sortBy === 'orders'
                          ? 'Total Orders'
                          : sortBy}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
              <option value="pro">Pro Plan</option>
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

      {selectedIds.size > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="text-xs text-rose-800 font-medium">
            <span className="font-bold">{selectedIds.size}</span> deletable merchant
            {selectedIds.size === 1 ? '' : 's'} selected on this page
          </div>
          <div className="flex items-center space-x-2">
            <Link
              href={`/dashboard/whatsapp?userId=${Array.from(selectedIds).slice(0, 10).join(',')}`}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp Selected</span>
            </Link>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-100 transition"
            >
              Clear Selection
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Directory Table with Column Sorting */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th className="py-3.5 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someDeletableSelected && !allDeletableSelected;
                    }}
                    onChange={toggleSelectAllDeletable}
                    disabled={deletableUsersOnPage.length === 0 || loading}
                    title="Select all deletable merchants on this page"
                    className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </th>
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
                <th className="py-3.5 px-5">Billing</th>
                <th
                  onClick={() => handleSort('createdAt')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Created At</span>
                  {renderSortIcon('createdAt')}
                </th>
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
                  <span>Store Revenue</span>
                  {renderSortIcon('revenue')}
                </th>
                <th
                  onClick={() => handleSort('orders')}
                  className="py-3.5 px-5 text-right cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Orders</span>
                  {renderSortIcon('orders')}
                </th>
                <th className="py-3.5 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-600" />
                    <span>Loading merchants...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-slate-400">
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
                  const deletable = canDeleteUser(user);
                  const isSelected = selectedIds.has(user._id);

                  return (
                    <tr
                      key={user._id}
                      className={`hover:bg-slate-50 transition ${isSelected ? 'bg-rose-50/40' : ''}`}
                    >
                      <td className="py-3.5 px-3">
                        {deletable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUserSelection(user._id)}
                            title="Select for bulk delete"
                            className="w-3.5 h-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                        ) : (
                          <span className="inline-block w-3.5" />
                        )}
                      </td>
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
                            <div className="text-slate-400 font-mono text-[10px] mt-0.5">ID: {user._id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Shop Name */}
                      <td className="py-3.5 px-5 font-semibold text-slate-700">
                        {user.shopName || 'N/A'}
                        {user.phone && (
                          <div className="text-slate-400 text-[11px] font-normal">{user.phone}</div>
                        )}
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

                      {/* Subscription Plan */}
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-sky-700 text-xs">
                          <span className="capitalize">{user.subscription?.plan || 'trial'}</span>{' '}
                          <span
                            className={`text-[11px] font-semibold ${
                              isBlocked || isExpired ? 'text-rose-600' : 'text-slate-500'
                            }`}
                          >
                            ({subStatusText})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {!isBlocked && !isExpired && (
                            <span>{daysRemaining} days left • Exp: {formatDisplayDate(expiryDate)}</span>
                          )}
                          {isExpired && !isBlocked && (
                            <span className="text-rose-600 font-semibold">
                              Expired on {formatDisplayDate(expiryDate)}
                            </span>
                          )}
                          {isBlocked && (
                            <span className="text-rose-600 font-semibold">Access Restricted</span>
                          )}
                        </div>
                      </td>

                      {/* Billing */}
                      <td className="py-3.5 px-5">
                        {user.subscription?.plan === 'pro' ? (
                          <>
                            <div className="font-bold text-slate-900 text-[11px]">
                              Rs. {(user.subscription.amount || 0).toLocaleString()}
                            </div>
                            {user.subscription.billingCycle && (
                              <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                                {user.subscription.billingCycle}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Free trial</span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center space-x-1 text-slate-900 font-semibold text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDisplayDate(user.createdAt)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatDisplayDateTime(user.createdAt)}
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-5 bg-sky-50/20">
                        <div className="flex items-center space-x-1 text-slate-900 font-bold text-[11px]">
                          <Activity className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>{formatLastActivity(user.lastActivity)}</span>
                        </div>
                        {user.lastActivity && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {formatDisplayDateTime(user.lastActivity)}
                          </div>
                        )}
                      </td>

                      {/* Store Revenue */}
                      <td className="py-3.5 px-5 text-right font-extrabold text-slate-900">
                        Rs. {(user.monthlyRevenue || 0).toLocaleString()}
                      </td>

                      {/* Orders */}
                      <td className="py-3.5 px-5 text-right font-bold text-slate-700">
                        {(user.totalTransactions || 0).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* WHATSAPP BUTTON */}
                          <Link
                            href={`/dashboard/whatsapp?userId=${user._id}`}
                            title="Send WhatsApp message to user"
                            className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          </Link>

                          {/* RENEW BUTTON */}
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setBillingCycle('monthly');
                              setRenewalDays(30);
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

                          {/* DELETE ((blocked or expired) and inactive 60+ days) */}
                          {deletable && (
                            <button
                              onClick={() => setUserToDelete(user)}
                              title="Delete merchant and all associated data"
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
                <span>Renew Pro Plan: {selectedUser.name}</span>
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1.5">
                  Billing Cycle
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRO_BILLING_OPTIONS.map((opt) => (
                    <button
                      key={opt.cycle}
                      type="button"
                      onClick={() => {
                        setBillingCycle(opt.cycle);
                        setRenewalDays(opt.days);
                      }}
                      className={`py-2.5 rounded-xl font-semibold border transition flex flex-col items-center ${
                        billingCycle === opt.cycle
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px] font-bold mt-0.5 opacity-90">
                        Rs. {opt.amount.toLocaleString()}
                      </span>
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

      {/* BULK DELETE CONFIRMATION MODAL */}
      {bulkDeleteOpen && selectedUsers.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start space-x-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Delete {selectedUsers.length} Merchant{selectedUsers.length === 1 ? '' : 's'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This will permanently purge all selected accounts and their data.
                </p>
              </div>
              <button
                onClick={() => setBulkDeleteOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs max-h-48 overflow-y-auto">
              {selectedUsers.map((user) => (
                <div key={user._id} className="flex justify-between gap-3">
                  <span className="font-bold text-slate-900 truncate">{user.name}</span>
                  <span className="text-slate-500 shrink-0">{user.shopName || user.email}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium rounded-xl space-y-1 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Permanent Cascade Purge:</span>
                <p className="mt-0.5 text-rose-700">
                  Each selected merchant will have their account, shops, invoices, transactions,
                  products, and subscriptions deleted across all collections.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => setBulkDeleteOpen(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-rose-600/20 flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {deleting
                    ? 'Purging Data...'
                    : `Delete ${selectedUsers.length} Permanently`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
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
                  Are you sure you want to permanently delete this merchant?
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
                <span className="text-slate-500 font-medium">User ID:</span>
                <span className="font-mono text-slate-600 text-[10px]">{userToDelete._id}</span>
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
