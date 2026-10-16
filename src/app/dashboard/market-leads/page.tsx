'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Globe,
  Store,
  Phone,
  User,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Download,
  Filter,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  X,
  PhoneCall,
  Share2,
  Clock,
  Smartphone,
} from 'lucide-react';
import { formatDisplayDate, formatTimeAgo } from '@/lib/format-date';

interface MarketLead {
  _id: string;
  name: string;
  shopName: string;
  number: string;
  cleanNumber: string;
  place: string;
  marketId?: string;
  marketName?: string;
  area?: string;
  category?: string;
  subCategory?: string;
  businessType?: string;
  address?: string;
  whatsappUrl?: string;
  whatsappSent?: boolean;
  whatsappSentAt?: string | null;
  whatsappSentCount?: number;
  lastWhatsappStatus?: 'sent' | 'failed' | null;
  lastWhatsappMessage?: string;
  lastWhatsappVariant?: number;
  lastWhatsappError?: string | null;
  traderWholesaleScore?: number;
  isWholesalerOrTrader?: boolean;
  isSaddarMobileLead?: boolean;
  alternateNumbers?: string[];
  cleanAlternateNumbers?: string[];
  alternateWhatsappUrls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

interface SummaryStats {
  total: number;
  withOwner: number;
  withAlternates: number;
  marketsCount: number;
  whatsappSent?: number;
  whatsappUnsent?: number;
}

export default function MarketLeadsScrapingPage() {
  // State
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'whatsapp_sent' | 'whatsapp_unsent' | 'with_owner' | 'with_alternates' | 'wholesalers' | 'saddar'>('all');
  const [sortBy, setSortBy] = useState<'never_sent' | 'wholesalers_first' | 'newest' | 'recently_sent'>('never_sent');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);

  // Available filter lists & stats
  const [marketsList, setMarketsList] = useState<string[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    total: 0,
    withOwner: 0,
    withAlternates: 0,
    marketsCount: 0,
  });

  // Selection for bulk actions
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Add lead modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    shopName: '',
    number: '',
    place: '',
    category: '🏬 General Retail & Commercial',
    businessType: 'Wholesaler',
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Delete modal state
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingWaStatusId, setUpdatingWaStatusId] = useState<string | null>(null);

  // Manual WhatsApp status toggle handler
  const handleToggleWhatsAppStatus = async (lead: MarketLead) => {
    try {
      setUpdatingWaStatusId(lead._id);
      const nextStatus = !lead.whatsappSent;
      const res = await fetch('/api/admin/market-leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead._id,
          whatsappSent: nextStatus,
          note: nextStatus ? 'Manually marked as contacted' : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads((prev) =>
          prev.map((item) =>
            item._id === lead._id
              ? {
                  ...item,
                  whatsappSent: nextStatus,
                  whatsappSentAt: nextStatus ? new Date().toISOString() : null,
                  lastWhatsappStatus: nextStatus ? 'sent' : null,
                  whatsappSentCount: nextStatus ? (item.whatsappSentCount || 0) + 1 : item.whatsappSentCount,
                }
              : item
          )
        );
        setSummary((prev) => ({
          ...prev,
          whatsappSent: Math.max(0, (prev.whatsappSent || 0) + (nextStatus ? 1 : -1)),
          whatsappUnsent: Math.max(0, (prev.whatsappUnsent !== undefined ? prev.whatsappUnsent : prev.total) + (nextStatus ? -1 : 1)),
        }));
      }
    } catch (err) {
      console.error('Failed to toggle WhatsApp status:', err);
    } finally {
      setUpdatingWaStatusId(null);
    }
  };

  // Fetch Market Leads
  const fetchLeads = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort: sortBy,
        ...(search ? { search } : {}),
        ...(selectedMarket !== 'all' ? { market: selectedMarket } : {}),
        ...(selectedCategory !== 'all' ? { category: selectedCategory } : {}),
        ...(activeFilter !== 'all' ? { filter: activeFilter } : {}),
      });

      const res = await fetch(`/api/admin/market-leads?${query.toString()}`);
      const data = await res.json();

      if (data.success) {
        setLeads(data.leads || []);
        setTotalLeads(data.totalLeads || 0);
        setTotalPages(data.totalPages || 1);
        if (data.markets?.length) setMarketsList(data.markets);
        if (data.categories?.length) setCategoriesList(data.categories);
        if (data.summary) setSummary(data.summary);
      } else {
        console.error('Failed to fetch market leads:', data.error);
      }
    } catch (err) {
      console.error('Error fetching market leads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, limit, search, selectedMarket, selectedCategory, activeFilter, sortBy]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Handle Copy Phone
  const handleCopyPhone = (number: string) => {
    navigator.clipboard.writeText(number);
    setCopiedPhone(number);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Toggle select all on current page
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newSelected = new Set(selectedLeadIds);
      leads.forEach((l) => newSelected.add(l._id));
      setSelectedLeadIds(newSelected);
    } else {
      const newSelected = new Set(selectedLeadIds);
      leads.forEach((l) => newSelected.delete(l._id));
      setSelectedLeadIds(newSelected);
    }
  };

  // Toggle single lead selection
  const handleToggleLead = (id: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeadIds(newSelected);
  };

  const isAllCurrentSelected = useMemo(() => {
    if (leads.length === 0) return false;
    return leads.every((l) => selectedLeadIds.has(l._id));
  }, [leads, selectedLeadIds]);

  // Handle Export to CSV
  const handleExportCSV = () => {
    const leadsToExport = selectedLeadIds.size > 0
      ? leads.filter((l) => selectedLeadIds.has(l._id))
      : leads;

    if (leadsToExport.length === 0) return;

    const headers = ['Shop Name', 'Owner / Contact', 'Phone Number', 'Market / Place', 'Category', 'Business Type', 'Address', 'WhatsApp URL'];
    const rows = leadsToExport.map((l) => [
      `"${(l.shopName || '').replace(/"/g, '""')}"`,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${l.number || ''}"`,
      `"${(l.place || '').replace(/"/g, '""')}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.businessType || '').replace(/"/g, '""')}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${l.whatsappUrl || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `market_leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Export to JSON
  const handleExportJSON = () => {
    const leadsToExport = selectedLeadIds.size > 0
      ? leads.filter((l) => selectedLeadIds.has(l._id))
      : leads;

    const jsonStr = JSON.stringify(leadsToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `market_leads_export_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle Form Submit
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formData.shopName.trim()) {
      setFormError('Please enter shop name.');
      return;
    }
    if (!formData.number.trim()) {
      setFormError('Please enter phone number.');
      return;
    }
    if (!formData.place.trim()) {
      setFormError('Please enter market / location.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/market-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setFormSuccess(`Market lead "${formData.shopName}" added.`);
        setFormData({
          name: '',
          shopName: '',
          number: '',
          place: '',
          category: '🏬 General Retail & Commercial',
          businessType: 'Wholesaler',
          address: '',
        });
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccess(null);
        }, 1200);
        fetchLeads(true);
      } else {
        setFormError(data.error || 'Failed to add market lead.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Lead
  const handleDeleteLead = async () => {
    if (!deleteLeadId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/market-leads?id=${deleteLeadId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteLeadId(null);
        fetchLeads(true);
      } else {
        alert(data.error || 'Failed to delete market lead.');
      }
    } catch (err) {
      console.error('Error deleting lead:', err);
      alert('Error deleting market lead.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs font-sans pb-16">
      {/* Top Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-sky-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-950/20 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-sky-500/20 text-sky-300 rounded-full text-[11px] font-semibold border border-sky-400/30 backdrop-blur-sm">
            <Globe className="w-3.5 h-3.5" />
            <span>Karachi Commercial Intelligence • Scraped Leads</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Potential Leads by Scraping
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl">
            Live database of verified Karachi wholesale traders, shops, and commercial merchants categorized by market.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 z-10">
          <Link
            href="/dashboard/whatsapp?filter=market_leads"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/30 flex items-center space-x-2 transition"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Broadcast via WhatsApp</span>
          </Link>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition backdrop-blur-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead</span>
          </button>

          <button
            onClick={() => fetchLeads(true)}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition backdrop-blur-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Scraped Leads */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Market Leads
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {summary.total.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-1">
              <span className="text-sky-600 font-semibold">{totalLeads.toLocaleString()}</span>
              <span>matching view</span>
            </p>
          </div>
        </div>

        {/* WhatsApp Sent / Contacted */}
        <button
          onClick={() => {
            setActiveFilter('whatsapp_sent');
            setPage(1);
          }}
          className="bg-white border border-emerald-200/90 hover:border-emerald-400 rounded-2xl p-4 shadow-xs hover:shadow-md transition text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
              WhatsApp Sent
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 group-hover:scale-105 transition">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {(summary.whatsappSent || 0).toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {summary.total > 0 ? `${Math.round(((summary.whatsappSent || 0) / summary.total) * 100)}% contacted` : '0% contacted'}
            </p>
          </div>
        </button>

        {/* Unsent / Pending Leads */}
        <button
          onClick={() => {
            setActiveFilter('whatsapp_unsent');
            setPage(1);
          }}
          className="bg-white border border-amber-200/90 hover:border-amber-400 rounded-2xl p-4 shadow-xs hover:shadow-md transition text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
              Unsent / Pending
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 group-hover:scale-105 transition">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-amber-700 tracking-tight">
              {(summary.whatsappUnsent !== undefined ? summary.whatsappUnsent : Math.max(0, summary.total - (summary.whatsappSent || 0))).toLocaleString()}
            </div>
            <p className="text-[11px] text-amber-600 mt-0.5 font-medium">
              Ready for Sunday broadcast
            </p>
          </div>
        </button>

        {/* Markets Covered */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Markets & Hubs
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-200">
              <MapPin className="w-4 h-4 text-rose-500" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {summary.marketsCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Wholesale & Retail Centers
            </p>
          </div>
        </div>

        {/* Identified Proprietors */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Named Proprietors
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-indigo-600 tracking-tight">
              {summary.withOwner}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Verified owner names
            </p>
          </div>
        </div>
      </div>

      {/* Filter, Search & Export Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by shop name, owner, phone number, market, or address..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Select Market Dropdown */}
          <div className="w-full sm:w-64">
            <select
              value={selectedMarket}
              onChange={(e) => {
                setSelectedMarket(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="all">📍 All Markets ({summary.marketsCount})</option>
              {marketsList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Select Category Dropdown */}
          <div className="w-full sm:w-56">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="all">🏷️ All Categories ({categoriesList.length})</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order Dropdown */}
          <div className="w-full sm:w-64">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            >
              <option value="never_sent">⚡ Traders & Wholesalers (Never Sent Top)</option>
              <option value="wholesalers_first">🏢 All Traders & Wholesalers First</option>
              <option value="newest">✨ Newest Added First</option>
              <option value="recently_sent">📨 Recently Contacted</option>
            </select>
          </div>

          {/* Export Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs"
              title="Export visible or selected to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs"
              title="Export visible or selected to JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Filter:
            </span>
            <button
              onClick={() => {
                setActiveFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                activeFilter === 'all'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Leads ({summary.total})
            </button>
            <button
              onClick={() => {
                setActiveFilter('whatsapp_sent');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'whatsapp_sent'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>✓ WhatsApp Sent ({summary.whatsappSent || 0})</span>
            </button>
            <button
              onClick={() => {
                setActiveFilter('whatsapp_unsent');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'whatsapp_unsent'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>⏳ Unsent Leads ({summary.whatsappUnsent !== undefined ? summary.whatsappUnsent : Math.max(0, summary.total - (summary.whatsappSent || 0))})</span>
            </button>
            <button
              onClick={() => {
                setActiveFilter('with_owner');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'with_owner'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <User className="w-3 h-3" />
              <span>With Owner ({summary.withOwner})</span>
            </button>
            <button
              onClick={() => {
                setActiveFilter('with_alternates');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'with_alternates'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <PhoneCall className="w-3 h-3" />
              <span>Alternates ({summary.withAlternates})</span>
            </button>
            <button
              onClick={() => {
                setActiveFilter('wholesalers');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'wholesalers'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Store className="w-3 h-3" />
              <span>Wholesalers</span>
            </button>
            <button
              onClick={() => {
                setActiveFilter('saddar');
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ${
                activeFilter === 'saddar'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>📱 Saddar Mobile Market</span>
            </button>
          </div>

          {/* Rows Per Page */}
          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
            <span>Rows:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 text-xs text-slate-700 font-semibold focus:outline-none"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action Sticky Bar */}
      {selectedLeadIds.size > 0 && (
        <div className="p-3 bg-sky-900 text-white rounded-xl shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-xs">
              {selectedLeadIds.size}
            </div>
            <span className="font-semibold text-xs">leads selected across table</span>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href={`/dashboard/whatsapp?filter=market_leads&userId=${Array.from(selectedLeadIds).slice(0, 20).join(',')}`}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 transition"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Broadcast on WhatsApp</span>
            </Link>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-lg text-xs flex items-center space-x-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Selected</span>
            </button>
            <button
              onClick={() => setSelectedLeadIds(new Set())}
              className="px-2.5 py-1.5 text-sky-200 hover:text-white text-xs font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllCurrentSelected}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 min-w-[200px]">Shop & Business</th>
                <th className="py-3 px-3 min-w-[140px]">Proprietor / Contact</th>
                <th className="py-3 px-3 min-w-[150px]">Primary Mobile</th>
                <th className="py-3 px-3 min-w-[150px]">
                  <div className="flex items-center space-x-1">
                    <span>WhatsApp Status</span>
                    {sortBy === 'never_sent' && (
                      <span className="text-[9px] font-normal px-1 py-0.5 bg-amber-100 text-amber-800 rounded font-sans uppercase">
                        Unsent Top
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-3 px-3 min-w-[150px]">Alternate Numbers</th>
                <th className="py-3 px-3 min-w-[180px]">Market & Area</th>
                <th className="py-3 px-3 text-right min-w-[95px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-600" />
                      <span>Loading scraped market leads from database...</span>
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Store className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600 text-sm">No market leads match your criteria</p>
                      <p className="text-xs text-slate-400">Try adjusting your search query or market filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const isSelected = selectedLeadIds.has(lead._id);
                  const hasOwner = lead.name && lead.name !== 'N/A';
                  const hasAlternates = lead.alternateNumbers && lead.alternateNumbers.length > 0;
                  const waUrl = lead.whatsappUrl || (lead.cleanNumber ? `https://wa.me/${lead.cleanNumber}` : null);

                  return (
                    <tr
                      key={lead._id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleLead(lead._id)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      {/* Shop Name & Badges */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-900 text-xs tracking-tight">
                            {lead.shopName}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {Boolean(lead.isSaddarMobileLead || /saddar.*mobile|mobile.*market|star city/i.test(lead.place || lead.marketName || '')) && (
                              <span className="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200/90 rounded text-[10px] font-bold">
                                📱 Saddar Mobile
                              </span>
                            )}
                            {lead.isWholesalerOrTrader && (
                              <span className="inline-block px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/90 rounded text-[10px] font-bold">
                                🏢 Trader & Wholesaler
                              </span>
                            )}
                            {lead.businessType && !lead.isWholesalerOrTrader && (
                              <span className="inline-block px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/80 rounded text-[10px] font-semibold">
                                {lead.businessType}
                              </span>
                            )}
                            {lead.category && (
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium truncate max-w-[180px]">
                                {lead.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Proprietor / Owner Name */}
                      <td className="py-3 px-3">
                        {hasOwner ? (
                          <div className="flex items-center space-x-1.5 text-indigo-900 font-bold">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                              <User className="w-3 h-3" />
                            </div>
                            <span className="truncate max-w-[130px]">{lead.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px] italic">
                            N/A
                          </span>
                        )}
                      </td>

                      {/* Primary Mobile & WhatsApp */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1.5 font-mono font-bold text-slate-900">
                            <span>{lead.number}</span>
                            <button
                              onClick={() => handleCopyPhone(lead.number)}
                              className="text-slate-400 hover:text-slate-600 p-0.5 transition"
                              title="Copy number"
                            >
                              {copiedPhone === lead.number ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 transition"
                            >
                              <MessageSquare className="w-3 h-3 text-emerald-600" />
                              <span>WhatsApp Chat</span>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* WhatsApp Status & Outreach Tracking */}
                      <td className="py-3 px-3">
                        {lead.whatsappSent ? (
                          <div className="space-y-1">
                            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/90 rounded-md text-[11px] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Sent ({lead.whatsappSentCount || 1}x)</span>
                            </div>
                            {lead.whatsappSentAt && (
                              <p className="text-[10px] text-slate-500 font-medium" title={formatDisplayDate(lead.whatsappSentAt)}>
                                {formatTimeAgo(lead.whatsappSentAt)}
                              </p>
                            )}
                            {lead.lastWhatsappMessage && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[145px] italic" title={lead.lastWhatsappMessage}>
                                "{lead.lastWhatsappMessage.replace(/\n/g, ' ')}"
                              </p>
                            )}
                          </div>
                        ) : lead.lastWhatsappStatus === 'failed' ? (
                          <div className="space-y-0.5">
                            <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-md text-[10px] font-bold">
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                              <span>Failed</span>
                            </div>
                            {lead.lastWhatsappError && (
                              <p className="text-[10px] text-rose-500 truncate max-w-[140px]" title={lead.lastWhatsappError}>
                                {lead.lastWhatsappError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-semibold">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Not Sent</span>
                          </div>
                        )}
                      </td>

                      {/* Alternate Numbers */}
                      <td className="py-3 px-3">
                        {hasAlternates ? (
                          <div className="flex flex-wrap gap-1">
                            {lead.alternateNumbers!.map((alt, idx) => {
                              const cleanAlt = lead.cleanAlternateNumbers?.[idx];
                              const altWaUrl = lead.alternateWhatsappUrls?.[idx] || (cleanAlt ? `https://wa.me/${cleanAlt}` : null);
                              return (
                                <div key={idx} className="flex items-center space-x-1">
                                  {altWaUrl ? (
                                    <a
                                      href={altWaUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded text-[10px] font-mono transition"
                                      title={`Chat on WhatsApp: ${alt}`}
                                    >
                                      <span>{alt}</span>
                                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                    </a>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-mono">
                                      {alt}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Market & Location */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5 max-w-[220px]">
                          <div className="flex items-center space-x-1 font-bold text-slate-800 truncate">
                            <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                            <span className="truncate">{lead.place}</span>
                          </div>
                          {lead.address && lead.address !== lead.place && (
                            <p className="text-[11px] text-slate-500 truncate" title={lead.address}>
                              {lead.address}
                            </p>
                          )}
                          {lead.googleMapsUrl && (
                            <a
                              href={lead.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-sky-600 hover:text-sky-800 font-semibold inline-flex items-center space-x-0.5 transition"
                            >
                              <span>View on Google Maps</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleToggleWhatsAppStatus(lead)}
                            disabled={updatingWaStatusId === lead._id}
                            className={`p-1.5 rounded-lg transition ${
                              lead.whatsappSent
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={lead.whatsappSent ? 'Click to mark as Unsent' : 'Click to mark as WhatsApp Sent'}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${updatingWaStatusId === lead._id ? 'animate-spin' : ''}`} />
                          </button>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Chat on WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => setDeleteLeadId(lead._id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-600">
          <div>
            Showing <span className="font-bold text-slate-900">{leads.length}</span> of{' '}
            <span className="font-bold text-slate-900">{totalLeads.toLocaleString()}</span> leads
            {selectedLeadIds.size > 0 && ` (${selectedLeadIds.size} selected)`}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center space-x-1 shadow-2xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="px-2 font-medium text-slate-700">
              Page <span className="font-bold">{page}</span> of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center space-x-1 shadow-2xs"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add New Scraped Market Lead</h3>
                  <p className="text-[11px] text-slate-500">Insert into market_leads collection</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddLead} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Shop Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Al-Madina Wholesale Spices"
                  value={formData.shopName}
                  onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Contact / Owner Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Haji Muhammad Tariq"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    placeholder="03XX-XXXXXXX"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Market / Place *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Jodia Bazaar Wholesale Commodities"
                    value={formData.place}
                    onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Business Type
                  </label>
                  <select
                    value={formData.businessType}
                    onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="Wholesaler">Wholesaler</option>
                    <option value="Trader">Trader</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Importer / Exporter">Importer / Exporter</option>
                    <option value="Retailer">Retailer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. 🥦 Grocery & Provisions"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Street / Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shop #12, Daryalal Street, Jodia Bazaar, Karachi"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Add Lead to Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLeadId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center border border-rose-200">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Delete Market Lead</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this scraped lead from the <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">market_leads</code> collection?
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteLeadId(null)}
                disabled={deleting}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLead}
                disabled={deleting}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
