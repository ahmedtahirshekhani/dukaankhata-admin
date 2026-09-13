'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserX,
  Settings,
  Store,
  LogOut,
  ShieldCheck,
  UserCheck,
  MessageSquare,
  Menu,
  X,
} from 'lucide-react';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch((err) => console.error('Failed to fetch user context:', err));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Users & Subscriptions', href: '/dashboard/users', icon: Users },
    { label: 'WhatsApp Broadcast & QR', href: '/dashboard/whatsapp', icon: MessageSquare },
    { label: 'Deleted Leads', href: '/dashboard/deleted-leads', icon: UserX },
    { label: 'System Configuration', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-sky-600/20">
            <Store className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-wide">DukaanKhata Admin</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg focus:outline-none"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 shadow-sm flex flex-col justify-between transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 space-y-8">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-sky-600/20">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-base tracking-wide">
                DukaanKhata
              </h2>
              <p className="text-[11px] text-sky-600 font-semibold tracking-wider uppercase">
                Super Admin Portal
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs transition ${
                    isActive
                      ? 'bg-sky-50 text-sky-700 border border-sky-200/80 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="p-4 m-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{currentUser?.name || 'Super Admin'}</p>
              <div className="flex items-center space-x-1 text-[11px] text-sky-600 font-medium">
                <ShieldCheck className="w-3 h-3 text-sky-600 shrink-0" />
                <span className="capitalize">{currentUser?.role || 'admin'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {pathname === '/dashboard' && 'Executive Analytics'}
              {pathname === '/dashboard/users' && 'Users & Subscriptions Directory'}
              {pathname === '/dashboard/whatsapp' && 'WhatsApp Broadcast & QR Center'}
              {pathname === '/dashboard/deleted-leads' && 'Deleted Leads Archive'}
              {pathname === '/dashboard/settings' && 'System Configuration'}
            </h1>
            <p className="text-xs text-slate-500">
              Database Cluster Connected
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>MongoDB Connected</span>
            </div>
            {currentUser && (
              <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 text-xs text-slate-700 font-medium">
                <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                <span>{currentUser.email}</span>
              </div>
            )}
          </div>
        </header>

        {/* Page Body */}
        <div className="p-4 md:p-8 flex-1">{children}</div>
      </main>
    </div>
  );
}
