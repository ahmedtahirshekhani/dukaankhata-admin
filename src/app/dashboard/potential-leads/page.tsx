'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Store,
  Phone,
  User,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { formatDisplayDate } from '@/lib/format-date';

interface PotentialLead {
  _id: string;
  name: string;
  shopName: string;
  number: string;
  place: string;
  createdAt: string;
  updatedAt: string;
}

export default function PotentialLeadsPage() {
  const router = useRouter();

  // State
  const [leads, setLeads] = useState<PotentialLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    shopName: '',
    number: '',
    place: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Delete modal state
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch Potential Leads
  const fetchLeads = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '100',
        ...(search ? { search } : {}),
      });

      const res = await fetch(`/api/admin/potential-leads?${query.toString()}`);
      const data = await res.json();

      if (data.success) {
        setLeads(data.leads || []);
        setTotalLeads(data.totalLeads || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        console.error('Failed to fetch potential leads:', data.error);
      }
    } catch (err) {
      console.error('Error fetching potential leads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Handle Form Submit
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!formData.name.trim()) {
      setFormError('Please enter name.');
      return;
    }
    if (!formData.number.trim()) {
      setFormError('Please enter number.');
      return;
    }
    if (!formData.place.trim()) {
      setFormError('Please enter place.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/potential-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setFormSuccess(`Lead "${formData.name}" added.`);
        setFormData({ name: '', shopName: '', number: '', place: '' });
        fetchLeads(true);
      } else {
        setFormError(data.error || 'Failed to add lead.');
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
      const res = await fetch(`/api/admin/potential-leads?id=${deleteLeadId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteLeadId(null);
        fetchLeads(true);
      } else {
        alert(data.error || 'Failed to delete lead.');
      }
    } catch (err) {
      console.error('Error deleting lead:', err);
      alert('Error deleting lead.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Potential Leads by Visit
          </h1>
          <p className="text-xs text-slate-500">
            Total records: <span className="font-bold text-slate-800">{totalLeads}</span>
          </p>
        </div>

        <button
          onClick={() => fetchLeads(true)}
          disabled={refreshing}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Add New Lead Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <Plus className="w-4 h-4 text-sky-600" />
          <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Add New Lead</h2>
        </div>

        {formError && (
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{formError}</span>
          </div>
        )}

        {formSuccess && (
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{formSuccess}</span>
          </div>
        )}

        <form onSubmit={handleAddLead} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Name *</label>
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              required
            />
          </div>

          {/* Shop Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Name</label>
            <input
              type="text"
              placeholder="Shop Name"
              value={formData.shopName}
              onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Number */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Number *</label>
            <input
              type="text"
              placeholder="03xx-xxxxxxx"
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              required
            />
          </div>

          {/* Place */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Place *</label>
            <input
              type="text"
              placeholder="Place / Location"
              value={formData.place}
              onChange={(e) => setFormData({ ...formData, place: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
              required
            />
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg transition text-xs disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Search Bar */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="font-bold text-slate-700 text-xs">
            Leads List ({leads.length})
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Compact Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Shop Name</th>
                <th className="py-2 px-3">Number</th>
                <th className="py-2 px-3">Place</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No potential leads found.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-slate-50 transition whitespace-nowrap">
                    <td className="py-1.5 px-3 font-semibold text-slate-900">{lead.name}</td>
                    <td className="py-1.5 px-3 text-slate-700">{lead.shopName || '—'}</td>
                    <td className="py-1.5 px-3 font-mono text-slate-800">{lead.number}</td>
                    <td className="py-1.5 px-3 text-slate-700">{lead.place}</td>
                    <td className="py-1.5 px-3 text-slate-500 text-[11px]">
                      {formatDisplayDate(lead.createdAt)}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <button
                        onClick={() => setDeleteLeadId(lead._id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex space-x-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded disabled:opacity-50 font-medium"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded disabled:opacity-50 font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteLeadId && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-4 shadow-lg space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Delete Potential Lead</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this lead?
            </p>
            <div className="flex justify-end space-x-2 pt-1">
              <button
                onClick={() => setDeleteLeadId(null)}
                disabled={deleting}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLead}
                disabled={deleting}
                className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg text-xs"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
