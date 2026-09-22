'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Users,
  Search,
  Filter,
  Info,
  Clock,
  Sparkles,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Zap,
  Check,
  Ban,
  Shield,
  Layers,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { formatDisplayDate } from '@/lib/format-date';
import { formatWhatsAppPhone } from '@/lib/whatsapp/phone-utils';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  shopName?: string;
  phone?: string;
  subscription?: {
    plan?: string;
    status?: string;
    expiresAt?: string;
  };
  monthlyRevenue?: number;
  createdAt?: string;
  lastActivity?: string;
}

export type TargetFilterType =
  | 'all'
  | 'new7'
  | 'active'
  | 'pro'
  | 'free'
  | 'suspended'
  | 'custom'
  | 'inactive7'
  | 'inactive15'
  | 'inactive30'
  | 'inactive90';

interface WhatsAppStatusState {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  userName: string | null;
  error: string | null;
  connectedAt: string | null;
}

interface SendLog {
  phone: string;
  name: string;
  success: boolean;
  error?: string;
  sentAt?: string;
}

const TEMPLATE_VARIABLES = [
  { label: 'Name', tag: '{name}' },
  { label: 'Shop Name', tag: '{shopName}' },
  { label: 'Email', tag: '{email}' },
  { label: 'Plan', tag: '{plan}' },
  { label: 'Expiry Date', tag: '{expiresAt}' },
  { label: 'Revenue', tag: '{monthlyRevenue}' },
];

const QUICK_TEMPLATES = [
  {
    title: '🎉 Welcome New Merchant',
    text: 'Assalam o Alaikum {name} - {shopName}! 🎉\n\nWelcome to Dukaankhata! 🥳\nAb aapki dukaandari aur hisaab-kitaab properly manage hone wala hai. 😎\n\nPlease iss application ko ziyada mat use kijiyega...\nwarna aapki dukaandari itni smoothly manage hone lagegi ke phir “hisaab nahi mil raha” ka bahana bhi nahi chalega. 😂\n\nAur agar app use karte hue koi bhi sawal, confusion ya help chahiye ho, toh feel free to WhatsApp us:\n\n📞 Customer Support: 0335-2575725 (Kashan Shekhani)\n📞 Customer Support: 0335-2787275 (Hammad Shekhani)\n📞 Help & Support: 0321-2575665\n\nAapki dukaandari ko easy banana humari first priority hai —\nkyun ke hisaab manage karna mushkil nahi hona chahiye, customers already kaafi hain. 😂\n\nShukriya,\nDukaanKhata Team 💙',
  },
  {
    title: '💬 Churned Merchant Re-Engagement (Win-Back)',
    text: 'Assalam o Alaikum {name} ({shopName})! 👋\n\nHum ne notice kiya ke aap ne kuch dino se DukaanKhata app check nahi ki.\n\nAap ki dukaandari ke hisaab-kitaab ko aasan banana humari pehli tarjeeh hai. App mein naye features add hue hain jisse aap ki daily sales aur bahi-khata mazeed tez ho jaye ga!\n\nAaj hi app kholain aur apna hisaab up-to-date karain: https://dukaankhata.app\n\nAgar koi problem aa rahi hai toh humse direct baat karain:\n📞 Support: 0335-2575725 (Kashan Shekhani)\n📞 Support: 0335-2787275 (Hammad Shekhani)\n\nShukriya,\nDukaanKhata Team 💙',
  },
  {
    title: 'Payment Reminder',
    text: 'Assalam o Alaikum {name},\n\nFriendly reminder: Your DukaanKhata {plan} plan is active for {shopName}. Please ensure your account balance or renewal is up to date.\n\nThank you!',
  },
  {
    title: 'Pro Feature Upgrade',
    text: 'Hello {name} ({shopName}),\n\nUpgrade to DukaanKhata Pro to unlock unlimited transactions, priority WhatsApp support, and custom PDF invoices!\n\nBest regards,\nDukaanKhata Team',
  },
  {
    title: 'General Update',
    text: 'Dear {name},\n\nWe have updated the DukaanKhata app with exciting new features for your shop {shopName}.\n\nLog in today to check them out!',
  },
];

export default function WhatsAppAdminPage() {
  // Connection State
  const [waState, setWaState] = useState<WhatsAppStatusState>({
    status: 'disconnected',
    qrCodeUrl: null,
    phoneNumber: null,
    userName: null,
    error: null,
    connectedAt: null,
  });
  const [waLogs, setWaLogs] = useState<SendLog[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Users & Target Selection State
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [targetFilter, setTargetFilter] = useState<TargetFilterType>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [showAllPreview, setShowAllPreview] = useState(false);

  // Message & Send State
  const [message, setMessage] = useState(QUICK_TEMPLATES[0].text);
  const [forceSend, setForceSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ total: number; sent: number; fail: number } | null>(null);
  const [sendResultMsg, setSendResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState('03352575725');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [todaySentCount, setTodaySentCount] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<number>(20);

  // Fetch WhatsApp status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/status');
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
        if (data.logs) setWaLogs(data.logs);
        if (typeof data.todaySentCount === 'number') setTodaySentCount(data.todaySentCount);
        if (typeof data.dailyLimit === 'number') setDailyLimit(data.dailyLimit);
      }
    } catch (err) {
      console.error('Error fetching WA status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Poll status every 4 seconds if connecting or qr_ready
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Fetch Users List for recipient selection
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users?limit=5000&page=1');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching users for WA:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-select user query param if redirected from Users page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preselectedId = params.get('userId');
    if (preselectedId && users.length > 0) {
      setTargetFilter('custom');
      const ids = preselectedId.split(',').filter(Boolean).slice(0, 20);
      setSelectedUserIds(new Set(ids));
      if (preselectedId.split(',').filter(Boolean).length > 20) {
        setSelectionWarning('Selected top 20 users from list (maximum 20 allowed).');
      }
    }
  }, [users]);

  // Connect QR trigger
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
      }
    } catch (err) {
      console.error('Error connecting WhatsApp:', err);
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect session
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
      }
    } catch (err) {
      console.error('Error disconnecting WhatsApp:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  // Insert template variable into text field
  const handleInsertVariable = (tag: string) => {
    if (!textareaRef.current) {
      setMessage((prev) => prev + ' ' + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = message;
    const newText = text.substring(0, start) + tag + text.substring(end);
    setMessage(newText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + tag.length, start + tag.length);
      }
    }, 0);
  };

  // Handle filter change cleanly
  const handleTargetFilterChange = (filter: TargetFilterType) => {
    setTargetFilter(filter);
    setSelectedUserIds(new Set());
    setSelectionWarning(null);
  };

  // Filter matching users based on selected target audience filter & search query
  const getMatchingFilterUsers = useCallback(() => {
    let result = users;
    const daysAgo = (d: number) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      return dt;
    };

    if (targetFilter === 'new7') {
      result = users.filter((u) => u.createdAt && new Date(u.createdAt) >= daysAgo(7));
    } else if (targetFilter === 'inactive7') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(7));
    } else if (targetFilter === 'inactive15') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(15));
    } else if (targetFilter === 'inactive30') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(30));
    } else if (targetFilter === 'inactive90') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(90));
    } else if (targetFilter === 'pro') {
      result = users.filter((u) => u.subscription?.plan === 'pro');
    } else if (targetFilter === 'free') {
      result = users.filter((u) => u.subscription?.plan !== 'pro');
    } else if (targetFilter === 'active') {
      result = users.filter((u) => u.status !== 'suspended' && u.status !== 'blocked');
    } else if (targetFilter === 'suspended') {
      result = users.filter((u) => u.status === 'suspended' || u.status === 'blocked');
    }

    if (userSearch) {
      const query = userSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          (u.shopName || '').toLowerCase().includes(query) ||
          (u.phone || '').includes(query)
      );
    }

    return result;
  }, [users, targetFilter, userSearch]);

  const matchingFilterUsers = getMatchingFilterUsers();

  // Final Target Recipients (max 20 users):
  // If specific users are checked, use selectedUserIds (max 20). Otherwise default to top 20 matching users.
  const getFilteredRecipients = useCallback(() => {
    if (selectedUserIds.size > 0) {
      return users.filter((u) => selectedUserIds.has(u._id)).slice(0, 20);
    }
    return matchingFilterUsers.slice(0, 20);
  }, [users, matchingFilterUsers, selectedUserIds]);

  const targetRecipients = getFilteredRecipients();
  const validRecipients = targetRecipients.filter(
    (u) => formatWhatsAppPhone(u.phone || (u as any).whatsapp || (u as any).mobile || '').length >= 10
  );

  // Toggle user selection (Max 20 users limit)
  const toggleSelectUser = (id: string) => {
    setSelectionWarning(null);
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= 20) {
        setSelectionWarning('Maximum 20 users can be selected at a time.');
        return;
      }
      next.add(id);
    }
    setSelectedUserIds(next);
  };

  const toggleSelectAllCustom = () => {
    setSelectionWarning(null);
    if (selectedUserIds.size > 0) {
      setSelectedUserIds(new Set());
    } else {
      const top20 = matchingFilterUsers.slice(0, 20).map((u) => u._id);
      setSelectedUserIds(new Set(top20));
      if (matchingFilterUsers.length > 20) {
        setSelectionWarning('Selected top 20 users from list (maximum 20 allowed).');
      }
    }
  };

  // Send Bulk WhatsApp Messages via socket
  const handleSendMessages = async () => {
    if (waState.status !== 'connected') {
      setSendResultMsg({
        type: 'error',
        text: 'WhatsApp is not connected. Please scan the QR code first.',
      });
      return;
    }

    if (validRecipients.length === 0) {
      setSendResultMsg({
        type: 'error',
        text: 'No valid target users with phone numbers selected.',
      });
      return;
    }

    if (!message.trim()) {
      setSendResultMsg({ type: 'error', text: 'Please enter a message to send.' });
      return;
    }

    setSending(true);
    setSendResultMsg(null);
    setSendProgress({ total: validRecipients.length, sent: 0, fail: 0 });

    try {
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: validRecipients,
          message,
          delayMs: 1200,
          forceSend,
        }),
      });

      const data = await res.json();
      if (data.success) {
        let msg = `Successfully dispatched to ${data.sentCount} users!`;
        if (data.skippedCount > 0) {
          msg += ` (${data.skippedCount} skipped due to 7-day frequency rule)`;
        }
        if (data.failCount > 0) {
          msg += ` (${data.failCount} failed)`;
        }

        setSendResultMsg({
          type: 'success',
          text: msg,
        });
        if (data.results) {
          setWaLogs((prev) => [...data.results, ...prev]);
        }
      } else {
        setSendResultMsg({
          type: 'error',
          text: data.error || 'Failed to send WhatsApp messages.',
        });
      }
    } catch (err: any) {
      setSendResultMsg({
        type: 'error',
        text: err.message || 'Error occurred while sending messages.',
      });
    } finally {
      setSending(false);
      setSendProgress(null);
      fetchStatus();
    }
  };

  // Send Single Test WhatsApp Message to any 03xx phone number
  const handleSendTestMessage = async () => {
    if (waState.status !== 'connected') {
      setTestResult({
        type: 'error',
        text: 'WhatsApp is not connected. Please scan the QR code first.',
      });
      return;
    }

    const cleanPhone = formatWhatsAppPhone(testPhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      setTestResult({
        type: 'error',
        text: 'Please enter a valid Pakistani phone number (e.g. 03352575725 or +923352575725).',
      });
      return;
    }

    if (!message.trim()) {
      setTestResult({ type: 'error', text: 'Please enter a message to send.' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [
            {
              phone: testPhone,
              name: 'Test Merchant',
              shopName: 'Test Shop',
              email: 'test@dukaankhata.app',
              plan: 'Pro',
              expiresAt: '2026-12-31',
            },
          ],
          message,
          forceSend: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.sentCount > 0) {
        setTestResult({
          type: 'success',
          text: `Test message successfully delivered to +${cleanPhone}!`,
        });
      } else {
        const errDetail = data.results?.[0]?.error || data.error || 'Failed to send test message.';
        setTestResult({
          type: 'error',
          text: `Error: ${errDetail}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        type: 'error',
        text: err.message || 'Failed to send test message.',
      });
    } finally {
      setSendingTest(false);
      fetchStatus();
    }
  };

  // Generate direct wa.me link for first selected or single recipient
  const handleOpenDirectWeb = (user?: User) => {
    const target = user || validRecipients[0];
    if (!target) return;
    const rawPhone = target.phone || (target as any).whatsapp || (target as any).mobile || '';
    const cleanPhone = formatWhatsAppPhone(rawPhone);

    const formattedMsg = message
      .replace(/\{name\}/gi, target.name || '')
      .replace(/\{shopName\}/gi, target.shopName || '')
      .replace(/\{email\}/gi, target.email || '')
      .replace(/\{plan\}/gi, target.subscription?.plan || 'Free')
      .replace(/\{expiresAt\}/gi, target.subscription?.expiresAt || 'N/A');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(formattedMsg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Preview user for variable replacement
  const previewUser = validRecipients[0] || users[0] || {
    name: 'Sample User',
    shopName: 'Bismillah Store',
    email: 'user@example.com',
    phone: '03352575725',
    subscription: { plan: 'Pro', expiresAt: '2026-10-15' },
    monthlyRevenue: 150000,
  };

  const samplePreviewText = message
    .replace(/\{name\}/gi, previewUser.name || 'Sample User')
    .replace(/\{shopName\}/gi, previewUser.shopName || (previewUser as any).resolvedShopName || 'My Shop')
    .replace(/\{email\}/gi, previewUser.email || 'user@example.com')
    .replace(/\{plan\}/gi, previewUser.subscription?.plan || (previewUser as any).plan || 'Pro')
    .replace(/\{expiresAt\}/gi, previewUser.subscription?.expiresAt || (previewUser as any).expiresAt || '2026-10-15')
    .replace(/\{monthlyRevenue\}/gi, `Rs. ${previewUser.monthlyRevenue || 0}`);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 md:p-8 text-white shadow-xl shadow-emerald-600/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
          <MessageSquare className="w-80 h-80 text-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-emerald-100">
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Admin Messaging Suite</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              WhatsApp Broadcast & QR Connection
            </h1>
            <p className="text-emerald-100 text-xs md:text-sm max-w-2xl leading-relaxed">
              Connect your WhatsApp account via QR Code scan to send automated updates, renewal reminders, and broadcast messages directly to DukaanKhata merchants.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>

            {waState.status === 'connected' ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2.5 bg-rose-500/90 hover:bg-rose-600 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-md"
              >
                {disconnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                <span>Disconnect WA</span>
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl transition flex items-center space-x-2 shadow-lg"
              >
                {connecting ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" /> : <QrCode className="w-4 h-4 text-emerald-700" />}
                <span>{waState.status === 'qr_ready' ? 'Refresh QR Code' : 'Connect WhatsApp QR'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Connection Status & Messaging Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: QR Code & Connection Status Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">WhatsApp Device Connection</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Baileys WebSocket Authentication</p>
                </div>
              </div>

              {/* Status Badge */}
              {waState.status === 'connected' && (
                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Connected</span>
                </span>
              )}
              {waState.status === 'qr_ready' && (
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>Scan QR Code</span>
                </span>
              )}
              {waState.status === 'connecting' && (
                <span className="px-3 py-1 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                  <span>Initializing...</span>
                </span>
              )}
              {(waState.status === 'disconnected' || waState.status === 'error') && (
                <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Disconnected</span>
                </span>
              )}
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-2xl relative min-h-[300px]">
              {waState.status === 'connected' ? (
                <div className="text-center space-y-4 py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 border-2 border-emerald-300 flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">WhatsApp Account Active</h4>
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      Phone: +{waState.phoneNumber || 'Connected'}
                    </p>
                    {waState.userName && (
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">Account: {waState.userName}</p>
                    )}
                    {waState.connectedAt && (
                      <p className="text-[10px] text-slate-400 font-medium mt-2">
                        Connected: {formatDisplayDate(waState.connectedAt)}
                      </p>
                    )}
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl transition shadow-xs"
                    >
                      Disconnect Device
                    </button>
                  </div>
                </div>
              ) : waState.status === 'qr_ready' && waState.qrCodeUrl ? (
                <div className="text-center space-y-4">
                  <div className="p-3 bg-white rounded-2xl shadow-md border-2 border-emerald-500/30 inline-block relative">
                    <img src={waState.qrCodeUrl} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 flex items-center justify-center space-x-1.5">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>Scan with WhatsApp camera on your phone</span>
                  </p>
                </div>
              ) : waState.status === 'connecting' ? (
                <div className="text-center space-y-3 py-12">
                  <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">Connecting to WhatsApp Web...</p>
                  <p className="text-[11px] text-slate-400">Generating secure encryption keys</p>
                </div>
              ) : (
                <div className="text-center space-y-4 py-10">
                  <div className="w-14 h-14 rounded-2xl bg-slate-200/60 text-slate-500 flex items-center justify-center mx-auto">
                    <QrCode className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800">No Active WhatsApp Session</h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                      Click the button below to generate a QR Code and connect your admin WhatsApp.
                    </p>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-600/20"
                  >
                    Generate WhatsApp QR
                  </button>
                </div>
              )}
            </div>

            {/* Step-by-Step Instructions */}
            <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/70">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5 text-sky-600" />
                <span>How to Connect WhatsApp</span>
              </h4>
              <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside font-medium leading-relaxed">
                <li>Open <strong>WhatsApp</strong> on your mobile phone.</li>
                <li>Tap <strong>Settings / Menu</strong> (3 dots) &rarr; <strong>Linked Devices</strong>.</li>
                <li>Tap <strong>Link a Device</strong> and point your camera at the QR code above.</li>
                <li>Once linked, your session stays connected for automated messaging.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Right Column: Message Composer & Recipient Selector */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Message Broadcaster</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Compose and send formatted WhatsApp text</p>
                </div>
              </div>

              <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-full flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-sky-600" />
                <span>{validRecipients.length} Target User{validRecipients.length !== 1 ? 's' : ''}</span>
              </span>
            </div>

            {/* Target Recipient Selector Filter */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-sky-600" />
                <span>Select Target Audience</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleTargetFilterChange('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'all'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Users ({users.length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('new7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'new7'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  New Users (&lt; 7 Days) (
                  {
                    users.filter((u) => {
                      if (!u.createdAt) return false;
                      const d = new Date(u.createdAt);
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 7);
                      return d >= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('active')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Active Users
                </button>
                <button
                  onClick={() => handleTargetFilterChange('pro')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'pro'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Pro Plan ({users.filter((u) => u.subscription?.plan === 'pro').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('free')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'free'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Free Plan ({users.filter((u) => u.subscription?.plan !== 'pro').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'inactive7'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Inactive (7+ Days) (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 7);
                      return !u.lastActivity || new Date(u.lastActivity) <= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive15')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'inactive15'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Inactive (15+ Days) (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 15);
                      return !u.lastActivity || new Date(u.lastActivity) <= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive30')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'inactive30'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Inactive (1 Month+) (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 30);
                      return !u.lastActivity || new Date(u.lastActivity) <= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive90')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'inactive90'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Inactive (3 Months+) (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 90);
                      return !u.lastActivity || new Date(u.lastActivity) <= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'custom'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Specific Users ({selectedUserIds.size > 0 ? `${selectedUserIds.size}/20` : 'Max 20'})
                </button>
              </div>

              {/* Logic Definition Tag Banner */}
              <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl text-xs flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-slate-900">Audience Logic Definition:</span>
                    <span className="px-2 py-0.5 bg-sky-100 border border-sky-200 text-sky-800 rounded-md font-mono text-[11px] font-bold">
                      logic: {targetFilter}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    {targetFilter === 'all' && (
                      <span>Includes all registered merchant accounts in database. You can check specific users below (max 20).</span>
                    )}
                    {targetFilter === 'new7' && (
                      <span>Includes merchants who signed up in the last 7 days (<code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded">createdAt &gt;= 7 days ago</code>). Perfect for welcome messages!</span>
                    )}
                    {targetFilter === 'active' && (
                      <span>Includes all active merchants except blocked/suspended accounts (<code className="font-mono text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">status !== &apos;suspended&apos; &amp;&amp; status !== &apos;blocked&apos;</code>).</span>
                    )}
                    {targetFilter === 'inactive7' && (
                      <span><strong>Churned Users (7+ Days)</strong>: Merchants whose last activity was 7 or more days ago (<code className="font-mono text-purple-700 bg-purple-50 px-1 py-0.5 rounded">lastActivity &lt;= 7 days ago</code>).</span>
                    )}
                    {targetFilter === 'inactive15' && (
                      <span><strong>Churned Users (15+ Days)</strong>: Merchants whose last activity was 15 or more days ago (<code className="font-mono text-orange-700 bg-orange-50 px-1 py-0.5 rounded">lastActivity &lt;= 15 days ago</code>).</span>
                    )}
                    {targetFilter === 'inactive30' && (
                      <span><strong>Churned Users (1 Month+)</strong>: Merchants whose last activity was 1 month (30 days) or more ago (<code className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded">lastActivity &lt;= 30 days ago</code>).</span>
                    )}
                    {targetFilter === 'inactive90' && (
                      <span><strong>Dormant Churned Users (3 Months+)</strong>: Merchants whose last activity was 3 months (90 days) or more ago (<code className="font-mono text-red-800 bg-red-50 px-1 py-0.5 rounded">lastActivity &lt;= 90 days ago</code>).</span>
                    )}
                    {targetFilter === 'pro' && (
                      <span>Includes merchants with an active Pro subscription (<code className="font-mono text-amber-700 bg-amber-50 px-1 py-0.5 rounded">subscription.plan === &apos;pro&apos;</code>).</span>
                    )}
                    {targetFilter === 'free' && (
                      <span>Includes merchants on Free/Trial plans (<code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">subscription.plan !== &apos;pro&apos;</code>).</span>
                    )}
                    {targetFilter === 'suspended' && (
                      <span>Includes merchants whose accounts are blocked or suspended (<code className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded">status === &apos;suspended&apos; || status === &apos;blocked&apos;</code>).</span>
                    )}
                    {targetFilter === 'custom' && (
                      <span>Allows hand-picking specific individual users (maximum 20 users allowed per message).</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Selectable User Picker List (Always visible for selected target filter) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Search ${matchingFilterUsers.length} matching merchant${matchingFilterUsers.length !== 1 ? 's' : ''} by name, shop or phone...`}
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setSelectionWarning(null);
                      }}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0">
                    <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                      Selected: <span className={selectedUserIds.size >= 20 ? 'text-amber-600 font-extrabold' : 'text-sky-600 font-extrabold'}>{selectedUserIds.size}</span> / 20
                    </span>
                    <button
                      onClick={toggleSelectAllCustom}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                    >
                      {selectedUserIds.size > 0 ? 'Deselect All' : 'Select Top 20'}
                    </button>
                  </div>
                </div>

                {selectionWarning && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center space-x-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{selectionWarning}</span>
                  </div>
                )}

                {matchingFilterUsers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500 font-medium bg-white rounded-lg border border-slate-200">
                    No merchants match the selected filter or search query.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {matchingFilterUsers.map((u) => {
                      const isSelected = selectedUserIds.has(u._id);
                      const isLimitReached = selectedUserIds.size >= 20 && !isSelected;
                      const rawPh = u.phone || (u as any).whatsapp || (u as any).mobile || '';
                      const cleanPh = formatWhatsAppPhone(rawPh);
                      const hasPhone = cleanPh.length >= 10;

                      return (
                        <div
                          key={u._id}
                          onClick={() => toggleSelectUser(u._id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition border ${
                            isLimitReached
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                              : isSelected
                              ? 'bg-sky-50 border-sky-200 text-sky-900 font-semibold cursor-pointer'
                              : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer'
                          }`}
                          title={isLimitReached ? 'Maximum 20 users limit reached' : ''}
                        >
                          <div className="flex items-center space-x-2 overflow-hidden mr-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isLimitReached}
                              onChange={() => {}}
                              className="rounded text-sky-600 focus:ring-sky-500 disabled:opacity-50"
                            />
                            <span className="font-bold truncate">{u.name}</span>
                            {u.shopName && <span className="text-slate-500 text-[11px] truncate">({u.shopName})</span>}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {u.subscription?.plan === 'pro' ? (
                              <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full font-bold text-[10px]">
                                PRO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-semibold text-[10px]">
                                Free
                              </span>
                            )}

                            {hasPhone ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[11px]">
                                +{cleanPh}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md font-semibold text-[10px]">
                                No Phone
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Target Audience User Preview Box (Shows matching merchants) */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-extrabold text-slate-900">
                      Target Audience Preview ({targetRecipients.length} matching merchant{targetRecipients.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {targetRecipients.length > 5 && (
                    <button
                      onClick={() => setShowAllPreview(!showAllPreview)}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold transition flex items-center space-x-1"
                    >
                      <span>{showAllPreview ? 'Show Less (5)' : `Show More (+${targetRecipients.length - 5})`}</span>
                    </button>
                  )}
                </div>

                {targetRecipients.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500 font-medium bg-white rounded-lg border border-slate-200">
                    No merchants match the selected filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {targetRecipients.slice(0, showAllPreview ? 30 : 5).map((u, idx) => {
                      const rawPh = u.phone || (u as any).whatsapp || (u as any).mobile || '';
                      const cleanPh = formatWhatsAppPhone(rawPh);
                      const hasPhone = cleanPh.length >= 10;

                      return (
                        <div
                          key={u._id || idx}
                          className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-sky-300 transition shadow-2xs"
                        >
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                              {u.name ? u.name.charAt(0).toUpperCase() : 'M'}
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-slate-900 truncate">
                                {u.name}{' '}
                                {u.shopName && <span className="text-slate-500 font-normal">({u.shopName})</span>}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Registered: {u.createdAt ? formatDisplayDate(u.createdAt) : 'N/A'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {u.subscription?.plan === 'pro' ? (
                              <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full font-bold text-[10px]">
                                PRO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-semibold text-[10px]">
                                Free
                              </span>
                            )}

                            {hasPhone ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[11px]">
                                +{cleanPh}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md font-semibold text-[10px]">
                                No Phone
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Preset Quick Templates */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Templates</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setMessage(tmpl.text)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                  >
                    {tmpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Variables Pills */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Insert Dynamic Placeholder
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    onClick={() => handleInsertVariable(v.tag)}
                    className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold rounded-md transition"
                  >
                    + {v.label} <span className="text-sky-500 text-[10px] font-mono">{v.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input Field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Message Content</span>
                <span className="text-[11px] text-slate-400 font-normal">{message.length} characters</span>
              </label>
              <textarea
                ref={textareaRef}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your WhatsApp message here. Use placeholders like {name}, {shopName}, {plan}..."
                className="w-full text-xs p-3.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-slate-800 leading-relaxed shadow-xs"
              />
            </div>

            {/* Live Sample Preview Box */}
            <div className="bg-emerald-950/90 text-emerald-100 p-4 rounded-xl border border-emerald-800 space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                <span className="flex items-center space-x-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>WhatsApp Message Preview</span>
                </span>
                <span>Recipient: {previewUser.name}</span>
              </div>
              <p className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-emerald-50">
                {samplePreviewText}
              </p>
            </div>

            {/* Test WhatsApp Message Section */}
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-extrabold text-emerald-900">
                    Send Test WhatsApp Message (Any 03xx Number)
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium">Instant Single Test</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Enter phone number starting with 03 (e.g. 03352575725)"
                    className="w-full text-xs px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-900"
                  />
                </div>
                <button
                  onClick={handleSendTestMessage}
                  disabled={sendingTest || !testPhone.trim() || waState.status !== 'connected'}
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 shadow-xs"
                >
                  {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test Message</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center space-x-2 ${
                    testResult.type === 'success'
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                      : 'bg-rose-100 border-rose-300 text-rose-900'
                  }`}
                >
                  {testResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                  )}
                  <span>{testResult.text}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {sendResultMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${
                  sendResultMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {sendResultMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{sendResultMsg.text}</span>
              </div>
            )}

            {/* Frequency Cooldown & Daily Limit Control */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Broadcast Rate Limits & Safeguards</span>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    todaySentCount >= dailyLimit
                      ? 'bg-rose-100 border border-rose-300 text-rose-800'
                      : 'bg-emerald-100 border border-emerald-300 text-emerald-800'
                  }`}
                >
                  Daily Quota: {todaySentCount} / {dailyLimit} Sent Today
                </span>
              </div>

              <label className="flex items-center space-x-2.5 text-xs text-slate-800 font-bold cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={forceSend}
                  onChange={(e) => setForceSend(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Force Send (Bypass 20 msgs/day daily cap & 15-day user cooldown limit)</span>
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed pl-6">
                {forceSend ? (
                  <span className="text-amber-700 font-semibold">
                    ⚠️ Override Active: All selected users will be sent this message regardless of daily limits or prior message timestamps.
                  </span>
                ) : (
                  <span>
                    🛡️ <strong>Safeguards Active</strong>: Max <strong>20 messages per day</strong>. Users who received a WhatsApp broadcast within the last <strong>15 days</strong> will be automatically skipped.
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                onClick={() => handleOpenDirectWeb()}
                disabled={validRecipients.length === 0}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2"
              >
                <ExternalLink className="w-4 h-4 text-slate-500" />
                <span>Open in Web WhatsApp (wa.me)</span>
              </button>

              <button
                onClick={handleSendMessages}
                disabled={sending || validRecipients.length === 0 || waState.status !== 'connected'}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 disabled:opacity-50"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>
                  {sending
                    ? 'Dispatching Messages...'
                    : `Send Automated Broadcast (${validRecipients.length} Users)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sent Campaign History Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Recent Dispatch Activity Logs</h3>
              <p className="text-[11px] text-slate-500 font-medium">History of sent WhatsApp messages from this session</p>
            </div>
          </div>

          <span className="text-xs font-semibold text-slate-500">{waLogs.length} Records</span>
        </div>

        {waLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            No message dispatch logs recorded yet in this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Recipient Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Sent Time</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{log.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">+{log.phone}</td>
                    <td className="py-3 px-4">
                      {log.success ? (
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[11px] inline-flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>Sent</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px] inline-flex items-center space-x-1">
                          <XCircle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {log.sentAt ? formatDisplayDate(log.sentAt) : 'Just now'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {log.error || 'Delivered to socket'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
