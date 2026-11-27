import React, { useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Eye,
  Edit2,
  Power,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  Landmark,
  Receipt,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Banknote,
  FileText,
  Filter,
  RefreshCw,
} from 'lucide-react';
import {
  AccountLedgerVoucher,
  PartyAccount,
  PurchaseTransaction,
  ReturnNote,
  SocietyProfile,
  SupplierCategory,
} from '../types';
import {
  computeSupplierLedger,
  SUPPLIER_CATEGORIES,
  SupplierLedgerSummary,
} from '../utils/supplierLedger';
import { SupplierFormModal, SupplierSaveResult } from './SupplierFormModal';
import { getIstDateStr } from '../utils/dateUtils';

interface SupplierMasterManagerProps {
  suppliers: PartyAccount[];
  purchaseTransactions: PurchaseTransaction[];
  accountVouchers: AccountLedgerVoucher[];
  returnNotes: ReturnNote[];
  society: SocietyProfile;
  isAdmin: boolean;
  onSaveSupplier: (supplier: PartyAccount) => Promise<SupplierSaveResult>;
  onDeleteSupplier: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAddAccountVoucher: (
    voucher: Omit<AccountLedgerVoucher, 'id' | 'performedBy'>
  ) => Promise<boolean>;
  onRefreshData?: () => void;
}

const fmtCurrency = (val: number) =>
  `₹${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const SupplierMasterManager: React.FC<SupplierMasterManagerProps> = ({
  suppliers,
  purchaseTransactions,
  accountVouchers,
  returnNotes,
  society,
  isAdmin,
  onSaveSupplier,
  onDeleteSupplier,
  onAddAccountVoucher,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | SupplierCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<PartyAccount | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PURCHASE' | 'PAYMENT' | 'DEBIT_NOTE'>(
    'ALL'
  );

  // Payment / Advance quick-entry form inside Supplier Ledger Modal
  const [showPayForm, setShowPayForm] = useState(false);
  const [payDate, setPayDate] = useState(getIstDateStr());
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'BANK_UPI' | 'CASH'>('BANK_UPI');
  const [payNarration, setPayNarration] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Delete confirmation modal (only allowed for suppliers with zero transactions)
  const [deleteTarget, setDeleteTarget] = useState<SupplierLedgerSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 4500);
  };

  // Compute full financial ledger for every supplier
  const supplierSummaries = useMemo<SupplierLedgerSummary[]>(() => {
    return suppliers
      .map((sup) =>
        computeSupplierLedger(sup, purchaseTransactions, accountVouchers, returnNotes)
      )
      .sort((a, b) => {
        const codeA = a.supplier.supplierCode || a.supplier.name;
        const codeB = b.supplier.supplierCode || b.supplier.name;
        return codeA.localeCompare(codeB);
      });
  }, [suppliers, purchaseTransactions, accountVouchers, returnNotes]);

  // Global KPIs
  const kpis = useMemo(() => {
    let activeCount = 0;
    let inactiveCount = 0;
    let totalPurchases = 0;
    let totalCommission = 0;
    let totalPayments = 0;
    let totalOutstanding = 0;
    let totalAdvance = 0;

    for (const s of supplierSummaries) {
      if (s.supplier.isActive !== false) activeCount += 1;
      else inactiveCount += 1;
      totalPurchases += s.totalPurchases;
      totalCommission += s.totalCommission;
      totalPayments += s.totalPayments;
      totalOutstanding += s.outstandingBalance;
      totalAdvance += s.availableAdvance;
    }

    return {
      totalCount: supplierSummaries.length,
      activeCount,
      inactiveCount,
      totalPurchases,
      totalCommission,
      totalPayments,
      totalOutstanding,
      totalAdvance,
    };
  }, [supplierSummaries]);

  // Search by company name, mobile number, and Supplier ID (+ contact person / GSTIN)
  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supplierSummaries.filter((row) => {
      const sup = row.supplier;
      if (categoryFilter !== 'ALL' && (sup.supplierCategory || 'Distributor') !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'ACTIVE' && sup.isActive === false) return false;
      if (statusFilter === 'INACTIVE' && sup.isActive !== false) return false;
      if (!q) return true;

      const haystack = [
        sup.supplierCode || '',
        sup.name || '',
        sup.phone || '',
        sup.alternatePhone || '',
        sup.contactPerson || '',
        sup.gstin || '',
        sup.pan || '',
        sup.supplierCategory || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [supplierSummaries, searchQuery, categoryFilter, statusFilter]);

  const selectedSummary = useMemo(
    () => supplierSummaries.find((s) => s.supplier.id === selectedSupplierId) || null,
    [supplierSummaries, selectedSupplierId]
  );

  const filteredHistory = useMemo(() => {
    if (!selectedSummary) return [];
    if (historyFilter === 'ALL') return selectedSummary.history;
    return selectedSummary.history.filter((h) => h.type === historyFilter);
  }, [selectedSummary, historyFilter]);

  const handleToggleActive = async (summary: SupplierLedgerSummary) => {
    const sup = summary.supplier;
    const nextActive = sup.isActive === false;
    const res = await onSaveSupplier({
      ...sup,
      isActive: nextActive,
    });
    if (res.success) {
      showToast(
        nextActive
          ? `Supplier "${sup.name}" (${sup.supplierCode}) reactivated.`
          : `Supplier "${sup.name}" (${sup.supplierCode}) deactivated. Historical ledger preserved.`
      );
    } else {
      showToast(res.error || 'Failed to update supplier status.', true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.transactionCount > 0) {
      showToast(
        'Cannot permanently delete a supplier with existing transactions. Deactivate instead.',
        true
      );
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await onDeleteSupplier(deleteTarget.supplier.id);
      if (res.success) {
        showToast(
          `Supplier "${deleteTarget.supplier.name}" (${deleteTarget.supplier.supplierCode}) deleted.`
        );
        if (selectedSupplierId === deleteTarget.supplier.id) {
          setSelectedSupplierId(null);
        }
      } else {
        showToast(res.error || 'Failed to delete supplier.', true);
      }
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleOpenLedger = (summary: SupplierLedgerSummary, openPayDirectly = false) => {
    setSelectedSupplierId(summary.supplier.id);
    setHistoryFilter('ALL');
    setShowPayForm(openPayDirectly);
    setPayDate(getIstDateStr());
    setPayAmount(
      summary.outstandingBalance > 0 ? String(summary.outstandingBalance.toFixed(2)) : ''
    );
    setPayMode('BANK_UPI');
    setPayNarration('');
  };

  const handleRecordSupplierPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSummary) return;
    const amt = Number(payAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Please enter a valid payment / advance amount greater than ₹0.', true);
      return;
    }
    setIsPaying(true);
    try {
      const sup = selectedSummary.supplier;
      const voucherNo = `SUP-${payDate.replace(/-/g, '')}-${String(
        accountVouchers.length + 1
      ).padStart(3, '0')}`;
      const ok = await onAddAccountVoucher({
        voucherNo,
        voucherDate: payDate,
        voucherType: 'SUPPLIER_PAYMENT',
        ledgerHead: 'Sundry Creditors (Supplier Payment)',
        amount: Number(amt.toFixed(2)),
        paymentMode: payMode,
        partyId: sup.id,
        payeeOrPayer: sup.name,
        narration:
          payNarration.trim() ||
          (amt > selectedSummary.outstandingBalance
            ? `Supplier payment & advance to ${sup.name} (${sup.supplierCode})`
            : `Payment to supplier ${sup.name} (${sup.supplierCode})`),
      });
      if (ok) {
        showToast(`Recorded ${fmtCurrency(amt)} payment to "${sup.name}" (${payMode}).`);
        setPayAmount('');
        setPayNarration('');
        setShowPayForm(false);
      } else {
        showToast('Failed to record supplier payment. Check Database connection.', true);
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[80] px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 max-w-md animate-fadeIn ${
            toast.isError
              ? 'bg-rose-950 text-rose-100 border-rose-700'
              : 'bg-slate-900 text-emerald-300 border-slate-700'
          }`}
        >
          {toast.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Suppliers Master
            </span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono-code">
              {kpis.totalCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              <span className="text-emerald-700 font-bold">{kpis.activeCount} Active</span> ·{' '}
              <span className="text-rose-600 font-bold">{kpis.inactiveCount} Inactive</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Purchases
            </span>
            <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono-code">
              {fmtCurrency(kpis.totalPurchases)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {kpis.totalCommission > 0 ? (
                <span className="text-emerald-700 font-bold">
                  Comm. Earned: {fmtCurrency(kpis.totalCommission)}
                </span>
              ) : (
                'All supplier bills incl. GST'
              )}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Payments
            </span>
            <div className="text-xl font-extrabold text-emerald-700 mt-1 font-mono-code">
              {fmtCurrency(kpis.totalPayments)}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Cash, Bank/UPI &amp; vouchers</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Outstanding Payable
            </span>
            <div className="text-xl font-extrabold text-amber-700 mt-1 font-mono-code">
              {fmtCurrency(kpis.totalOutstanding)}
            </div>
            <p className="text-[11px] text-amber-700/80 mt-0.5">Sundry Creditors due</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-teal-200 bg-teal-50/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">
              Available Advance
            </span>
            <div className="text-xl font-extrabold text-teal-700 mt-1 font-mono-code">
              {fmtCurrency(kpis.totalAdvance)}
            </div>
            <p className="text-[11px] text-teal-700/80 mt-0.5">Prepaid supplier credit</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Directory Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>Supplier / Company Master</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {society.name} · Register companies, distributors &amp; vendors, monitor purchase/payment ledgers &amp; advances
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onRefreshData && (
                <button
                  type="button"
                  onClick={onRefreshData}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingSupplier(null);
                  setIsFormOpen(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Supplier / Company</span>
              </button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Company Name, Mobile Number, or Supplier ID (SUP-0001)..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value as 'ALL' | SupplierCategory)
                  }
                  className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {SUPPLIER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Supplier ID &amp; Status</th>
                <th className="py-3 px-4">Company / Supplier &amp; Category</th>
                <th className="py-3 px-4">Contact &amp; GSTIN / PAN</th>
                <th className="py-3 px-4 text-right">Total Purchases</th>
                <th className="py-3 px-4 text-right">Total Payments</th>
                <th className="py-3 px-4 text-right">Outstanding Payable</th>
                <th className="py-3 px-4 text-right">Available Advance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-700 text-sm">
                      {suppliers.length === 0
                        ? 'No suppliers registered yet'
                        : 'No matching suppliers found'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {suppliers.length === 0
                        ? 'Click "Add New Supplier / Company" above to register your first vendor.'
                        : 'Try clearing your search or category/status filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((row) => {
                  const sup = row.supplier;
                  const active = sup.isActive !== false;
                  const hasTx = row.transactionCount > 0;

                  return (
                    <tr
                      key={sup.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !active ? 'bg-slate-50/50 opacity-75' : ''
                      }`}
                    >
                      {/* Supplier ID & Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono-code font-extrabold text-blue-700 text-xs">
                          {sup.supplierCode || 'SUP-0001'}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              active ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}
                          />
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Company & Category */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900 text-sm leading-tight">
                          {sup.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                            {sup.supplierCategory || 'Distributor'}
                          </span>
                          {sup.contactPerson && (
                            <span className="text-[11px] text-slate-500">
                              Contact: <strong className="text-slate-700">{sup.contactPerson}</strong>
                            </span>
                          )}
                        </div>
                        {(sup.state || sup.pinCode) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {[sup.state, sup.pinCode].filter(Boolean).join(' - ')}
                          </div>
                        )}
                      </td>

                      {/* Contact & GSTIN */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono-code font-bold text-slate-800">
                          {sup.phone || '—'}
                        </div>
                        {sup.alternatePhone && (
                          <div className="text-[10px] font-mono-code text-slate-500">
                            Alt: {sup.alternatePhone}
                          </div>
                        )}
                        <div className="text-[10px] font-mono-code text-slate-500 mt-0.5">
                          {sup.gstin ? `GSTIN: ${sup.gstin}` : 'Unregistered GST'}
                          {sup.pan ? ` · PAN: ${sup.pan}` : ''}
                        </div>
                      </td>

                      {/* Total Purchases */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono-code font-extrabold text-slate-900">
                          {fmtCurrency(row.totalPurchases)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {row.purchaseCount} {row.purchaseCount === 1 ? 'bill' : 'bills'}
                        </div>
                        {row.totalCommission > 0 && (
                          <div className="text-[10px] font-mono-code font-bold text-emerald-700 mt-0.5">
                            Comm: {fmtCurrency(row.totalCommission)}
                          </div>
                        )}
                      </td>

                      {/* Total Payments */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono-code font-extrabold text-emerald-700">
                          {fmtCurrency(row.totalPayments)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {row.paymentCount} voucher{row.paymentCount === 1 ? '' : 's'}
                        </div>
                      </td>

                      {/* Outstanding Payable */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-mono-code font-extrabold ${
                            row.outstandingBalance > 0 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {fmtCurrency(row.outstandingBalance)}
                        </div>
                        {row.openingBalance > 0 && (
                          <div className="text-[10px] text-slate-400">
                            Op: {fmtCurrency(row.openingBalance)} (
                            {row.openingBalanceType === 'ADVANCE' ? 'Adv' : 'Pay'})
                          </div>
                        )}
                      </td>

                      {/* Available Advance */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-mono-code font-extrabold ${
                            row.availableAdvance > 0 ? 'text-teal-700' : 'text-slate-400'
                          }`}
                        >
                          {fmtCurrency(row.availableAdvance)}
                        </div>
                        {row.availableAdvance > 0 && (
                          <span className="text-[9.5px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                            Advance Ready
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenLedger(row, false)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="View full profile, purchase & payment history"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ledger</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenLedger(row, true)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                            title="Record Payment / Advance to Supplier"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupplier(sup);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                            title="Edit Supplier Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(row)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              active
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                            title={
                              active
                                ? 'Deactivate Supplier (preserves all history)'
                                : 'Reactivate Supplier'
                            }
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              disabled={hasTx}
                              onClick={() => setDeleteTarget(row)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                hasTx
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer'
                              }`}
                              title={
                                hasTx
                                  ? `Protected: ${row.transactionCount} linked transactions exist. Deactivate instead of deleting.`
                                  : 'Delete supplier permanently (no linked transactions)'
                              }
                            >
                              {hasTx ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Supplier Form Modal */}
      <SupplierFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingSupplier(null);
        }}
        existingSuppliers={suppliers}
        supplierToEdit={editingSupplier}
        onSaveSupplier={onSaveSupplier}
        onSavedCallback={(saved) => {
          showToast(
            editingSupplier
              ? `Updated supplier "${saved.name}" (${saved.supplierCode}).`
              : `Registered new supplier "${saved.name}" with ID ${saved.supplierCode}.`
          );
        }}
      />

      {/* Supplier Complete Profile, Ledger & Purchase/Payment History Modal */}
      {selectedSummary && (
        <div className="fixed inset-0 z-[65] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/25 border border-blue-400/40 text-blue-200 font-mono-code text-xs font-extrabold">
                      {selectedSummary.supplier.supplierCode || 'SUP-0001'}
                    </span>
                    <h3 className="font-extrabold text-base truncate">
                      {selectedSummary.supplier.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                      {selectedSummary.supplier.supplierCategory || 'Distributor'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedSummary.supplier.isActive !== false
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                      }`}
                    >
                      {selectedSummary.supplier.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    Complete Purchase History, Payments, Outstanding Balance &amp; Supplier Advance Ledger
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPayForm((prev) => !prev)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{showPayForm ? 'Hide Payment Form' : 'Record Payment / Advance'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(selectedSummary.supplier);
                    setIsFormOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierId(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
              {/* 4 Financial Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Total Purchases
                  </span>
                  <div className="text-lg font-black font-mono-code text-slate-900 mt-0.5">
                    {fmtCurrency(selectedSummary.totalPurchases)}
                  </div>
                  <span className="text-[10.5px] text-slate-500 block">
                    {selectedSummary.purchaseCount} bills · Credit:{' '}
                    {fmtCurrency(selectedSummary.creditPurchases)}
                  </span>
                  {selectedSummary.totalCommission > 0 && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-mono-code font-bold">
                      Company Comm: {fmtCurrency(selectedSummary.totalCommission)}
                    </span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Total Payments
                  </span>
                  <div className="text-lg font-black font-mono-code text-emerald-800 mt-0.5">
                    {fmtCurrency(selectedSummary.totalPayments)}
                  </div>
                  <span className="text-[10.5px] text-emerald-700/80">
                    Immediate: {fmtCurrency(selectedSummary.immediatePaidPurchases)} · Vouchers:{' '}
                    {fmtCurrency(selectedSummary.voucherPayments)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800 block">
                    Outstanding Balance (Payable)
                  </span>
                  <div className="text-lg font-black font-mono-code text-amber-800 mt-0.5">
                    {fmtCurrency(selectedSummary.outstandingBalance)}
                  </div>
                  <span className="text-[10.5px] text-amber-800/80">
                    Opening: {fmtCurrency(selectedSummary.openingBalance)} (
                    {selectedSummary.openingBalanceType})
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200">
                  <span className="text-[10px] font-bold uppercase text-teal-800 block">
                    Available Advance
                  </span>
                  <div className="text-lg font-black font-mono-code text-teal-800 mt-0.5">
                    {fmtCurrency(selectedSummary.availableAdvance)}
                  </div>
                  <span className="text-[10.5px] text-teal-800/80">
                    Returns Adj: {fmtCurrency(selectedSummary.purchaseReturnsLedger)}
                  </span>
                </div>
              </div>

              {/* Record Payment / Advance Inline Form */}
              {showPayForm && (
                <form
                  onSubmit={handleRecordSupplierPayment}
                  className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-700" />
                      <span>Record Payment or Advance to {selectedSummary.supplier.name}</span>
                    </h4>
                    <span className="text-[11px] text-emerald-800 font-semibold">
                      Posts automatically to Cash/Bank Book &amp; Balance Sheet
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-mono-code"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Amount (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-mono-code font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Payment Mode
                      </label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value as 'BANK_UPI' | 'CASH')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-bold"
                      >
                        <option value="BANK_UPI">Bank / NEFT / UPI</option>
                        <option value="CASH">Cash Drawer</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        UTR / Reference / Remarks
                      </label>
                      <input
                        type="text"
                        value={payNarration}
                        onChange={(e) => setPayNarration(e.target.value)}
                        placeholder="e.g. NEFT UTR / Advance"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPayForm(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPaying}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                    >
                      {isPaying ? 'Recording...' : 'Confirm & Post Payment'}
                    </button>
                  </div>
                </form>
              )}

              {/* Supplier Master Profile Details Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-[10.5px] font-extrabold uppercase text-slate-500 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-blue-600" />
                    <span>Contact &amp; Tax Profile</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Contact Person:</span>{' '}
                    <strong className="text-slate-900">
                      {selectedSummary.supplier.contactPerson || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Mobile:</span>{' '}
                    <strong className="font-mono-code text-slate-900">
                      {selectedSummary.supplier.phone || '—'}
                    </strong>
                    {selectedSummary.supplier.alternatePhone && (
                      <span className="text-slate-500 font-mono-code">
                        {' '}
                        / {selectedSummary.supplier.alternatePhone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-700 truncate">
                      {selectedSummary.supplier.email || '—'}
                    </span>
                  </div>
                  <div className="font-mono-code text-[11px]">
                    GSTIN: <strong>{selectedSummary.supplier.gstin || 'Unregistered'}</strong> ·
                    PAN: <strong>{selectedSummary.supplier.pan || '—'}</strong>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-[10.5px] font-extrabold uppercase text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-600" />
                    <span>Address &amp; Location</span>
                  </div>
                  <div className="text-slate-800 leading-relaxed">
                    {selectedSummary.supplier.address || 'No address provided'}
                  </div>
                  <div className="text-slate-600 font-semibold">
                    {[selectedSummary.supplier.state, selectedSummary.supplier.pinCode]
                      .filter(Boolean)
                      .join(' · PIN: ') || '—'}
                  </div>
                  {(selectedSummary.supplier.remarks || selectedSummary.supplier.notes) && (
                    <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-600 flex items-start gap-1">
                      <FileText className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                      <span>{selectedSummary.supplier.remarks || selectedSummary.supplier.notes}</span>
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="text-[10.5px] font-extrabold uppercase text-slate-500 flex items-center gap-1">
                    <Landmark className="w-3 h-3 text-sky-600" />
                    <span>Bank Account Details</span>
                  </div>
                  {selectedSummary.supplier.bankName ||
                  selectedSummary.supplier.bankAccountNo ||
                  selectedSummary.supplier.bankAccountDetails ? (
                    <>
                      {selectedSummary.supplier.bankName && (
                        <div>
                          <span className="text-slate-500">Bank:</span>{' '}
                          <strong className="text-slate-900">
                            {selectedSummary.supplier.bankName}
                          </strong>
                        </div>
                      )}
                      {selectedSummary.supplier.bankAccountNo && (
                        <div className="font-mono-code">
                          <span className="text-slate-500 font-sans">A/C No.:</span>{' '}
                          <strong>{selectedSummary.supplier.bankAccountNo}</strong>
                        </div>
                      )}
                      {(selectedSummary.supplier.bankIfsc ||
                        selectedSummary.supplier.bankBranch) && (
                        <div className="font-mono-code text-[11px]">
                          IFSC: <strong>{selectedSummary.supplier.bankIfsc || '—'}</strong>
                          {selectedSummary.supplier.bankBranch
                            ? ` · ${selectedSummary.supplier.bankBranch}`
                            : ''}
                        </div>
                      )}
                      {!selectedSummary.supplier.bankName &&
                        selectedSummary.supplier.bankAccountDetails && (
                          <div className="text-slate-700">
                            {selectedSummary.supplier.bankAccountDetails}
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="text-slate-400">No bank details saved (optional)</div>
                  )}
                </div>
              </div>

              {/* Complete Purchase & Payment History Ledger */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                    Complete Purchase &amp; Payment History ({filteredHistory.length} entries)
                  </h4>
                  <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-slate-200">
                    {(
                      [
                        { id: 'ALL', label: 'All Entries' },
                        { id: 'PURCHASE', label: `Purchases (${selectedSummary.purchaseCount})` },
                        { id: 'PAYMENT', label: `Payments (${selectedSummary.paymentCount})` },
                        { id: 'DEBIT_NOTE', label: `Returns (${selectedSummary.returnCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setHistoryFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          historyFilter === tab.id
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Ref / Invoice</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Particulars</th>
                        <th className="py-2.5 px-3">Mode</th>
                        <th className="py-2.5 px-3 text-right">Bill / Payable</th>
                        <th className="py-2.5 px-3 text-right">Paid / Adjusted</th>
                        <th className="py-2.5 px-3 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">
                            No purchase or payment entries recorded for this supplier yet.
                          </td>
                        </tr>
                      ) : (
                        filteredHistory.map((item) => {
                          const badgeClass =
                            item.type === 'PURCHASE'
                              ? 'bg-indigo-100 text-indigo-800'
                              : item.type === 'PAYMENT'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.type === 'DEBIT_NOTE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800';
                          const typeLabel =
                            item.type === 'PURCHASE'
                              ? 'Purchase'
                              : item.type === 'PAYMENT'
                              ? 'Payment'
                              : item.type === 'DEBIT_NOTE'
                              ? 'Debit Note'
                              : 'Opening';

                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono-code whitespace-nowrap text-slate-600">
                                {item.date || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono-code whitespace-nowrap">
                                <div className="font-bold text-slate-800">{item.refNo}</div>
                                {item.invoiceNo && (
                                  <div className="text-[10px] text-slate-500">
                                    Inv: {item.invoiceNo}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}
                                >
                                  {typeLabel}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 max-w-xs">
                                {item.particulars}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-semibold">
                                {item.paymentMode}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-code font-bold text-slate-900 whitespace-nowrap">
                                {item.billCredit > 0 ? fmtCurrency(item.billCredit) : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-code font-bold text-emerald-700 whitespace-nowrap">
                                {item.paidDebit > 0 ? fmtCurrency(item.paidDebit) : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-code font-extrabold whitespace-nowrap">
                                {item.runningNetBalance > 0 ? (
                                  <span className="text-amber-700">
                                    {fmtCurrency(item.runningNetBalance)} Pay
                                  </span>
                                ) : item.runningNetBalance < 0 ? (
                                  <span className="text-teal-700">
                                    {fmtCurrency(Math.abs(item.runningNetBalance))} Adv
                                  </span>
                                ) : (
                                  <span className="text-slate-400">₹0.00 Settled</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal (Zero-Transaction Suppliers Only) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  Delete Supplier Permanently?
                </h4>
                <p className="text-xs text-slate-500">
                  {deleteTarget.supplier.supplierCode} · {deleteTarget.supplier.name}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This supplier has <strong>0 linked purchase, payment, or return transactions</strong>,
              so it can be safely deleted. If you prefer to keep a record for audit, cancel and use{' '}
              <strong>Deactivate</strong> instead.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
