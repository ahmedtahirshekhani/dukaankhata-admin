'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserX,
  Search,
  RefreshCw,
  Filter,
  Calendar,
  Building2,
  Mail,
  Phone,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  Shield,
  CreditCard,
  X,
} from 'lucide-react';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format-date';

interface DeletedLead {
  _id: string;
  originalUserId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  role: string;
  userStatus: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  monthlyRevenue: number;
  totalTransactions: number;
  lastActivity?: string;
  createdAt?: string;
  deletedAt: string;
}

interface Summary {
  total: number;
  trial: number;
  pro: number;
  recent30Days: number;
}

type SortField = 'deletedAt' | 'name' | 'company' | 'email';

export default function DeletedLeadsPage() {
  const [leads, setLeads] = useState<DeletedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ total: 0, trial: 0, pro: 0, recent30Days: 0 });

  // Filters State
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearchRef = useRef('');
  const [planFilter, setPlanFilter] = useState('all');

  // Sorting & Pagination State
  const [sortBy, setSortBy] = useState<SortField>('deletedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);

  // Detail Modal State
  const [selectedLead, setSelectedLead] = useState<DeletedLead | null>(null);

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

  const fetchDeletedLeads = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (planFilter !== 'all') query.set('plan', planFilter);
      query.set('sortBy', sortBy);
      query.set('sortOrder', sortOrder);
      query.set('page', page.toString());
      query.set('limit', limit.toString());

      const res = await fetch(`/api/admin/deleted-leads?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setTotalLeads(data.totalLeads || 0);
        setTotalPages(data.totalPages || 1);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Failed to fetch deleted leads:', err);
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchDeletedLeads();
  }, [fetchDeletedLeads]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40 ml-1 inline" />;
    return sortOrder === 'desc' ? (
      <ArrowDown className="w-3 h-3 text-rose-600 ml-1 inline font-bold" />
    ) : (
      <ArrowUp className="w-3 h-3 text-rose-600 ml-1 inline font-bold" />
    );
  };

  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
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

  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, totalLeads);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <UserX className="w-6 h-6 text-rose-600" />
            <h2 className="text-2xl font-extrabold text-slate-900">Deleted Leads Archive</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Archived merchant records containing contact details, shop address, and subscription stats at time of deletion.
          </p>
        </div>

        <button
          onClick={fetchDeletedLeads}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition self-start sm:self-auto shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-rose-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Deleted Leads
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{summary.total}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Trial Plan Leads
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-600">{summary.trial}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pro Plan Leads
            </span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-sky-600">{summary.pro}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Deleted (Last 30 Days)
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-purple-600">{summary.recent30Days}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-rose-600" />
            <span>Search & Filter Leads</span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Sorted by:{' '}
            <span className="text-rose-700 font-bold capitalize">
              {sortBy === 'deletedAt'
                ? 'Deletion Date'
                : sortBy === 'name'
                  ? 'Merchant Name'
                  : sortBy === 'company'
                    ? 'Company Name'
                    : sortBy === 'email'
                      ? 'Email'
                      : sortBy}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Input */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, phone, company, address, or ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
            />
          </div>

          {/* Plan Filter */}
          <div>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer font-medium"
            >
              <option value="all">All Subscriptions</option>
              <option value="trial">Trial Plan</option>
              <option value="pro">Pro Plan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Table */}
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
                  onClick={() => handleSort('email')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Contact Info</span>
                  {renderSortIcon('email')}
                </th>
                <th
                  onClick={() => handleSort('company')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition"
                >
                  <span>Company / Address</span>
                  {renderSortIcon('company')}
                </th>
                <th className="py-3.5 px-5">Plan at Deletion</th>
                <th
                  onClick={() => handleSort('deletedAt')}
                  className="py-3.5 px-5 cursor-pointer hover:text-slate-900 transition bg-rose-50/50"
                >
                  <span className="font-bold text-rose-700">Deleted Date</span>
                  {renderSortIcon('deletedAt')}
                </th>
                <th className="py-3.5 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-600" />
                    <span>Loading archived deleted leads...</span>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No deleted merchant records found matching your search criteria.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-slate-50 transition">
                    {/* Merchant Name & ID */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center font-bold text-xs">
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{lead.name}</div>
                          <div className="text-slate-400 font-mono text-[10px] mt-0.5">
                            ID: {lead.originalUserId}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Email & Phone */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-1.5 text-slate-800 font-medium">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{lead.email || 'N/A'}</span>
                      </div>
                      {lead.phone && (
                        <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                    </td>

                    {/* Company & Address */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                        <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>{lead.company}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-slate-500 text-[11px] mt-0.5 max-w-xs truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>
                          {lead.address}
                          {lead.city ? `, ${lead.city}` : ''}
                        </span>
                      </div>
                    </td>

                    {/* Plan at Deletion */}
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-slate-900 capitalize text-xs">
                        {lead.subscriptionPlan || 'trial'}
                      </div>
                      <span className="inline-block mt-0.5 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-semibold capitalize">
                        {lead.subscriptionStatus || 'expired'}
                      </span>
                    </td>

                    {/* Deletion Date */}
                    <td className="py-3.5 px-5 bg-rose-50/20">
                      <div className="flex items-center space-x-1 text-slate-900 font-bold text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{formatRelativeTime(lead.deletedAt)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {formatDisplayDateTime(lead.deletedAt)}
                      </div>
                    </td>

                    {/* View Details Action */}
                    <td className="py-3.5 px-5 text-center">
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center space-x-1 transition"
                      >
                        <Info className="w-3.5 h-3.5 text-slate-500" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && totalLeads > 0 && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing <span className="font-bold text-slate-900">{startIndex}</span> to{' '}
              <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
              <span className="font-bold text-slate-900">{totalLeads}</span> deleted leads
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

      {/* LEAD DETAILS MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center font-bold text-sm">
                  {selectedLead.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{selectedLead.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {selectedLead.originalUserId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-700 text-base font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Contact & Company Info
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 font-medium block">Email:</span>
                    <span className="font-semibold text-slate-800 break-all">
                      {selectedLead.email || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Phone:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedLead.phone || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Company / Shop:</span>
                    <span className="font-bold text-slate-900">{selectedLead.company}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">City:</span>
                    <span className="font-semibold text-slate-800">
                      {selectedLead.city || 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Full Address:</span>
                  <span className="font-semibold text-slate-800">{selectedLead.address}</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Subscription & Metric Snapshot
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 font-medium block">Subscription Plan:</span>
                    <span className="font-bold text-sky-700 capitalize">
                      {selectedLead.subscriptionPlan}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Sub Status:</span>
                    <span className="font-semibold text-rose-600 capitalize">
                      {selectedLead.subscriptionStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Store Revenue:</span>
                    <span className="font-extrabold text-slate-900">
                      Rs. {(selectedLead.monthlyRevenue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Orders Handled:</span>
                    <span className="font-bold text-slate-800">
                      {(selectedLead.totalTransactions || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-rose-800">
                <div className="font-bold flex items-center space-x-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-rose-600" />
                  <span>Deletion Record Timestamp</span>
                </div>
                <div className="text-[11px] text-rose-700 pt-0.5">
                  Purged on {formatDisplayDateTime(selectedLead.deletedAt)} ({formatRelativeTime(selectedLead.deletedAt)})
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedLead(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
