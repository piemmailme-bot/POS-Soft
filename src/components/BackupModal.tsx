import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Cloud,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Shield,
  Trash2,
  Copy,
  Play,
  Download,
  Upload,
  HardDrive,
  FileCode2,
  FileJson,
  RotateCcw,
  X,
  Clock,
} from 'lucide-react';
import { authFetch } from '../utils/api';

interface SupabaseStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

interface BackupCounts {
  products: number;
  ledger: number;
  purchases?: number;
  gstPayments?: number;
  accountVouchers?: number;
  partyAccounts?: number;
  returnNotes?: number;
  fixedAssets?: number;
  drawerClosings?: number;
  cashiers: number;
  categories: number;
  auditLogs: number;
  loosePackets: number;
}

interface BackupSnapshotInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  source: string;
  counts: BackupCounts;
}

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReload: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose, onReload }) => {
  const [status, setStatus] = useState<SupabaseStatus>({
    configured: false,
    connected: false,
    message: 'Loading...',
  });
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [showConnectionConfig, setShowConnectionConfig] = useState(false);

  const [dbSource, setDbSource] = useState<string>('Supabase PostgreSQL');
  const [liveCounts, setLiveCounts] = useState<BackupCounts | null>(null);
  const [snapshots, setSnapshots] = useState<BackupSnapshotInfo[]>([]);
  const [pendingRestoreSnapshot, setPendingRestoreSnapshot] = useState<string | null>(null);
  const [pendingUploadBackup, setPendingUploadBackup] = useState<{
    fileName: string;
    payload: any;
    counts: BackupCounts;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
      setPendingRestoreSnapshot(null);
      setPendingUploadBackup(null);
      fetchStatus();
      fetchBackupSummary();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/supabase/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false, message: 'Failed to fetch status' });
    }
  };

  const fetchBackupSummary = async () => {
    try {
      const res = await authFetch('/api/backup/snapshots');
      if (!res.ok) return;
      const data = await res.json();
      if (data.source) setDbSource(data.source);
      if (data.counts) setLiveCounts(data.counts);
      if (Array.isArray(data.snapshots)) setSnapshots(data.snapshots);
    } catch {
      // non-fatal
    }
  };

  const handleDownloadJsonBackup = async () => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/backup/export');
      if (!res.ok) throw new Error('Backup export failed');
      const data = await res.json();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `Deganga_CADPFSCS_DB_Backup_${stamp}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setSuccess(`Downloaded JSON database backup (${filename}).`);
    } catch (e: any) {
      setError(e?.message || 'Failed to download JSON backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadSqlBackup = async () => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/backup/export-sql');
      if (!res.ok) throw new Error('SQL export failed');
      const sqlText = await res.text();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `Deganga_CADPFSCS_DB_Backup_${stamp}.sql`;
      const blob = new Blob([sqlText], { type: 'application/sql;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setSuccess(`Downloaded SQL database backup (${filename}).`);
    } catch (e: any) {
      setError(e?.message || 'Failed to download SQL backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadSnapshot = async (filename: string) => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch(`/api/backup/snapshots/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Snapshot download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to download snapshot.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/backup/snapshot', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Snapshot creation failed');
      }
      setSuccess(`Saved server backup snapshot "${data.snapshot.filename}".`);
      await fetchBackupSummary();
      onReload();
    } catch (e: any) {
      setError(e?.message || 'Failed to create server snapshot.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDeleteSnapshot = async (filename: string) => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch(`/api/backup/snapshots/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete snapshot');
      setSuccess(`Removed snapshot "${filename}".`);
      await fetchBackupSummary();
    } catch (e: any) {
      setError(e?.message || 'Could not remove snapshot.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreSnapshot = async (filename: string) => {
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotFilename: filename }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Restore failed');
      }
      setPendingRestoreSnapshot(null);
      setSuccess(`Restored database from "${filename}" (${data.counts.products} products, ${data.counts.ledger} sales rows).`);
      await fetchBackupSummary();
      onReload();
    } catch (e: any) {
      setError(e?.message || 'Database restore failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const source = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      const counts: BackupCounts = {
        products: Array.isArray(source.products) ? source.products.length : 0,
        ledger: Array.isArray(source.ledger) ? source.ledger.length : 0,
        cashiers: Array.isArray(source.cashiers) ? source.cashiers.length : 0,
        categories: Array.isArray(source.categories) ? source.categories.length : 0,
        auditLogs: Array.isArray(source.auditLogs) ? source.auditLogs.length : 0,
        loosePackets: Array.isArray(source.loosePackets) ? source.loosePackets.length : 0,
      };
      if (counts.products === 0 && counts.ledger === 0 && counts.cashiers === 0) {
        setError('Selected JSON file does not contain valid POS database tables.');
        return;
      }
      setPendingUploadBackup({ fileName: file.name, payload: parsed, counts });
    } catch {
      setError('Could not parse backup JSON file. Please select a valid .json database backup.');
    }
  };

  const handleConfirmUploadedRestore = async () => {
    if (!pendingUploadBackup) return;
    setBackupBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingUploadBackup.payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Restore failed');
      }
      setSuccess(
        `Database restored from "${pendingUploadBackup.fileName}" (${data.counts.products} products, ${data.counts.ledger} sales rows).`
      );
      setPendingUploadBackup(null);
      await fetchBackupSummary();
      onReload();
    } catch (e: any) {
      setError(e?.message || 'Restore from file failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleValidate = async () => {
    if (!url || !key) {
      setError('Please provide both URL and Service Role Key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authFetch('/api/supabase/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, key }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(data.message);
      } else {
        setError(data.message);
      }
    } catch {
      setError('Validation request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/supabase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, key }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Configuration saved and connected!');
        fetchStatus();
        fetchBackupSummary();
        onReload();
      } else {
        setError('Failed to save configuration');
      }
    } catch {
      setError('Save request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/supabase/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Cloud Storage disconnected. All transactions are now strictly locked until reconnected.');
        await fetchStatus();
        fetchBackupSummary();
        setUrl('');
        setKey('');
        onReload();
      }
    } catch {
      setError('Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReconnectDefault = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/supabase/status?reconnect=1', { cache: 'no-store' });
      const data = await res.json();
      setStatus(data);
      if (data?.connected) {
        setSuccess('Cloud Storage reconnected and active! Transactions are now unlocked.');
        fetchBackupSummary();
        onReload();
      } else {
        setError(data?.message || 'Could not reconnect to Cloud Storage. Check internet or database credentials.');
      }
    } catch {
      setError('Reconnect request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await authFetch('/api/supabase/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Manual cloud sync completed successfully!');
        fetchBackupSummary();
      } else {
        setError(data.message);
      }
    } catch {
      setError('Sync request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="backup-modal-overlay"
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl text-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-900/70 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/15 border border-blue-500/30 rounded-xl">
              <Cloud className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Database Backup &amp; Cloud Storage</h2>
              <p className="text-xs text-slate-400">
                Active Database: <strong className="text-emerald-400">{dbSource}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 border ${
              status.connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {status.connected ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {status.connected
                    ? 'Cloud Storage Active (PostgreSQL Database)'
                    : 'Cloud Storage Not Active — All Transactions Blocked'}
                </div>
                <div className="text-xs opacity-80">{status.message}</div>
              </div>
            </div>

            {status.connected ? (
              <button
                type="button"
                onClick={handleSync}
                disabled={loading}
                className="px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Now</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReconnectDefault}
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-extrabold flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Reconnect Cloud Storage</span>
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {/* DATABASE BACKUP CENTER */}
          <div className="bg-slate-800/40 border border-slate-700/70 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm text-white">Take Database Backup</h3>
                  <p className="text-[11px] text-slate-400">
                    Export all tables (Products, Sales Ledger, Invoices, Staff, Categories, Settings, Audit Logs)
                  </p>
                </div>
              </div>
            </div>

            {/* Live Table Record Counts */}
            {liveCounts && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {[
                  { label: 'Products', value: liveCounts.products },
                  { label: 'Sales Rows', value: liveCounts.ledger },
                  { label: 'Purchases', value: liveCounts.purchases ?? 0 },
                  { label: 'Vouchers', value: liveCounts.accountVouchers ?? 0 },
                  { label: 'Parties', value: liveCounts.partyAccounts ?? 0 },
                  { label: 'Staff / Logs', value: liveCounts.cashiers + liveCounts.auditLogs },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl px-2 py-2"
                  >
                    <div className="text-base font-extrabold text-emerald-400 font-mono-code">
                      {stat.value}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Primary Backup Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadJsonBackup}
                disabled={backupBusy}
                className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <FileJson className="w-4 h-4" />
                <span>Download JSON Backup</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSqlBackup}
                disabled={backupBusy}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <FileCode2 className="w-4 h-4" />
                <span>Download SQL Dump</span>
              </button>

              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={backupBusy}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border border-slate-600 transition-all cursor-pointer"
              >
                <Database className="w-4 h-4 text-amber-400" />
                <span>{backupBusy ? 'Working...' : 'Save Server Snapshot'}</span>
              </button>
            </div>

            {/* Upload & Restore from Backup JSON */}
            <div className="pt-3 border-t border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore Database from Backup File (.json)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Upload a previously downloaded `.json` backup to restore &amp; sync to Supabase.
                </p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleBackupFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={backupBusy}
                  className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Backup File</span>
                </button>
              </div>
            </div>

            {/* Pending File Restore Confirmation */}
            {pendingUploadBackup && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-2.5">
                <div className="text-xs text-amber-200 font-bold">
                  Ready to restore: {pendingUploadBackup.fileName}
                </div>
                <div className="text-[11px] text-amber-100/80">
                  Contains {pendingUploadBackup.counts.products} products, {pendingUploadBackup.counts.ledger} sales rows,{' '}
                  {pendingUploadBackup.counts.cashiers} staff, {pendingUploadBackup.counts.categories} categories, and{' '}
                  {pendingUploadBackup.counts.loosePackets} loose packets.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmUploadedRestore}
                    disabled={backupBusy}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg text-xs cursor-pointer"
                  >
                    Confirm &amp; Restore Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingUploadBackup(null)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Saved Server Snapshots List */}
            <div className="pt-3 border-t border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Saved Server Snapshots ({snapshots.length})</span>
                </span>
              </div>

              {snapshots.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-2">
                  No server snapshots saved yet. Click <strong>Save Server Snapshot</strong> above to store a restore point.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.filename}
                      className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-mono-code font-bold text-slate-200 text-[11px]">
                          {snap.filename}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(snap.createdAt).toLocaleString()} · {formatBytes(snap.sizeBytes)} ·{' '}
                          {snap.counts.products} products, {snap.counts.ledger} sales rows
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadSnapshot(snap.filename)}
                          disabled={backupBusy}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>

                        {pendingRestoreSnapshot === snap.filename ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRestoreSnapshot(snap.filename)}
                              disabled={backupBusy}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRestoreSnapshot(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded-lg text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingRestoreSnapshot(snap.filename)}
                            disabled={backupBusy}
                            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteSnapshot(snap.filename)}
                          disabled={backupBusy}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                          title="Delete snapshot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Collapsible Supabase Connection Settings & Schema */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Shield className="w-4 h-4 text-blue-400" />
                <span>Cloud Connection &amp; SQL Schema Settings</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectionConfig(!showConnectionConfig)}
                className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
              >
                {showConnectionConfig ? 'Hide Settings' : 'Manage Connection'}
              </button>
            </div>

            {showConnectionConfig && (
              <div className="space-y-4 pt-2 border-t border-slate-800">
                {!status.configured ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Project URL</label>
                      <input
                        type="text"
                        placeholder="https://xyz.supabase.co"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Service Role Key (secret)
                      </label>
                      <input
                        type="password"
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleValidate}
                        disabled={loading || !url || !key}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-xs"
                      >
                        Validate Connection
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={loading || !url || !key}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs"
                      >
                        Save &amp; Connect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div className="text-xs text-slate-300">
                      Linked to <strong>Supabase PostgreSQL</strong>. Data syncs automatically.
                    </div>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                )}

                <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" />
                      Database SQL Schema
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSql(!showSql)}
                      className="text-xs font-bold text-blue-400 hover:underline cursor-pointer"
                    >
                      {showSql ? 'Hide SQL Code' : 'View SQL Code'}
                    </button>
                  </div>
                  {showSql && (
                    <div className="relative group">
                      <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-40 whitespace-pre">
                        {`-- Run in Supabase SQL Editor:
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "itemsDetail" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "baseAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "totalGst" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "cgstAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "sgstAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "gstSummary" TEXT DEFAULT '';
NOTIFY pgrst, 'reload schema';`}
                      </pre>
                      <button
                        type="button"
                        onClick={() => {
                          fetch('/supabase_schema.sql')
                            .then((r) => r.text())
                            .then((t) => {
                              navigator.clipboard.writeText(t);
                              setSuccess('SQL Schema copied to clipboard!');
                            });
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-400 border border-slate-700"
                        title="Copy full schema SQL"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/70 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupModal;
