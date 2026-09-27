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
  Dices,
  Shuffle,
  Plus,
  Trash2,
  StopCircle,
} from 'lucide-react';
import { formatDisplayDate, formatTimeAgo } from '@/lib/format-date';
import { formatWhatsAppPhone, parseSpintax, replaceTemplateVariables } from '@/lib/whatsapp/phone-utils';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  shopName?: string;
  phone?: string;
  lastWaMessageSentAt?: string;
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
  { label: 'Spintax Greeting', tag: '{Assalam o Alaikum|Hello|Salam}' },
];

const QUICK_TEMPLATES = [
  {
    title: '🎉 Welcome New Merchant (3 Variants)',
    variants: [
      'Assalam o Alaikum {name} - {shopName}! 🎉\n\nWelcome to Dukaankhata! 🥳\nAb aapki dukaandari aur hisaab-kitaab properly manage hone wala hai. 😎\n\nPlease iss application ko ziyada mat use kijiyega...\nwarna aapki dukaandari itni smoothly manage hone lagegi ke phir “hisaab nahi mil raha” ka bahana bhi nahi chalega. 😂\n\nAur agar app use karte hue koi bhi sawal, confusion ya help chahiye ho, toh feel free to WhatsApp us:\n\n📞 Customer Support: 0335-2575725 (Kashan Shekhani)\n📞 Customer Support: 0335-2787275 (Hammad Shekhani)\n📞 Help & Support: 0321-2575665\n\nAapki dukaandari ko easy banana humari first priority hai —\nkyun ke hisaab manage karna mushkil nahi hona chahiye, customers already kaafi hain. 😂\n\nShukriya,\nDukaanKhata Team 💙',
      'Assalam o Alaikum {name}! 👋\n\nDukaanKhata par account create karne ka bohot bohot shukriya! {shopName} ka hisaab-kitaab ab automatic aur 100% safe rahega.\n\nAgar aap ko app run karte huay koi bhi help ya guide chahiye ho, to aap kisi bhi waqt support team se rabta kar sakte hain:\n\n📞 Support: 0335-2575725 (Kashan Shekhani)\n📞 Support: 0335-2787275 (Hammad Shekhani)\n\nBest regards,\nDukaanKhata Team 💙',
      'Dear {name} ({shopName}), Welcome to DukaanKhata! 🚀\n\nAap ka merchant account active ho chuka hai. Daily sales, customer khata balance aur payment receipts ab mobile par easily manage kijiye.\n\nSupport & Help desk:\n📞 0335-2575725\n📞 0335-2787275\n\nHave a profitable and successful day ahead!',
    ],
  },
  {
    title: '💬 Churned Win-Back (3 Variants)',
    variants: [
      'Assalam o Alaikum {name} ({shopName})! 👋\n\nHum ne notice kiya ke aap ne kuch dino se DukaanKhata app check nahi ki.\n\nAap ki dukaandari ke hisaab-kitaab ko aasan banana humari pehli tarjeeh hai. App mein naye features add hue hain jisse aap ki daily sales aur hisaab-khata mazeed tez ho jaye ga!\n\nAaj hi app kholain aur apna hisaab up-to-date karain: https://dukaankhata.app\n\nAgar koi problem aa rahi hai toh humse direct baat karain:\n📞 Support: 0335-2575725\n\nShukriya,\nDukaanKhata Team 💙',
      'Hey {name}! {shopName} ka khata balance up-to-date hai? 🛍️\n\nHum ne DukaanKhata mein new updates add ki hain jisse daily ledger records aur PDF invoices bohot fast ban jate hain. Log in now at https://dukaankhata.app\n\nNeed assistance? Call/WhatsApp: 0335-2575725',
      'Assalam o Alaikum {name},\n\nAap ke shop {shopName} ka hisaab-khata pending hai. Simply open DukaanKhata app to record your transactions hassle-free.\n\n📞 Support: 0335-2575725',
    ],
  },
  {
    title: 'Payment Reminder (2 Variants)',
    variants: [
      'Assalam o Alaikum {name},\n\nFriendly reminder: Your DukaanKhata {plan} plan is active for {shopName}. Please ensure your account balance or renewal is up to date.\n\nThank you!',
      'Hello {name}! 👋\n\nThis is a friendly reminder regarding your {shopName} subscription ({plan} plan). Please renew your plan to continue uninterrupted service.\n\nRegards,\nDukaanKhata Team',
    ],
  },
  {
    title: 'Pro Feature Upgrade (2 Variants)',
    variants: [
      'Hello {name} ({shopName}),\n\nUpgrade to DukaanKhata Pro to unlock unlimited transactions, priority WhatsApp support, and custom PDF invoices!\n\nBest regards,\nDukaanKhata Team',
      'Assalam o Alaikum {name}! 🚀\n\nTake {shopName} to the next level with DukaanKhata Pro. Enjoy automated customer alerts, PDF reports, and priority 24/7 support.',
    ],
  },
  {
    title: 'General Update (2 Variants)',
    variants: [
      'Dear {name},\n\nWe have updated the DukaanKhata app with exciting new features for your shop {shopName}.\n\nLog in today to check them out!',
      'Assalam o Alaikum {name}! 👋\n\nNew feature alert for {shopName}! Open your DukaanKhata app today to see what\'s new.',
    ],
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

  // Message Variants State
  const [variants, setVariants] = useState<string[]>(QUICK_TEMPLATES[0].variants);
  const [activeVariantTab, setActiveVariantTab] = useState<number>(0);

  // Anti-Spam & Delay Settings State (Default: Random Gap between 30-60 seconds)
  const [useRandomDelay, setUseRandomDelay] = useState<boolean>(true);
  const [minDelaySec, setMinDelaySec] = useState<number>(30);
  const [maxDelaySec, setMaxDelaySec] = useState<number>(60);
  const [forceSend, setForceSend] = useState(false);

  // Live Dispatch Progress State
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ total: number; sent: number; fail: number } | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(0);
  const [currentSendingInfo, setCurrentSendingInfo] = useState<{
    currentIndex: number;
    total: number;
    name: string;
    variantIdx: number;
  } | null>(null);
  const cancelSendingRef = useRef<boolean>(false);

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
      setTimeout(() => fetchStatus(), 1000);
      setTimeout(() => fetchStatus(), 2500);
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

  // Variant editing handlers
  const handleUpdateVariant = (index: number, val: string) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleAddVariant = () => {
    if (variants.length >= 5) return;
    setVariants((prev) => [...prev, '']);
    setActiveVariantTab(variants.length);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
    if (activeVariantTab >= index && activeVariantTab > 0) {
      setActiveVariantTab(activeVariantTab - 1);
    }
  };

  // Insert template variable into active variant text field
  const handleInsertVariable = (tag: string) => {
    const currentText = variants[activeVariantTab] || '';
    if (!textareaRef.current) {
      handleUpdateVariant(activeVariantTab, currentText + ' ' + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newText = currentText.substring(0, start) + tag + currentText.substring(end);
    handleUpdateVariant(activeVariantTab, newText);
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

    // Sort logic:
    // 1. Valid Phone + Never Sent -> Super Top (Tier 1) - Sorted by highest last seen (lastActivity desc)
    // 2. Valid Phone + Previously Sent -> Next (Tier 2) - Sorted by highest last seen (lastActivity desc)
    // 3. No Phone -> Very bottom (Tier 3)
    return [...result].sort((a, b) => {
      const aPhoneClean = formatWhatsAppPhone(a.phone || (a as any).whatsapp || (a as any).mobile || '');
      const bPhoneClean = formatWhatsAppPhone(b.phone || (b as any).whatsapp || (b as any).mobile || '');

      const aHasPhone = aPhoneClean.length >= 10;
      const bHasPhone = bPhoneClean.length >= 10;

      const aTier = !aHasPhone ? 3 : !a.lastWaMessageSentAt ? 1 : 2;
      const bTier = !bHasPhone ? 3 : !b.lastWaMessageSentAt ? 1 : 2;

      if (aTier !== bTier) {
        return aTier - bTier;
      }

      // Within the same tier, sort by highest last seen (lastActivity desc)
      const aActivity = a.lastActivity
        ? new Date(a.lastActivity).getTime()
        : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
      const bActivity = b.lastActivity
        ? new Date(b.lastActivity).getTime()
        : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;

      return bActivity - aActivity;
    });
  }, [users, targetFilter, userSearch]);

  const matchingFilterUsers = getMatchingFilterUsers();

  // Final Target Recipients (max 20 users):
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

  // Stop dispatch execution
  const handleStopSending = () => {
    cancelSendingRef.current = true;
  };

  // Send Bulk WhatsApp Messages with random gap (10-20s) and random variants
  const handleSendMessages = async () => {
    if (waState.status !== 'connected') {
      setSendResultMsg({
        type: 'error',
        text: 'WhatsApp is not connected. Please scan the QR code first.',
      });
      return;
    }

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    if (activeVariants.length === 0) {
      setSendResultMsg({
        type: 'error',
        text: 'Please enter at least one message variant to send.',
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

    setSending(true);
    cancelSendingRef.current = false;
    setSendResultMsg(null);
    setSendProgress({ total: validRecipients.length, sent: 0, fail: 0 });

    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < validRecipients.length; i++) {
      if (cancelSendingRef.current) {
        setSendResultMsg({
          type: 'error',
          text: `Broadcast cancelled by admin. Sent ${sentCount} of ${validRecipients.length} messages.`,
        });
        break;
      }

      const user = validRecipients[i];
      const variantIdx = Math.floor(Math.random() * activeVariants.length);
      const chosenVariant = activeVariants[variantIdx];

      setCurrentSendingInfo({
        currentIndex: i + 1,
        total: validRecipients.length,
        name: user.name,
        variantIdx: variantIdx + 1,
      });

      try {
        const res = await fetch('/api/admin/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [user],
            variants: [chosenVariant],
            forceSend,
          }),
        });

        const data = await res.json();
        const nowIso = new Date().toISOString();
        if (data.success && data.sentCount > 0) {
          sentCount++;
          if (data.results?.[0]) {
            setWaLogs((prev) => [data.results[0], ...prev]);
          }
          // Update lastWaMessageSentAt locally for live UI updates
          setUsers((prevUsers) =>
            prevUsers.map((u) =>
              u._id === user._id || u.phone === user.phone
                ? { ...u, lastWaMessageSentAt: nowIso }
                : u
            )
          );
        } else if (data.skippedCount > 0) {
          skippedCount++;
        } else {
          failCount++;
          if (data.results?.[0]) {
            setWaLogs((prev) => [data.results[0], ...prev]);
          }
        }
      } catch (err: any) {
        failCount++;
      }

      setSendProgress({
        total: validRecipients.length,
        sent: sentCount,
        fail: failCount,
      });

      // If not last recipient and not cancelled, wait random gap (30s to 60s)
      if (i < validRecipients.length - 1 && !cancelSendingRef.current) {
        let gapSec = minDelaySec;
        if (useRandomDelay) {
          const minS = Math.max(1, Number(minDelaySec) || 30);
          const maxS = Math.max(minS, Number(maxDelaySec) || 60);
          gapSec = Math.floor(Math.random() * (maxS - minS + 1)) + minS;
        }

        for (let s = gapSec; s > 0; s--) {
          if (cancelSendingRef.current) break;
          setCountdownSec(s);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        setCountdownSec(0);
      }
    }

    setSending(false);
    setSendProgress(null);
    setCurrentSendingInfo(null);
    setCountdownSec(0);
    fetchStatus();

    if (!cancelSendingRef.current) {
      let msg = `Broadcast complete! Dispatched to ${sentCount} merchants with random gap (${minDelaySec}-${maxDelaySec}s) & variants.`;
      if (skippedCount > 0) msg += ` (${skippedCount} skipped due to 15-day frequency rule)`;
      if (failCount > 0) msg += ` (${failCount} failed)`;

      setSendResultMsg({
        type: 'success',
        text: msg,
      });
    }
  };

  // Send Single Test WhatsApp Message using random variant selection
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

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    if (activeVariants.length === 0) {
      setTestResult({ type: 'error', text: 'Please enter a message variant to send.' });
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
          variants: activeVariants,
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

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    const chosenVariant = activeVariants[activeVariantTab] || activeVariants[0] || '';
    const formattedMsg = parseSpintax(replaceTemplateVariables(chosenVariant, target));

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

  const getSamplePreviewText = (variantIdx: number) => {
    const rawText = variants[variantIdx] || variants[0] || '';
    const replaced = replaceTemplateVariables(rawText, previewUser);
    return parseSpintax(replaced);
  };

  // Estimated Total Broadcast Duration
  const estimatedMinTotalSec = validRecipients.length * (useRandomDelay ? minDelaySec : minDelaySec);
  const estimatedMaxTotalSec = validRecipients.length * (useRandomDelay ? maxDelaySec : minDelaySec);

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
              <span>Admin Messaging Suite & Anti-Spam Engine</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              WhatsApp Broadcast & Random Variant Engine
            </h1>
            <p className="text-emerald-100 text-xs md:text-sm max-w-2xl leading-relaxed">
              Connect your WhatsApp account to send automated broadcasts with <strong>random 30–60s gap delays</strong> and <strong>2–3 message variants</strong> to prevent WhatsApp rate limits & account bans.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-xs"
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
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
                      className="px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl transition shadow-2xs"
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Message Broadcaster & Variant Engine</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Compose 2–3 variants & set random gaps</p>
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'all'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  All Users ({users.length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('new7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'new7'
                      ? 'bg-teal-600 text-white shadow-2xs'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Active Users
                </button>
                <button
                  onClick={() => handleTargetFilterChange('pro')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'pro'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Pro Plan ({users.filter((u) => u.subscription?.plan === 'pro').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('free')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'free'
                      ? 'bg-slate-700 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Free Plan ({users.filter((u) => u.subscription?.plan !== 'pro').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'inactive7'
                      ? 'bg-purple-600 text-white shadow-2xs'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'inactive15'
                      ? 'bg-orange-600 text-white shadow-2xs'
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
                  onClick={() => handleTargetFilterChange('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${targetFilter === 'custom'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Specific Users ({selectedUserIds.size > 0 ? `${selectedUserIds.size}/20` : 'Max 20'})
                </button>
              </div>

              {/* User Picker & Preview List */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Search ${matchingFilterUsers.length} matching merchant${matchingFilterUsers.length !== 1 ? 's' : ''}...`}
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setSelectionWarning(null);
                      }}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 border border-emerald-200 rounded-lg">
                      🔥 Priority: Never Sent Super Top (Highest Last Active)
                    </span>
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
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {matchingFilterUsers.slice(0, 50).map((u) => {
                      const isSelected = selectedUserIds.has(u._id);
                      const isLimitReached = selectedUserIds.size >= 20 && !isSelected;
                      const rawPh = u.phone || (u as any).whatsapp || (u as any).mobile || '';
                      const cleanPh = formatWhatsAppPhone(rawPh);
                      const hasPhone = cleanPh.length >= 10;

                      return (
                        <div
                          key={u._id}
                          onClick={() => toggleSelectUser(u._id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition border ${isLimitReached
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                              : isSelected
                                ? 'bg-sky-50 border-sky-200 text-sky-900 font-semibold cursor-pointer'
                                : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer'
                            }`}
                        >
                          <div className="flex items-center space-x-2 overflow-hidden mr-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isLimitReached}
                              onChange={() => { }}
                              className="rounded text-sky-600 focus:ring-sky-500 disabled:opacity-50"
                            />
                            <span className="font-bold truncate">{u.name}</span>
                            {u.shopName && <span className="text-slate-500 text-[11px] truncate">({u.shopName})</span>}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {hasPhone ? (
                              <div className="flex flex-col items-end shrink-0">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[11px]">
                                  +{cleanPh}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  Last sent: {formatTimeAgo(u.lastWaMessageSentAt)}
                                </span>
                              </div>
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

            {/* Quick Preset Templates */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Multi-Variant Templates</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setVariants([...tmpl.variants]);
                      setActiveVariantTab(0);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                  >
                    {tmpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Variant Message Composer Tabs */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center space-x-2">
                  <Shuffle className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Message Variants ({variants.filter((v) => v.trim()).length} Active)
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {variants.length < 5 && (
                    <button
                      onClick={handleAddVariant}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Variant {variants.length + 1}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Variant Tabs Header */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {variants.map((v, idx) => (
                  <div key={idx} className="flex items-center shrink-0">
                    <button
                      onClick={() => setActiveVariantTab(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${activeVariantTab === idx
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                      <span>Variant {idx + 1}</span>
                      {v.trim() ? (
                        <span className={`w-2 h-2 rounded-full ${activeVariantTab === idx ? 'bg-emerald-200' : 'bg-emerald-500'}`} />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                      )}
                    </button>
                    {variants.length > 1 && (
                      <button
                        onClick={() => handleRemoveVariant(idx)}
                        className="ml-1 p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Remove Variant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Insert Variables Pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Insert Variables into Variant {activeVariantTab + 1}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.tag}
                      onClick={() => handleInsertVariable(v.tag)}
                      className="px-2 py-0.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold rounded-md transition"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea Editor for Active Variant */}
              <div className="space-y-1">
                <textarea
                  ref={textareaRef}
                  rows={5}
                  value={variants[activeVariantTab] || ''}
                  onChange={(e) => handleUpdateVariant(activeVariantTab, e.target.value)}
                  placeholder={`Type Variant ${activeVariantTab + 1} text here. Use placeholders like {name}, {shopName} or Spintax {Salam|Hello}...`}
                  className="w-full text-xs p-3.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800 leading-relaxed shadow-2xs"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
                  <span>Variant {activeVariantTab + 1} of {variants.length}</span>
                  <span>{(variants[activeVariantTab] || '').length} characters</span>
                </div>
              </div>
            </div>

            {/* Anti-Spam Safeguards & Random Gap Configurator */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Dices className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">
                      Anti-Spam Delay Engine (Random Gap)
                    </h4>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      Random intervals between messages prevent WhatsApp bans
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-bold text-xs flex items-center space-x-1.5 shrink-0">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Random Gap: {minDelaySec}s – {maxDelaySec}s</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-emerald-900 flex items-center space-x-1">
                    <span>Minimum Gap (Seconds)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={minDelaySec}
                    onChange={(e) => setMinDelaySec(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-emerald-900 flex items-center space-x-1">
                    <span>Maximum Gap (Seconds)</span>
                  </label>
                  <input
                    type="number"
                    min={minDelaySec}
                    max={120}
                    value={maxDelaySec}
                    onChange={(e) => setMaxDelaySec(Math.max(minDelaySec, parseInt(e.target.value) || minDelaySec))}
                    className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-800 bg-white/70 p-3 rounded-xl border border-emerald-200">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Estimated duration for <strong>{validRecipients.length} recipients</strong>: ~{estimatedMinTotalSec}s to {estimatedMaxTotalSec}s
                  </span>
                </div>

                <label className="flex items-center space-x-2 font-bold cursor-pointer text-slate-900 select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={forceSend}
                    onChange={(e) => setForceSend(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Bypass 20 msgs/day & 15-day rules</span>
                </label>
              </div>
            </div>

            {/* Live Message Sample Preview Box */}
            <div className="bg-emerald-950/90 text-emerald-100 p-4 rounded-xl border border-emerald-800 space-y-3 shadow-inner">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                <span className="flex items-center space-x-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Live Variant Preview ({variants.filter((v) => v.trim()).length} variants active)</span>
                </span>
                <span>Recipient: {previewUser.name}</span>
              </div>

              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                {variants.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveVariantTab(idx)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition ${activeVariantTab === idx
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800'
                      }`}
                  >
                    Preview Variant {idx + 1}
                  </button>
                ))}
              </div>

              <p className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-emerald-50 bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/60">
                {getSamplePreviewText(activeVariantTab)}
              </p>
            </div>

            {/* Live Dispatch Countdown Overlay */}
            {sending && (
              <div className="p-4 bg-sky-50 border-2 border-sky-400 rounded-2xl space-y-3 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
                    <span className="text-xs font-extrabold text-sky-950">
                      Broadcasting ({sendProgress?.sent || 0} / {sendProgress?.total || 0} Sent)
                    </span>
                  </div>
                  <button
                    onClick={handleStopSending}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>Stop Broadcast</span>
                  </button>
                </div>

                {currentSendingInfo && (
                  <p className="text-xs text-sky-800 font-medium">
                    Sending to <strong>{currentSendingInfo.name}</strong> ({currentSendingInfo.currentIndex} of {currentSendingInfo.total}) using <strong>Variant {currentSendingInfo.variantIdx}</strong>...
                  </p>
                )}

                {countdownSec > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-sky-200 flex items-center justify-between text-xs text-sky-900 font-bold">
                    <span className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-sky-600 animate-spin" />
                      <span>Random Gap Cooldown Active</span>
                    </span>
                    <span className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded-md font-mono font-extrabold text-xs">
                      ⏱️ Next message in {countdownSec}s
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Test WhatsApp Message Section */}
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-extrabold text-emerald-900">
                    Send Single Test WhatsApp Message (Any 03xx Number)
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
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 shadow-2xs"
                >
                  {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test Message</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center space-x-2 ${testResult.type === 'success'
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
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${sendResultMsg.type === 'success'
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
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
