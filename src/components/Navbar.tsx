import React from 'react';
import { ShoppingBag, QrCode, Store, Clock, UserCheck, AlertTriangle, Database, RefreshCw, Menu } from 'lucide-react';
import { SocietyProfile, CashierUser, AdminStoreSettings } from '../types';
import { getTransactionMode } from '../utils/transactionControl';
import type { AppTabId } from './RightSidebar';

interface NavbarProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  society: SocietyProfile;
  cartCount: number;
  onOpenScanner: () => void;
  onOpenCloudBackup?: () => void;
  onRefreshAll?: () => void;
  isRefreshingAll?: boolean;
  refreshNonce?: number;
  currentCashier: CashierUser | null;
  adminSettings?: AdminStoreSettings;
  onOpenMobileSidebar?: () => void;
  cloudStatus?: { connected: boolean; message: string };
  onCloudStatusChange?: (status: { connected: boolean; message: string }) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  society,
  cartCount,
  onOpenScanner,
  onOpenCloudBackup,
  onRefreshAll,
  isRefreshingAll = false,
  refreshNonce = 0,
  currentCashier,
  adminSettings,
  onOpenMobileSidebar,
  cloudStatus,
  onCloudStatusChange,
}) => {
  const [dateTime, setDateTime] = React.useState({ time: '', date: '' });
  const [dbStatus, setDbStatus] = React.useState({ connected: true, message: '' });
  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => {
    if (cloudStatus) {
      setDbStatus(cloudStatus);
    }
  }, [cloudStatus]);

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/supabase/status', { cache: 'no-store' });
        const data = await res.json();
        const next = { connected: Boolean(data?.connected), message: String(data?.message || '') };
        setDbStatus(next);
        onCloudStatusChange?.(next);
      } catch {
        const next = { connected: false, message: 'Cloud Storage Offline' };
        setDbStatus(next);
        onCloudStatusChange?.(next);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [refreshNonce, onCloudStatusChange]);

  React.useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
      const day = now.getDate();
      const month = now.toLocaleDateString('en-US', { month: 'long' });
      const year = now.getFullYear();
      setDateTime({
        time: now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        date: `${weekday}, ${day} ${month} ${year}`,
      });
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const txMode = getTransactionMode(adminSettings);

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md print:hidden">
      {/* Transaction Category Restriction Banner */}
      {txMode !== 'BOTH' && (
        <div
          className={`px-4 py-1.5 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-inner ${
            txMode === 'STOP_ALL'
              ? 'bg-rose-600 text-white'
              : txMode === 'ONLY_SELL'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-indigo-600 text-white'
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 animate-pulse ${
              txMode === 'ONLY_SELL' ? 'text-slate-950' : 'text-amber-200'
            }`}
          />
          <span>
            {txMode === 'STOP_ALL' &&
              `STOP TRANSACTION ACTIVE: Both Sell & Purchase are halted by Administrator (${adminSettings?.haltReason || 'All transactions on hold'})`}
            {txMode === 'ONLY_SELL' &&
              `ONLY SELL MODE: POS Billing active · Purchases & Stock additions paused by Administrator`}
            {txMode === 'ONLY_PURCHASE' &&
              `ONLY PURCHASE MODE: Stock Purchases active · POS Sales & Billing paused by Administrator`}
          </span>
        </div>
      )}

      {/* Top micro-bar: Cloud status, Address, Clock, Cashier info */}
      <div className="bg-slate-950 px-4 py-1 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          {onOpenCloudBackup ? (
            <button
              onClick={onOpenCloudBackup}
              className={`flex items-center gap-1.5 font-bold transition-colors hover:opacity-80 cursor-pointer ${
                dbStatus.connected ? 'text-emerald-400' : 'text-rose-400'
              }`}
              title="Open Cloud Storage & Database Settings (Admin)"
            >
              <Database className={`w-3 h-3 ${dbStatus.connected ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'
                }`}
              ></span>
              {dbStatus.connected ? 'Cloud Storage Active' : 'Cloud Storage Not Active (Transactions Locked)'}
            </button>
          ) : (
            <span
              className={`flex items-center gap-1.5 font-bold ${
                dbStatus.connected ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <Database className={`w-3 h-3 ${dbStatus.connected ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'
                }`}
              ></span>
              {dbStatus.connected ? 'Cloud Storage Active' : 'Cloud Storage Not Active (Transactions Locked)'}
            </span>
          )}
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">📍 {society.address}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="font-mono-code text-slate-200">
              {dateTime.date} · {dateTime.time || '10:30:00 AM'}
            </span>
          </span>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5 text-slate-200">
            <UserCheck className="w-3 h-3 text-emerald-400" />
            <span>
              {currentCashier ? (
                <>
                  <strong className="text-white">{currentCashier.name}</strong>{' '}
                  <span className="text-emerald-400 font-mono-code">({currentCashier.staffCode})</span>
                </>
              ) : (
                society.cashierName
              )}
            </span>
            {currentCashier && (
              <span
                className={`text-[9.5px] px-1.5 py-0.2 rounded font-medium border ${
                  currentCashier.role === 'System Admin'
                    ? 'bg-purple-950 border-purple-500/40 text-purple-300'
                    : 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {currentCashier.role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Bar: Brand + ONLY Attached Menus (Smart POS & Billing, Scan QR / Barcode, Refresh) */}
      <div className="w-full px-4 sm:px-5 py-2 flex items-center justify-between gap-3">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#171a1f] border border-amber-400/50 overflow-hidden flex items-center justify-center shadow-md flex-shrink-0">
            {!logoFailed ? (
              <img
                src="/assets/society-logo.png"
                alt={`${society.name} Logo`}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-cover object-center scale-[1.07]"
              />
            ) : (
              <Store className="w-5 h-5 text-emerald-300" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight truncate">
                {society.name}
              </h1>
              <span className="hidden md:inline-block text-[10px] font-semibold tracking-wide text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded whitespace-nowrap">
                Village : Berachampa · Dist. North 24 Parganas
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
              <span>Counter: {society.counterId}</span>
              <span>·</span>
              <span className="text-emerald-400 font-mono-code font-medium">UPI: {society.upiId}</span>
            </p>
          </div>
        </div>

        {/* Attached Top Menus Kept As-Is: Smart POS & Billing, Scan QR / Barcode, Refresh */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-emerald-600/20 text-emerald-300 font-semibold border border-emerald-500/30'
                : 'text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700 font-medium'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Smart POS &amp; Billing</span>
            {cartCount > 0 && (
              <span className="bg-emerald-500 text-slate-950 font-bold text-[10px] px-1.5 py-0.2 rounded-full font-mono-code">
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenScanner}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm shadow-emerald-950/50 transition-all hover:scale-[1.01] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            title="Open camera or handheld barcode/QR reader"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-200" />
            <span className="hidden sm:inline">Scan QR / Barcode</span>
            <span className="sm:hidden">Scan</span>
          </button>

          {onRefreshAll && (
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={isRefreshingAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold border border-sky-400/40 transition-colors shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
              title="Refresh all windows & sync latest transactions from database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span>{isRefreshingAll ? 'Syncing...' : 'Refresh'}</span>
            </button>
          )}

          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              title="Open Menu Sidebar"
            >
              <Menu className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


