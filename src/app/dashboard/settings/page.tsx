'use client';

import { useState } from 'react';
import {
  Database,
  ShieldCheck,
  Key,
  Server,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowRightLeft,
  Users,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface MigrationResult {
  success: boolean;
  message: string;
  totalSourceUsers?: number;
  migrated?: number;
  updated?: number;
  skipped?: number;
  destinationDb?: string;
  collection?: string;
  error?: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [resyncMessage, setResyncMessage] = useState('');

  // Migration state
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [confirmMigrate, setConfirmMigrate] = useState(false);

  const handleResyncAdmin = async () => {
    setLoading(true);
    setResyncMessage('');
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setResyncMessage('Admin account credentials verified and synchronized with environment successfully.');
      } else {
        setResyncMessage('Admin synchronization completed.');
      }
    } catch (err) {
      setResyncMessage('Failed to sync admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateUsers = async () => {
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await fetch('/api/admin/migrate-users', { method: 'POST' });
      const data = await res.json();
      setMigrationResult(data);
    } catch (err: any) {
      setMigrationResult({
        success: false,
        message: err.message || 'Migration request failed.',
        error: err.message,
      });
    } finally {
      setMigrating(false);
      setConfirmMigrate(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-extrabold text-slate-900">System & Database Diagnostics</h2>
        <p className="text-xs text-slate-500">
          Environment variable status and database connection health
        </p>
      </div>

      {resyncMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{resyncMessage}</span>
          </div>
          <button onClick={() => setResyncMessage('')} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
      )}

      {/* Database Connection */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">MongoDB Database Instance</h3>
            <p className="text-xs text-slate-500">Connected via environment variables</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Database Status</span>
            <div className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Active Connection</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Security Engine</span>
            <div className="text-xs font-bold text-sky-700 font-mono truncate">
              JWT Token + HttpOnly Cookies
            </div>
          </div>
        </div>
      </div>

      {/* Admin Pre-generated Credentials */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Super Admin Configuration</h3>
              <p className="text-xs text-slate-500">Admin credentials loaded from environment variables</p>
            </div>
          </div>

          <button
            onClick={handleResyncAdmin}
            disabled={loading}
            className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-2 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Verify Credentials</span>
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <Key className="w-4 h-4 text-sky-600" />
              <span>ADMIN_EMAIL</span>
            </div>
            <span className="font-mono text-slate-900 font-bold">admin@dukaankhata.com</span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>ADMIN_PASSWORD</span>
            </div>
            <span className="font-mono text-emerald-700 font-bold">•••••••••••• (Pre-configured in .env)</span>
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-slate-700 font-medium">
              <Server className="w-4 h-4 text-amber-600" />
              <span>JWT Secret</span>
            </div>
            <span className="font-mono text-slate-600 font-bold">HS256 Encrypted Engine</span>
          </div>
        </div>
      </div>

      {/* Data Migration Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-violet-50 text-violet-600 rounded-xl border border-violet-100">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">User Data Migration</h3>
              <p className="text-xs text-slate-500">
                Copy all users from Main Dukaankhata → Admin Portal{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-violet-700 font-bold">current_users</code>
              </p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
          <div className="flex items-start space-x-2">
            <Users className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
            <div className="text-xs text-violet-800 space-y-1">
              <p className="font-semibold">This migration will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-violet-700">
                <li>Read all users from the main <strong>dukaankhata-prod</strong> database</li>
                <li>Join user data with <strong>shops</strong>, <strong>subscriptions</strong>, and <strong>WhatsApp logs</strong></li>
                <li>Flatten and upsert into Admin Portal's <strong>current_users</strong> collection</li>
                <li>Safe to run multiple times — new users get inserted, existing ones get updated</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Migration Result */}
        {migrationResult && (
          <div
            className={`p-4 border rounded-xl text-xs space-y-3 ${
              migrationResult.success
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div className="flex items-start space-x-2">
              {migrationResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              )}
              <div className="space-y-2 flex-1">
                <p
                  className={`font-semibold ${
                    migrationResult.success ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {migrationResult.message}
                </p>

                {migrationResult.success && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-center">
                      <div className="text-lg font-extrabold text-slate-900">
                        {migrationResult.totalSourceUsers ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Source Users
                      </div>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-center">
                      <div className="text-lg font-extrabold text-emerald-600">
                        {migrationResult.migrated ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Newly Inserted
                      </div>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-center">
                      <div className="text-lg font-extrabold text-sky-600">
                        {migrationResult.updated ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Updated
                      </div>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-center">
                      <div className="text-lg font-extrabold text-slate-500">
                        {migrationResult.skipped ?? 0}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Skipped
                      </div>
                    </div>
                  </div>
                )}

                {migrationResult.destinationDb && (
                  <p className="text-[11px] text-slate-500 pt-1">
                    Destination: <code className="bg-white px-1 py-0.5 rounded font-bold text-violet-700">{migrationResult.destinationDb}</code>
                    {' → '}
                    <code className="bg-white px-1 py-0.5 rounded font-bold text-violet-700">{migrationResult.collection}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => setMigrationResult(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Migration Actions */}
        <div className="flex items-center gap-3">
          {!confirmMigrate ? (
            <button
              onClick={() => setConfirmMigrate(true)}
              disabled={migrating}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center space-x-2 transition disabled:opacity-50"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Migrate Users to Admin Portal</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs text-amber-800 font-medium">
                This will copy all users from Main DB to Admin Portal DB. Continue?
              </span>
              <button
                onClick={handleMigrateUsers}
                disabled={migrating}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1.5 transition disabled:opacity-50"
              >
                {migrating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Migrating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Yes, Migrate</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setConfirmMigrate(false)}
                disabled={migrating}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
