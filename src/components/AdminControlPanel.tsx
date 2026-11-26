import React, { useState } from 'react';
import {
  ShieldAlert,
  UserPlus,
  Trash2,
  Lock,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Users,
  Settings,
  History,
  Store,
  KeyRound,
  Eye,
  EyeOff,
  Building2,
  Sliders,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Megaphone,
  Database,
  ArrowLeftRight,
  ShoppingCart,
  PackagePlus,
  Table2,
} from 'lucide-react';
import {
  CashierUser,
  AdminStoreSettings,
  AdminAuditLog,
  SocietyProfile,
  TransactionControlMode,
} from '../types';
import {
  getTransactionMode,
  getTransactionModeMeta,
  TRANSACTION_MODE_OPTIONS,
} from '../utils/transactionControl';
import { DatabaseTableViewer } from './DatabaseTableViewer';

interface AdminControlPanelProps {
  cashiers: CashierUser[];
  currentCashier: CashierUser;
  adminSettings: AdminStoreSettings;
  auditLogs: AdminAuditLog[];
  onAddCashier: (newCashier: Omit<CashierUser, 'id'>) => void;
  onRemoveCashier: (cashierId: string) => void;
  onToggleCashierStatus: (cashierId: string) => void;
  onResetPassword: (cashierId: string, newPass: string) => void;
  onUpdateAdminSettings: (newSettings: AdminStoreSettings) => void;
  society: SocietyProfile;
  onExitAdminToPos: () => void;
  onOpenCloudBackup: () => void;
  onOpenResetPassword?: () => void;
  refreshNonce?: number;
}

export const AdminControlPanel: React.FC<AdminControlPanelProps> = ({
  cashiers,
  currentCashier,
  adminSettings,
  auditLogs,
  onAddCashier,
  onRemoveCashier,
  onToggleCashierStatus,
  onResetPassword,
  onUpdateAdminSettings,
  society,
  onExitAdminToPos,
  onOpenCloudBackup,
  onOpenResetPassword,
  refreshNonce = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'cashiers' | 'controls' | 'audit' | 'tables'>('cashiers');
  const [isAddCashierModalOpen, setIsAddCashierModalOpen] = useState(false);
  const [resetPassUser, setResetPassUser] = useState<CashierUser | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const visibleCashiers = cashiers.filter((c) => c.role !== 'Developer');

  // New Cashier Form
  const [newCashier, setNewCashier] = useState({
    loginId: '',
    passwordHash: 'nabkul@123',
    name: '',
    staffCode: `Staff #${400 + cashiers.length + 1}`,
    role: 'POS Cashier' as CashierUser['role'],
    assignedCounter: 'COUNTER-01 (KOL-NORTH)',
  });

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleCreateCashier = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newCashier.name || !newCashier.loginId || !newCashier.passwordHash) return;

    // Check duplicate login ID
    if (cashiers.some((c) => (c.loginId || '').toLowerCase() === (newCashier.loginId || '').trim().toLowerCase())) {
      setFormError(`Login ID "${newCashier.loginId}" is already taken by another staff member.`);
      return;
    }

    onAddCashier({
      ...newCashier,
      isActive: true,
      createdAt: new Date().toISOString().slice(0, 10),
    });

    setIsAddCashierModalOpen(false);
    setFormError(null);
    showToast(`Staff member "${newCashier.name}" registered successfully.`);
    setNewCashier({
      loginId: '',
      passwordHash: 'nabkul@123',
      name: '',
      staffCode: `Staff #${400 + cashiers.length + 2}`,
      role: 'POS Cashier',
      assignedCounter: 'COUNTER-01 (KOL-NORTH)',
    });
  };

  const currentMode = getTransactionMode(adminSettings);

  const handleSelectTransactionMode = (mode: TransactionControlMode) => {
    if (mode === currentMode) return;
    const meta = getTransactionModeMeta(mode);
    onUpdateAdminSettings({
      ...adminSettings,
      transactionMode: mode,
      transactionsEnabled: mode === 'BOTH' || mode === 'ONLY_SELL',
      haltReason: mode === 'BOTH' ? '' : meta.defaultHaltReason,
    });

    const toastMap: Record<TransactionControlMode, string> = {
      STOP_ALL: '⚠️ STOP TRANSACTION active: Both Sell and Purchase are now frozen.',
      ONLY_SELL: '🛒 ONLY SELL active: POS sales enabled; Stock purchases are paused.',
      ONLY_PURCHASE: '📦 ONLY PURCHASE active: Stock purchases enabled; POS sales are paused.',
      BOTH: '✅ BOTH active: Full Sell & Purchase transactions are resumed.',
    };
    showToast(toastMap[mode]);
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser || !newPasswordVal) return;
    onResetPassword(resetPassUser.id, newPasswordVal);
    showToast(`Password updated for ${resetPassUser.name}`);
    setResetPassUser(null);
    setNewPasswordVal('');
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-rose-600 border border-amber-400/30 flex items-center justify-center text-white shadow-lg flex-shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight">Admin & Security Management</h2>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono-code text-[11px] font-bold border border-amber-500/30">
                Secretary Office
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {society.name} · Staff authorization, transaction controls & security audit
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          {/* 4-Category Transaction Mode Control */}
          <div
            className="flex flex-wrap items-center gap-1 bg-slate-950/90 border border-slate-700/80 p-1 rounded-2xl"
            role="group"
            aria-label="Transaction Control Category"
          >
            <button
              type="button"
              onClick={() => handleSelectTransactionMode('STOP_ALL')}
              className={`px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                currentMode === 'STOP_ALL'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/60'
                  : 'text-rose-300 hover:bg-rose-950/60 hover:text-rose-200'
              }`}
              title="Stop all Sell and Purchase transactions"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Stop Transaction</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTransactionMode('ONLY_SELL')}
              className={`px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                currentMode === 'ONLY_SELL'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/50'
                  : 'text-amber-300 hover:bg-amber-950/50 hover:text-amber-200'
              }`}
              title="Allow POS Sell transactions only; stop Purchase entries"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Only Sell</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTransactionMode('ONLY_PURCHASE')}
              className={`px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                currentMode === 'ONLY_PURCHASE'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-950/50'
                  : 'text-indigo-300 hover:bg-indigo-950/50 hover:text-indigo-200'
              }`}
              title="Allow Stock Purchase entries only; stop POS Sell transactions"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Only Purchase</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTransactionMode('BOTH')}
              className={`px-3 py-2 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                currentMode === 'BOTH'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                  : 'text-emerald-300 hover:bg-emerald-950/50 hover:text-emerald-200'
              }`}
              title="Allow both Sell and Purchase transactions"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Both</span>
            </button>
          </div>

          <button
            onClick={onOpenCloudBackup}
            className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <Database className="w-4 h-4" />
            <span>Database Backup &amp; Cloud</span>
          </button>

          <button
            onClick={onExitAdminToPos}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
          >
            Back to POS Billing
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3 bg-slate-900 border border-slate-700 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Active Restriction Banner when mode !== 'BOTH' */}
      {currentMode !== 'BOTH' && (
        <div
          className={`p-4 border-2 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn shadow-md ${
            currentMode === 'STOP_ALL'
              ? 'bg-rose-50 border-rose-500 text-rose-900'
              : currentMode === 'ONLY_SELL'
              ? 'bg-amber-50 border-amber-500 text-amber-950'
              : 'bg-indigo-50 border-indigo-500 text-indigo-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle
              className={`w-6 h-6 flex-shrink-0 ${
                currentMode === 'STOP_ALL'
                  ? 'text-rose-600'
                  : currentMode === 'ONLY_SELL'
                  ? 'text-amber-600'
                  : 'text-indigo-600'
              }`}
            />
            <div>
              <h4 className="font-bold text-sm">
                {currentMode === 'STOP_ALL' && 'Store Transactions Are Currently STOPPED (Both Sell & Purchase Frozen)'}
                {currentMode === 'ONLY_SELL' && 'Transaction Category: ONLY SELL Active (Purchases Paused)'}
                {currentMode === 'ONLY_PURCHASE' && 'Transaction Category: ONLY PURCHASE Active (POS Sales Paused)'}
              </h4>
              <p className="text-xs opacity-85 mt-0.5">
                {adminSettings.haltReason || getTransactionModeMeta(currentMode).description}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleSelectTransactionMode('BOTH')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer shrink-0"
          >
            Enable Both (Resume All)
          </button>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('cashiers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'cashiers'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Cashier Staff Management ({visibleCashiers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('controls')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'controls'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Transaction Controls & Policies</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'audit'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Security & Activity Audit Logs</span>
        </button>

        <button
          onClick={() => setActiveTab('tables')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'tables'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Table2 className="w-4 h-4" />
          <span>Database Tables</span>
        </button>
      </div>

      {/* Tab 1: Cashier Management */}
      {activeTab === 'cashiers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Authorized Cashier Roster
              </h3>
              <p className="text-xs text-slate-500">
                Register new billing staff, reset passwords, or remove cashiers from the cooperative store
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onOpenResetPassword && (
                <button
                  type="button"
                  onClick={onOpenResetPassword}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Reset User / Admin Password</span>
                </button>
              )}

              <button
                onClick={() => setIsAddCashierModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register New Cashier</span>
              </button>
            </div>
          </div>

          {/* Cashiers Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Login ID</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Assigned Counter</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Security Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCashiers.map((cashier) => {
                  const isAdmin = cashier.role === 'System Admin';

                  return (
                    <tr key={cashier.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm leading-tight">
                          {cashier.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono-code mt-0.5">
                          {cashier.staffCode} · Created {cashier.createdAt || '2026-10-26'}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono-code font-bold text-slate-800">
                        {cashier.loginId}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isAdmin
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : cashier.role === 'Senior Cashier'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {cashier.role}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {cashier.assignedCounter}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cashier.isActive !== false
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {cashier.isActive !== false ? 'ACTIVE' : 'DEACTIVATED'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResetPassUser(cashier);
                              setNewPasswordVal('');
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3 h-3 text-slate-500" />
                            <span>Reset PIN</span>
                          </button>

                          {!isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onToggleCashierStatus(cashier.id)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                              >
                                {cashier.isActive !== false ? 'Deactivate' : 'Activate'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  onRemoveCashier(cashier.id);
                                  showToast(`Cashier "${cashier.name}" removed.`);
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Remove Cashier"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Transaction & Store Controls */}
      {activeTab === 'controls' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Transaction Category Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h3 className="font-extrabold text-base text-slate-900">
                Transaction Category Controls
              </h3>
            </div>

            <p className="text-xs text-slate-500">
              Choose whether the store accepts Both (Sell & Purchase), Only Sell, Only Purchase, or Stops all transactions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TRANSACTION_MODE_OPTIONS.map((opt) => {
                const isSelected = currentMode === opt.mode;
                const activeStyles: Record<TransactionControlMode, string> = {
                  STOP_ALL: 'bg-rose-600 border-rose-700 text-white shadow-md',
                  ONLY_SELL: 'bg-amber-500 border-amber-600 text-slate-950 shadow-md',
                  ONLY_PURCHASE: 'bg-indigo-600 border-indigo-700 text-white shadow-md',
                  BOTH: 'bg-emerald-600 border-emerald-700 text-white shadow-md',
                };
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => handleSelectTransactionMode(opt.mode)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? activeStyles[opt.mode]
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold">{opt.label}</span>
                      {isSelected && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/15">
                          Active
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] mt-1 leading-snug ${
                        isSelected
                          ? opt.mode === 'ONLY_SELL'
                            ? 'text-slate-900/85'
                            : 'text-white/90'
                          : 'text-slate-500'
                      }`}
                    >
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Halt Reason input */}
            <div className="pb-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Restriction / Cashier Notice
              </label>
              <input
                type="text"
                placeholder="e.g. Physical inventory counting in progress..."
                value={adminSettings.haltReason || ''}
                onChange={(e) =>
                  onUpdateAdminSettings({
                    ...adminSettings,
                    haltReason: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Statutory Society GSTIN & Financial Year Config */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Society GSTIN</label>
                <input
                  type="text"
                  value={
                    !adminSettings.societyGstin || adminSettings.societyGstin === '19AAAAD0000A1Z5'
                      ? '19AAAAD9763A1ZS'
                      : adminSettings.societyGstin
                  }
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      societyGstin: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono-code uppercase"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">State Code</label>
                <input
                  type="text"
                  value={adminSettings.gstStateCode || '19 - West Bengal'}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      gstStateCode: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Financial Year</label>
                <input
                  type="text"
                  value={adminSettings.financialYear || '2026-27'}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      financialYear: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono-code font-bold"
                />
              </div>
            </div>
          </div>

          {/* Payment Mode Toggles */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-base text-slate-900">
                Payment Channel &amp; Compliance Policies
              </h3>
            </div>

            <div className="space-y-3">
              {/* Online QR / UPI Toggle */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <QrCode className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Indian Bank &amp; Online UPI ({society.upiId || '21785723893@indianbk'})
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Enable or pause QR scan payments
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={adminSettings.upiPaymentsEnabled}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      upiPaymentsEnabled: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {/* Cash Toggle */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Banknote className="w-4 h-4 text-amber-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      I Cash (Physical Cash Payments)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Allow tender in currency notes
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={adminSettings.cashPaymentsEnabled}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      cashPaymentsEnabled: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {/* Member Credit (Udhaar) Toggle */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-teal-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Co-op Member Credit Sales (Sundry Debtors / Udhaar)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Allow registered cooperative members to purchase on credit
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={adminSettings.allowCreditSales !== false}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      allowCreditSales: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {/* Strict 12-Digit UPI UTR Validation Toggle */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Strict 12-Digit UPI UTR / RRN Verification
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Require 12-digit UPI reference number before completing UPI checkout
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={Boolean(adminSettings.strictUpiValidation)}
                  onChange={(e) =>
                    onUpdateAdminSettings({
                      ...adminSettings,
                      strictUpiValidation: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Security & Activity Audit Logs */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                System Security & Admin Audit Log
              </h3>
              <p className="text-xs text-slate-500">
                Immutable trace of staff registrations, password changes, and transaction halts
              </p>
            </div>
            <span className="text-xs font-mono-code text-slate-500">
              {auditLogs.length} events logged
            </span>
          </div>

          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                  <div>
                    <div className="font-bold text-slate-900 font-mono-code">{log.action}</div>
                    <div className="text-slate-600 mt-0.5">
                      {(log.details || '').replace(/^\[PURCHASE_TX:.*?\]\s*/, '')}
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400 font-mono-code flex-shrink-0">
                  <div>By: {log.performedBy}</div>
                  <div>{log.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Direct Database Tables Explorer */}
      {activeTab === 'tables' && <DatabaseTableViewer refreshNonce={refreshNonce} />}

      {/* Modal: Register New Cashier */}
      {isAddCashierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Register New Cashier Staff</h3>
              <button
                onClick={() => setIsAddCashierModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCashier} className="p-6 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Debabrata Roy"
                  value={newCashier.name}
                  onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Login Username *</label>
                  <input
                    type="text"
                    placeholder="e.g. debu406"
                    value={newCashier.loginId}
                    onChange={(e) => setNewCashier({ ...newCashier, loginId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Staff ID Code</label>
                  <input
                    type="text"
                    value={newCashier.staffCode}
                    onChange={(e) => setNewCashier({ ...newCashier, staffCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Access Password / PIN *</label>
                <input
                  type="text"
                  value={newCashier.passwordHash}
                  onChange={(e) => setNewCashier({ ...newCashier, passwordHash: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Role</label>
                  <select
                    value={newCashier.role}
                    onChange={(e) =>
                      setNewCashier({
                        ...newCashier,
                        role: e.target.value as CashierUser['role'],
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                  >
                    <option value="POS Cashier">POS Cashier</option>
                    <option value="Senior Cashier">Senior Cashier</option>
                    <option value="Society Manager">Society Manager</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Assigned Counter</label>
                  <select
                    value={newCashier.assignedCounter}
                    onChange={(e) =>
                      setNewCashier({ ...newCashier, assignedCounter: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                  >
                    <option value="COUNTER-01 (KOL-NORTH)">COUNTER-01 (Main)</option>
                    <option value="COUNTER-02 (KOL-NORTH)">COUNTER-02 (Express)</option>
                    <option value="CENTRAL DESK">CENTRAL DESK</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddCashierModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow"
                >
                  Save & Authorize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetPassUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Reset Password for {resetPassUser.name}</h3>
              <button onClick={() => setResetPassUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  New Password / PIN for {resetPassUser.loginId}
                </label>
                <input
                  type="text"
                  placeholder="Enter new password..."
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetPassUser(null)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
