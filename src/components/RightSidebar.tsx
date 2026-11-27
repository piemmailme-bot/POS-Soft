import React, { useState } from 'react';
import {
  PackageCheck,
  FileSpreadsheet,
  Wallet,
  FileText,
  PieChart,
  Landmark,
  BadgePercent,
  ShieldAlert,
  Scale,
  Barcode,
  Database,
  BookOpen,
  KeyRound,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  X,
  ChevronRight,
  Layers,
  Building2,
  Truck,
} from 'lucide-react';
import { SocietyProfile, CashierUser, AdminStoreSettings } from '../types';
import { getTransactionMode } from '../utils/transactionControl';

export type AppTabId =
  | 'pos'
  | 'inventory'
  | 'suppliers'
  | 'ledger'
  | 'drawer'
  | 'admin'
  | 'invoices'
  | 'purchase_summary'
  | 'balance_sheet'
  | 'fixed_assets'
  | 'gst_analysis';

interface RightSidebarProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  lowStockCount: number;
  currentCashier: CashierUser | null;
  society: SocietyProfile;
  adminSettings?: AdminStoreSettings;
  onOpenWeighingStation?: () => void;
  onOpenBarcodePrint: () => void;
  onOpenCloudBackup?: () => void;
  onOpenResetPassword?: () => void;
  onLogout: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeTab,
  setActiveTab,
  lowStockCount,
  currentCashier,
  society,
  adminSettings,
  onOpenWeighingStation,
  onOpenBarcodePrint,
  onOpenCloudBackup,
  onOpenResetPassword,
  onLogout,
  isMobileOpen,
  onCloseMobile,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const txMode = getTransactionMode(adminSettings);

  const canViewAccountsAndTax =
    !currentCashier ||
    currentCashier.role === 'System Admin' ||
    currentCashier.loginId === 'admin' ||
    currentCashier.role === 'Society Manager' ||
    currentCashier.role === 'Senior Cashier';

  const isSystemAdmin = Boolean(
    currentCashier && (currentCashier.role === 'System Admin' || currentCashier.loginId === 'admin')
  );

  const handleSelectTab = (tab: AppTabId) => {
    setActiveTab(tab);
    onCloseMobile();
  };

  const handleAction = (fn?: () => void) => {
    if (fn) fn();
    onCloseMobile();
  };

  const renderSidebarBody = (mobileMode: boolean) => {
    const collapsed = !mobileMode && isCollapsed;

    const navButtonClass = (isActive: boolean, accent: 'emerald' | 'amber' | 'sky' | 'violet' = 'emerald') => {
      if (isActive) {
        if (accent === 'amber') {
          return 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent text-amber-200 border border-amber-400/40 shadow-sm shadow-amber-950/40';
        }
        if (accent === 'sky') {
          return 'bg-gradient-to-r from-sky-500/20 via-sky-500/10 to-transparent text-sky-200 border border-sky-400/40 shadow-sm shadow-sky-950/40';
        }
        if (accent === 'violet') {
          return 'bg-gradient-to-r from-violet-500/25 via-violet-500/10 to-transparent text-violet-200 border border-violet-400/40 shadow-sm shadow-violet-950/40';
        }
        return 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-200 border border-emerald-400/40 shadow-sm shadow-emerald-950/40';
      }
      return 'text-slate-300 border border-transparent hover:bg-slate-800/75 hover:border-slate-700/70 hover:text-white';
    };

    const iconWrapClass = (isActive: boolean, tone: 'emerald' | 'amber' | 'sky' | 'violet' = 'emerald') => {
      if (isActive) {
        if (tone === 'amber') return 'bg-amber-500/20 text-amber-300 border border-amber-400/30';
        if (tone === 'sky') return 'bg-sky-500/20 text-sky-300 border border-sky-400/30';
        if (tone === 'violet') return 'bg-violet-500/25 text-violet-300 border border-violet-400/30';
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
      }
      return 'bg-slate-800/90 text-slate-400 border border-slate-700/60 group-hover:text-white group-hover:bg-slate-700/80';
    };

    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-[#0d1424] to-slate-950 text-slate-100 select-none">
        {/* Top Sidebar Header */}
        <div
          className={`px-2.5 py-2 border-b border-slate-800/80 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-slate-950 flex items-center ${
            collapsed ? 'justify-center' : 'justify-between gap-1.5'
          }`}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-emerald-300 uppercase">
                <Layers className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">Control Menu</span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight">
                {currentCashier?.role || 'POS Counter'} · {society.counterId}
              </p>
            </div>
          )}

          {mobileMode ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Close Menu Sidebar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700/80 transition-colors cursor-pointer shrink-0"
              title={collapsed ? 'Expand Right Sidebar' : 'Collapse Right Sidebar'}
            >
              {collapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Categorized Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2.5 scrollbar-thin">
          {/* CATEGORY 1: INVENTORY & BARCODES */}
          <div className="space-y-0.5">
            {!collapsed ? (
              <div className="px-1.5 pb-0.5 flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-emerald-400/90">
                  Inventory &amp; Barcodes
                </span>
                <span className="h-px flex-1 ml-1.5 bg-slate-800/90" />
              </div>
            ) : (
              <div className="h-px bg-slate-800/90 mx-1.5" />
            )}

            <button
              type="button"
              onClick={() => handleSelectTab('inventory')}
              title="Product & Stock Catalog"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                activeTab === 'inventory'
              )}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                    activeTab === 'inventory'
                  )}`}
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">Product &amp; Stock Catalog</span>}
              </span>
              {!collapsed && (
                <span className="flex items-center gap-1 shrink-0 ml-1">
                  {lowStockCount > 0 && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-mono-code font-bold tabular-nums">
                      {lowStockCount}
                    </span>
                  )}
                  {activeTab === 'inventory' && <ChevronRight className="w-3 h-3 text-emerald-400" />}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('suppliers')}
              title="Supplier / Company Master"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                activeTab === 'suppliers',
                'sky'
              )}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                    activeTab === 'suppliers',
                    'sky'
                  )}`}
                >
                  <Truck className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">Supplier / Company Master</span>}
              </span>
              {!collapsed && activeTab === 'suppliers' && (
                <ChevronRight className="w-3 h-3 text-sky-400 shrink-0" />
              )}
            </button>

            {onOpenWeighingStation && (
              <button
                type="button"
                onClick={() => handleAction(onOpenWeighingStation)}
                title="Weigh & Print Barcode (Loose Scale Station)"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold text-amber-200/90 border border-transparent hover:bg-amber-950/35 hover:border-amber-500/30 hover:text-amber-200 transition-all duration-150 cursor-pointer`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-amber-950/70 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:bg-amber-900/70">
                    <Scale className="w-3.5 h-3.5" />
                  </span>
                  {!collapsed && <span className="truncate">Weigh &amp; Print Barcode</span>}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleAction(onOpenBarcodePrint)}
              title="Print Barcodes & QR Stickers"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold text-slate-300 border border-transparent hover:bg-slate-800/75 hover:border-slate-700/70 hover:text-white transition-all duration-150 cursor-pointer`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md bg-slate-800/90 text-emerald-400 border border-slate-700/60 flex items-center justify-center shrink-0 group-hover:bg-slate-700/80">
                  <Barcode className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">Print Barcodes</span>}
              </span>
            </button>
          </div>

          {/* CATEGORY 2: SALES & DAILY OPERATIONS */}
          <div className="space-y-0.5">
            {!collapsed ? (
              <div className="px-1.5 pb-0.5 flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-sky-400/90">
                  Sales &amp; Daily Ops
                </span>
                <span className="h-px flex-1 ml-1.5 bg-slate-800/90" />
              </div>
            ) : (
              <div className="h-px bg-slate-800/90 mx-1.5" />
            )}

            <button
              type="button"
              onClick={() => handleSelectTab('ledger')}
              title="Day & Cashier Summary"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                activeTab === 'ledger'
              )}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                    activeTab === 'ledger'
                  )}`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">Day &amp; Cashier Summary</span>}
              </span>
              {!collapsed && activeTab === 'ledger' && (
                <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('drawer')}
              title="Cash Drawer (Z-Report)"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                activeTab === 'drawer',
                'amber'
              )}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                    activeTab === 'drawer',
                    'amber'
                  )}`}
                >
                  <Wallet className="w-3.5 h-3.5 text-amber-400" />
                </span>
                {!collapsed && <span className="truncate">Cash Drawer (Z-Report)</span>}
              </span>
              {!collapsed && activeTab === 'drawer' && (
                <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('invoices')}
              title="Invoice Analytics"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                activeTab === 'invoices',
                'sky'
              )}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                    activeTab === 'invoices',
                    'sky'
                  )}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">Invoice Analytics</span>}
              </span>
              {!collapsed && activeTab === 'invoices' && (
                <ChevronRight className="w-3 h-3 text-sky-400 shrink-0" />
              )}
            </button>
          </div>

          {/* CATEGORY 3: ACCOUNTS, TAX & AUDIT */}
          {canViewAccountsAndTax && (
            <div className="space-y-0.5">
              {!collapsed ? (
                <div className="px-1.5 pb-0.5 flex items-center justify-between">
                  <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-amber-400/90">
                    Accounts, Tax &amp; Audit
                  </span>
                  <span className="h-px flex-1 ml-1.5 bg-slate-800/90" />
                </div>
              ) : (
                <div className="h-px bg-slate-800/90 mx-1.5" />
              )}

              <button
                type="button"
                onClick={() => handleSelectTab('purchase_summary')}
                title="Purchase and Sell summary"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                  activeTab === 'purchase_summary'
                )}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                      activeTab === 'purchase_summary'
                    )}`}
                  >
                    <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                  </span>
                  {!collapsed && <span className="truncate">Purchase &amp; Sell Summary</span>}
                </span>
                {!collapsed && activeTab === 'purchase_summary' && (
                  <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('balance_sheet')}
                title="Accounts & Balance Sheet"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                  activeTab === 'balance_sheet'
                )}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                      activeTab === 'balance_sheet'
                    )}`}
                  >
                    <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                  </span>
                  {!collapsed && <span className="truncate">Accounts &amp; Balance Sheet</span>}
                </span>
                {!collapsed && activeTab === 'balance_sheet' && (
                  <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('fixed_assets')}
                title="Fixed Asset Register (Database)"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                  activeTab === 'fixed_assets'
                )}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                      activeTab === 'fixed_assets'
                    )}`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  </span>
                  {!collapsed && <span className="truncate">Fixed Asset Register</span>}
                </span>
                {!collapsed && activeTab === 'fixed_assets' && (
                  <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectTab('gst_analysis')}
                title="GST Analysis"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                  activeTab === 'gst_analysis'
                )}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                      activeTab === 'gst_analysis'
                    )}`}
                  >
                    <BadgePercent className="w-3.5 h-3.5 text-emerald-400" />
                  </span>
                  {!collapsed && <span className="truncate">GST Analysis</span>}
                </span>
                {!collapsed && activeTab === 'gst_analysis' && (
                  <ChevronRight className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
              </button>
            </div>
          )}

          {/* CATEGORY 4: SYSTEM & SECURITY */}
          <div className="space-y-0.5">
            {!collapsed ? (
              <div className="px-1.5 pb-0.5 flex items-center justify-between">
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-slate-400">
                  System &amp; Security
                </span>
                <span className="h-px flex-1 ml-1.5 bg-slate-800/90" />
              </div>
            ) : (
              <div className="h-px bg-slate-800/90 mx-1.5" />
            )}

            {isSystemAdmin && (
              <button
                type="button"
                onClick={() => handleSelectTab('admin')}
                title="Admin Center"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${navButtonClass(
                  activeTab === 'admin',
                  'amber'
                )}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${iconWrapClass(
                      activeTab === 'admin',
                      'amber'
                    )}`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  </span>
                  {!collapsed && <span className="truncate">Admin Center</span>}
                </span>
                {!collapsed && (
                  <span className="flex items-center gap-1 shrink-0">
                    {txMode !== 'BOTH' && (
                      <span className="px-1 py-0.2 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[8.5px] font-bold uppercase">
                        Hold
                      </span>
                    )}
                    {activeTab === 'admin' && <ChevronRight className="w-3 h-3 text-amber-400" />}
                  </span>
                )}
              </button>
            )}

            {onOpenCloudBackup && isSystemAdmin && (
              <button
                type="button"
                onClick={() => handleAction(onOpenCloudBackup)}
                title="Cloud Backup & Restore"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold text-slate-300 border border-transparent hover:bg-slate-800/75 hover:border-slate-700/70 hover:text-white transition-all duration-150 cursor-pointer`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-slate-800/90 text-emerald-400 border border-slate-700/60 flex items-center justify-center shrink-0 group-hover:bg-slate-700/80">
                    <Database className="w-3.5 h-3.5" />
                  </span>
                  {!collapsed && <span className="truncate">Cloud Backup &amp; Restore</span>}
                </span>
              </button>
            )}

            <a
              href="/api/user-guide/download"
              download="Deganga_CADPFSCS_User_Guide.docx"
              onClick={onCloseMobile}
              title="Download User Guide (.docx)"
              className={`group w-full flex items-center ${
                collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
              } rounded-lg text-xs font-semibold text-sky-300 border border-transparent hover:bg-sky-950/40 hover:border-sky-500/30 hover:text-sky-200 transition-all duration-150`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md bg-slate-800/90 text-sky-400 border border-slate-700/60 flex items-center justify-center shrink-0 group-hover:bg-sky-950/70">
                  <BookOpen className="w-3.5 h-3.5" />
                </span>
                {!collapsed && <span className="truncate">User Guide (.docx)</span>}
              </span>
            </a>

            {onOpenResetPassword && (
              <button
                type="button"
                onClick={() => handleAction(onOpenResetPassword)}
                title="Reset Password"
                className={`group w-full flex items-center ${
                  collapsed ? 'justify-center px-1.5 py-1.5' : 'justify-between px-2 py-1.5'
                } rounded-lg text-xs font-semibold text-amber-300/90 border border-transparent hover:bg-amber-950/35 hover:border-amber-500/30 hover:text-amber-200 transition-all duration-150 cursor-pointer`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-slate-800/90 text-amber-400 border border-slate-700/60 flex items-center justify-center shrink-0 group-hover:bg-amber-950/60">
                    <KeyRound className="w-3.5 h-3.5" />
                  </span>
                  {!collapsed && <span className="truncate">Reset Password</span>}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Sticky Bottom Session / Logout Bar */}
        <div className="p-2 border-t border-slate-800/80 bg-slate-950/90">
          <button
            type="button"
            onClick={() => handleAction(onLogout)}
            title="Lock Register & Log Out"
            className={`w-full flex items-center ${
              collapsed ? 'justify-center p-1.5' : 'justify-center gap-1.5 px-2.5 py-2'
            } rounded-lg bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold border border-rose-500/30 hover:border-rose-400 transition-all duration-150 cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span>Lock / Log Out</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Right Sidebar */}
      <aside
        aria-label="Workspace Navigation Sidebar"
        className={`hidden lg:block shrink-0 border-l border-slate-800/90 sticky transition-[width] duration-200 ease-out z-20 print:hidden ${
          txMode !== 'BOTH'
            ? 'top-[108px] h-[calc(100vh-108px)]'
            : 'top-[80px] h-[calc(100vh-80px)]'
        } ${isCollapsed ? 'w-[58px]' : 'w-[228px]'}`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile / Tablet Slide-Over Right Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Mobile Navigation Sidebar"
            className="fixed top-0 right-0 bottom-0 w-[240px] max-w-[85vw] border-l border-slate-800 shadow-2xl z-50"
          >
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
};
