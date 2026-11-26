import React, { useState, useMemo } from 'react';
import {
  Banknote,
  QrCode,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Printer,
  Download,
  X,
  FileText,
  Calendar,
  Save,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
} from 'lucide-react';
import {
  SaleTransactionItem,
  SocietyProfile,
  AccountLedgerVoucher,
  PurchaseTransaction,
  GstTaxPaymentRecord,
  ReturnNote,
  DailyDrawerClosing,
  AdminStoreSettings,
} from '../types';
import { getIstDateStr } from '../utils/dateUtils';

interface CashDrawerSummaryProps {
  ledger: SaleTransactionItem[];
  society: SocietyProfile;
  accountVouchers?: AccountLedgerVoucher[];
  purchaseTransactions?: PurchaseTransaction[];
  gstPayments?: GstTaxPaymentRecord[];
  returnNotes?: ReturnNote[];
  drawerClosings?: DailyDrawerClosing[];
  adminSettings?: AdminStoreSettings;
  currentCashierName?: string;
  onAddDrawerClosing?: (closing: DailyDrawerClosing) => Promise<boolean> | void;
  onSaveDrawerClosing?: (closing: DailyDrawerClosing) => Promise<boolean> | void;
  onDeleteDrawerClosing?: (id: string) => Promise<boolean> | void;
  isAdmin?: boolean;
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export const CashDrawerSummary: React.FC<CashDrawerSummaryProps> = ({
  ledger,
  society,
  accountVouchers = [],
  purchaseTransactions = [],
  gstPayments = [],
  returnNotes = [],
  drawerClosings = [],
  onAddDrawerClosing: propOnAddDrawerClosing,
  onSaveDrawerClosing,
  onDeleteDrawerClosing,
  isAdmin = false,
}) => {
  const onAddDrawerClosing = propOnAddDrawerClosing || onSaveDrawerClosing;
  const todayIso = getIstDateStr();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [openingFloat, setOpeningFloat] = useState(2500);
  const [remarks, setRemarks] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [counts, setCounts] = useState<{ [denom: number]: number }>({
    500: 4,
    200: 5,
    100: 10,
    50: 8,
    20: 10,
    10: 20,
    5: 0,
    2: 0,
    1: 0,
  });

  // Group sales by invoiceNo for selectedDate so SPLIT & CREDIT cashPaid/upiPaid/creditDue are counted accurately per invoice
  const daySalesSummary = useMemo(() => {
    const dayRows = ledger.filter((item) => (item.saleDate || item.date || '').slice(0, 10) === selectedDate);
    const invoiceMap = new Map<
      string,
      {
        mode: string;
        grossTotal: number;
        cashPaid?: number;
        upiPaid?: number;
        creditDue?: number;
      }
    >();

    for (const row of dayRows) {
      const invKey = row.invoiceNo || `ROW-${row.saleItemId || row.id}`;
      const existing = invoiceMap.get(invKey);
      if (!existing) {
        invoiceMap.set(invKey, {
          mode: row.paymentMode,
          grossTotal: Number(row.lineTotal || 0),
          cashPaid: row.cashPaid,
          upiPaid: row.upiPaid,
          creditDue: row.creditDue,
        });
      } else {
        existing.grossTotal = Number((existing.grossTotal + Number(row.lineTotal || 0)).toFixed(2));
      }
    }

    let cashSales = 0;
    let upiSales = 0;
    let creditSales = 0;

    for (const inv of invoiceMap.values()) {
      const total = Math.round(inv.grossTotal);
      if (inv.mode === 'CASH') {
        cashSales += total;
      } else if (inv.mode === 'UPI') {
        upiSales += total;
      } else if (inv.mode === 'SPLIT') {
        const c = inv.cashPaid !== undefined ? Number(inv.cashPaid) : Math.round(total / 2);
        const u = inv.upiPaid !== undefined ? Number(inv.upiPaid) : Math.max(0, total - c);
        cashSales += c;
        upiSales += u;
      } else if (inv.mode === 'CREDIT') {
        const c = inv.cashPaid !== undefined ? Number(inv.cashPaid) : 0;
        const cr = inv.creditDue !== undefined ? Number(inv.creditDue) : Math.max(0, total - c);
        cashSales += c;
        creditSales += cr;
      }
    }

    return {
      cashSales: Number(cashSales.toFixed(2)),
      upiSales: Number(upiSales.toFixed(2)),
      creditSales: Number(creditSales.toFixed(2)),
      invoiceCount: invoiceMap.size,
    };
  }, [ledger, selectedDate]);

  // Cash Inflows & Outflows on selectedDate from Vouchers, Cash Purchases, PMT-06 Cash & Credit Note Cash Refunds
  const dayCashFlows = useMemo(() => {
    const dayVouchers = accountVouchers.filter(
      (v) => v.voucherDate === selectedDate && v.paymentMode === 'CASH'
    );
    const voucherInflows = dayVouchers
      .filter(
        (v) =>
          v.voucherType === 'OTHER_INCOME' ||
          v.voucherType === 'MEMBER_RECEIPT' ||
          v.voucherType === 'CONTRA_BANK_TO_CASH'
      )
      .reduce((s, v) => s + Number(v.amount || 0), 0);

    const voucherOutflows = dayVouchers
      .filter(
        (v) =>
          v.voucherType === 'EXPENSE' ||
          v.voucherType === 'SUPPLIER_PAYMENT' ||
          v.voucherType === 'CONTRA_CASH_TO_BANK'
      )
      .reduce((s, v) => s + Number(v.amount || 0), 0);

    const cashPurchases = purchaseTransactions
      .filter(
        (tx) =>
          (tx.purchaseDate || '').slice(0, 10) === selectedDate &&
          tx.paymentStatus === 'CASH'
      )
      .reduce((s, tx) => s + Number(tx.totalAmount || 0), 0);

    const cashGstChallans = gstPayments
      .filter((p) => p.paymentDate === selectedDate && (p.paymentSource || p.paymentMode) === 'CASH')
      .reduce((s, p) => s + Number(p.totalPaid || 0), 0);

    const cashSaleRefunds = returnNotes
      .filter(
        (n) =>
          (n.noteDate || n.returnDate || '').slice(0, 10) === selectedDate &&
          n.noteType === 'CREDIT_NOTE' &&
          (n.settlementMode || n.refundMode) === 'CASH'
      )
      .reduce((s, n) => s + Number(n.totalAmount || 0), 0);

    return {
      inflows: Number(voucherInflows.toFixed(2)),
      outflows: Number(
        (voucherOutflows + cashPurchases + cashGstChallans + cashSaleRefunds).toFixed(2)
      ),
    };
  }, [accountVouchers, purchaseTransactions, gstPayments, returnNotes, selectedDate]);

  const cashSalesTotal = daySalesSummary.cashSales;
  const upiSalesTotal = daySalesSummary.upiSales;
  const creditSalesTotal = daySalesSummary.creditSales;
  const cashInflowsTotal = dayCashFlows.inflows;
  const cashOutflowsTotal = dayCashFlows.outflows;

  const expectedCashInDrawer = Number(
    (openingFloat + cashSalesTotal + cashInflowsTotal - cashOutflowsTotal).toFixed(2)
  );

  const actualCountedCash = Object.entries(counts).reduce((sum, [denom, count]) => {
    return sum + Number(denom) * (Number(count) || 0);
  }, 0);

  const variance = Number((actualCountedCash - expectedCashInDrawer).toFixed(2));
  const nowStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const handleNoteChange = (denom: number, value: string) => {
    const val = Math.max(0, parseInt(value) || 0);
    setCounts((prev) => ({ ...prev, [denom]: val }));
  };

  const handleAutoMatchDenominations = () => {
    let remaining = Math.max(0, Math.round(expectedCashInDrawer));
    const nextCounts: { [denom: number]: number } = {};
    for (const d of DENOMINATIONS) {
      nextCounts[d] = Math.floor(remaining / d);
      remaining = remaining % d;
    }
    setCounts(nextCounts);
  };

  const handleSaveClosing = async () => {
    if (!onAddDrawerClosing) return;
    const record: DailyDrawerClosing = {
      id: `ZREP-${selectedDate}-${Date.now()}`,
      closingDate: selectedDate,
      openingFloat,
      cashSales: cashSalesTotal,
      upiSales: upiSalesTotal,
      creditSales: creditSalesTotal,
      cashInflows: cashInflowsTotal,
      cashOutflows: cashOutflowsTotal,
      expectedCash: expectedCashInDrawer,
      actualCountedCash,
      variance,
      denominations: { ...counts },
      closedBy: society.cashierName || 'Cashier',
      remarks: remarks.trim() || `Day-end Z-Report for ${selectedDate}`,
      createdAt: new Date().toISOString(),
    };
    await onAddDrawerClosing(record);
    setSaveMessage(`Saved Day-End Z-Report for ${selectedDate} successfully.`);
    setTimeout(() => setSaveMessage(null), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const lines = [
      '===========================================================',
      `             ${society.name.toUpperCase()}            `,
      `          ${society.address}         `,
      `Tel: ${society.phone}${society.regNo ? ` | Reg: ${society.regNo}` : ''}`,
      society.gstin ? `GSTIN: ${society.gstin}` : '',
      society.email ? `Email: ${society.email}` : '',
      '===========================================================',
      '     CASHIER DAILY SETTLEMENT REPORT (Z-REPORT)    ',
      '===========================================================',
      `Settlement Date:  ${selectedDate}`,
      `Generated At:     ${nowStr}`,
      `Counter:          ${society.counterId}`,
      `Cashier:          ${society.cashierName}`,
      `UPI ID:           ${society.upiId} (${society.merchantName || 'DEGANGA CADP FSCS LTD'})`,
      '-----------------------------------------------------------',
      'REVENUE & COLLECTIONS SUMMARY:',
      `Opening Cash Float:            ₹${openingFloat.toFixed(2)}`,
      `(+) Cash Sales (Incl. Split):  ₹${cashSalesTotal.toFixed(2)}`,
      `(+) Other Cash Receipts:       ₹${cashInflowsTotal.toFixed(2)}`,
      `(-) Cash Expenses / Payments:  ₹${cashOutflowsTotal.toFixed(2)}`,
      `Expected Cash in Drawer:       ₹${expectedCashInDrawer.toFixed(2)}`,
      `Actual Cash Counted:           ₹${actualCountedCash.toFixed(2)}`,
      `Cash Variance:                 ${variance >= 0 ? '+' : ''}₹${variance.toFixed(2)} (${
        variance === 0 ? 'Balanced' : variance > 0 ? 'Excess' : 'Shortage'
      })`,
      '-----------------------------------------------------------',
      `Online QR / UPI Collections:   ₹${upiSalesTotal.toFixed(2)}`,
      `Member Credit (Udhaar) Sales:  ₹${creditSalesTotal.toFixed(2)}`,
      `GROSS DAY TURNOVER:            ₹${(cashSalesTotal + upiSalesTotal + creditSalesTotal).toFixed(2)}`,
      '-----------------------------------------------------------',
      'PHYSICAL CASH DENOMINATIONS IN DRAWER:',
      ...DENOMINATIONS.map(
        (denom) =>
          `  ₹${denom.toString().padEnd(4)} x ${(counts[denom] || 0)
            .toString()
            .padStart(3)} = ₹${(denom * (counts[denom] || 0)).toFixed(2)}`
      ),
      '-----------------------------------------------------------',
      'Cashier Signature: ___________________________',
      '',
      'Manager / Secretary Signature: ________________',
      '===========================================================',
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Z_Report_${selectedDate}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title & Date Picker */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-extrabold text-xl text-slate-900">
            Cash Register &amp; Daily Day-End Settlement (Z-Report)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {society.name} · Counter: {society.counterId} · Cashier: {society.cashierName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300">
            <Calendar className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-bold text-slate-700">Z-Report Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayIso)}
              className="text-xs font-mono-code font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(todayIso)}
              className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
            >
              Today
            </button>
          </div>

          <button
            onClick={() => setIsPreviewOpen(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-300 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Preview Voucher</span>
          </button>

          {onAddDrawerClosing && (
            <button
              onClick={handleSaveClosing}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Daily Z-Report</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Print Z-Report</span>
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="p-3 bg-emerald-900 text-emerald-100 rounded-xl text-xs font-bold flex items-center gap-2 shadow">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Expected vs Counted Cash ({selectedDate})
            </span>
            <Banknote className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono-code">
            ₹{actualCountedCash.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono-code">
            Expected: <strong>₹{expectedCashInDrawer.toFixed(2)}</strong> (Float ₹{openingFloat} + Sales ₹{cashSalesTotal})
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Cash Inflows &amp; Outflows
            </span>
            <div className="flex items-center gap-1">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2 font-mono-code">
            <div>
              <span className="text-[10px] text-slate-400 block">Inflows</span>
              <span className="text-base font-extrabold text-emerald-700">+₹{cashInflowsTotal.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Outflows</span>
              <span className="text-base font-extrabold text-rose-600">-₹{cashOutflowsTotal.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Vouchers, Cash Purchases, Refunds &amp; Contra
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              UPI &amp; Member Credit ({daySalesSummary.invoiceCount} Bills)
            </span>
            <QrCode className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2 font-mono-code">
            ₹{upiSalesTotal.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between font-mono-code">
            <span>UPI Settled</span>
            {creditSalesTotal > 0 && (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Credit: ₹{creditSalesTotal.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Cash Drawer Variance
            </span>
            {Math.abs(variance) < 1 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
          </div>
          <div
            className={`text-2xl font-extrabold mt-2 font-mono-code ${
              variance === 0
                ? 'text-emerald-700'
                : variance > 0
                ? 'text-blue-700'
                : 'text-rose-600'
            }`}
          >
            {variance >= 0 ? `+₹${variance.toFixed(2)}` : `-₹${Math.abs(variance).toFixed(2)}`}
          </div>
          <div className="text-xs font-semibold mt-1">
            {Math.abs(variance) < 1 ? (
              <span className="text-emerald-700">Perfect Match (Balanced)</span>
            ) : variance > 0 ? (
              <span className="text-blue-700">Cash Excess</span>
            ) : (
              <span className="text-rose-600">Cash Shortage</span>
            )}
          </div>
        </div>
      </div>

      {/* Denomination Counter Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h4 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <span>Cash Denomination Counter (Notes &amp; Coins in Drawer)</span>
          </h4>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-semibold">Morning Float: ₹</span>
              <input
                type="number"
                step="100"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
                className="w-24 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg font-bold font-mono-code text-slate-800"
              />
            </div>
            <button
              type="button"
              onClick={handleAutoMatchDenominations}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs cursor-pointer"
            >
              Auto-Fill Expected Cash (₹{expectedCashInDrawer.toFixed(0)})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5">
          {DENOMINATIONS.map((denom) => {
            const count = counts[denom] || 0;
            const subtotal = denom * count;
            const isCoin = denom <= 5;

            return (
              <div
                key={denom}
                className={`p-2.5 rounded-xl border space-y-1.5 ${
                  isCoin ? 'bg-amber-50/40 border-amber-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>₹{denom} {isCoin ? 'Coin' : 'Note'}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={count}
                  onChange={(e) => handleNoteChange(denom, e.target.value)}
                  className="w-full px-2 py-1 text-center font-bold text-sm bg-white border border-slate-300 rounded-lg font-mono-code focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="text-center font-mono-code text-[11px] font-extrabold text-emerald-800">
                  = ₹{subtotal.toLocaleString('en-IN')}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional cashier closing note / shift handover remarks..."
            className="w-full sm:max-w-md px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="text-xs font-mono-code text-slate-600">
            Gross Day Sales ({selectedDate}):{' '}
            <strong className="text-slate-900">
              ₹{(cashSalesTotal + upiSalesTotal + creditSalesTotal).toFixed(2)}
            </strong>
          </div>
        </div>
      </div>

      {/* Saved Daily Z-Report Closings Archive */}
      {drawerClosings.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h4 className="font-extrabold text-sm text-slate-900">
              Archived Daily Z-Report Closings ({drawerClosings.length})
            </h4>
            <span className="text-[11px] text-slate-500">
              Audited shift &amp; day-end cash drawer snapshots
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Float</th>
                  <th className="py-2.5 px-4 text-right">Cash Sales</th>
                  <th className="py-2.5 px-4 text-right">In / Out</th>
                  <th className="py-2.5 px-4 text-right">Expected</th>
                  <th className="py-2.5 px-4 text-right">Counted</th>
                  <th className="py-2.5 px-4 text-right">Variance</th>
                  <th className="py-2.5 px-4">Closed By</th>
                  {isAdmin && onDeleteDrawerClosing && <th className="py-2.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono-code">
                {drawerClosings.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{c.closingDate}</td>
                    <td className="py-2.5 px-4 text-right">₹{Number(c.openingFloat).toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700 font-bold">
                      ₹{Number(c.cashSales).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[11px]">
                      <span className="text-emerald-700">+₹{Number(c.cashInflows || 0).toFixed(0)}</span>
                      {' / '}
                      <span className="text-rose-600">-₹{Number(c.cashOutflows || 0).toFixed(0)}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold">
                      ₹{Number(c.expectedCash).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-900">
                      ₹{Number(c.actualCountedCash).toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold ${
                        Number(c.variance) === 0
                          ? 'text-emerald-700'
                          : Number(c.variance) > 0
                          ? 'text-blue-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {Number(c.variance) >= 0
                        ? `+₹${Number(c.variance).toFixed(2)}`
                        : `-₹${Math.abs(Number(c.variance)).toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-700">
                      {c.closedBy}
                      {c.remarks ? (
                        <span className="block text-[10px] text-slate-400 truncate max-w-[180px]">
                          {c.remarks}
                        </span>
                      ) : null}
                    </td>
                    {isAdmin && onDeleteDrawerClosing && (
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteDrawerClosing(c.id)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Delete Z-Report snapshot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRINTABLE Z-REPORT */}
      <div
        id="printable-receipt"
        className="hidden print:block printable-area bg-white text-black p-8 font-mono-code max-w-2xl mx-auto"
      >
        <div className="text-center pb-4 border-b-2 border-black">
          <h1 className="text-lg font-black uppercase tracking-wider">{society.name}</h1>
          <p className="text-xs font-bold mt-0.5">{society.address}</p>
          <p className="text-[11px]">
            Tel: {society.phone}
            {society.regNo ? ` · Reg: ${society.regNo}` : ''}
          </p>
          {(society.gstin || society.email) && (
            <p className="text-[11px] font-bold">
              {society.gstin ? `GSTIN: ${society.gstin}` : ''}
              {society.gstin && society.email ? ' · ' : ''}
              {society.email ? `Email: ${society.email}` : ''}
            </p>
          )}
          <div className="mt-2 inline-block px-3 py-1 border border-black font-extrabold text-xs uppercase tracking-wide">
            DAILY CASHIER DAY-END SETTLEMENT (Z-REPORT) · {selectedDate}
          </div>
        </div>

        <div className="py-3 border-b border-black text-xs space-y-1">
          <div className="flex justify-between">
            <span>Settlement Date:</span>
            <span className="font-bold">{selectedDate}</span>
          </div>
          <div className="flex justify-between">
            <span>Report Generated:</span>
            <span className="font-bold">{nowStr}</span>
          </div>
          <div className="flex justify-between">
            <span>Counter ID / Cashier:</span>
            <span className="font-bold">
              {society.counterId} · {society.cashierName}
            </span>
          </div>
        </div>

        <div className="py-3 border-b border-black text-xs space-y-1.5">
          <div className="font-bold uppercase tracking-wider mb-1 text-[11px]">
            1. Cash Drawer Reconciliation:
          </div>
          <div className="flex justify-between">
            <span>(+) Opening Cash Float:</span>
            <span className="font-bold">₹{openingFloat.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>(+) Cash Sales (Incl. Split Cash):</span>
            <span className="font-bold">₹{cashSalesTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>(+) Other Cash Receipts / Inflows:</span>
            <span className="font-bold">₹{cashInflowsTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>(-) Cash Expenses / Payments / Refunds:</span>
            <span className="font-bold">-₹{cashOutflowsTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-dashed border-gray-400 pt-1">
            <span>Expected Physical Cash in Drawer:</span>
            <span className="font-bold">₹{expectedCashInDrawer.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Actual Counted Cash in Drawer:</span>
            <span className="font-black text-sm">₹{actualCountedCash.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-black pt-1">
            <span>Drawer Variance (Excess / Shortage):</span>
            <span>
              {variance >= 0 ? `+₹${variance.toFixed(2)}` : `-₹${Math.abs(variance).toFixed(2)}`} (
              {variance === 0 ? 'Balanced' : variance > 0 ? 'Excess' : 'Shortage'})
            </span>
          </div>
        </div>

        <div className="py-3 border-b border-black text-xs space-y-1.5">
          <div className="font-bold uppercase tracking-wider mb-1 text-[11px]">
            2. Digital &amp; Credit Summary:
          </div>
          <div className="flex justify-between">
            <span>Online QR / UPI Settled:</span>
            <span className="font-bold">₹{upiSalesTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Member Credit (Udhaar) Billed:</span>
            <span className="font-bold">₹{creditSalesTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-black text-sm border-t border-black pt-1">
            <span>TOTAL GROSS DAY TURNOVER:</span>
            <span>₹{(cashSalesTotal + upiSalesTotal + creditSalesTotal).toFixed(2)}</span>
          </div>
        </div>

        <div className="py-3 border-b border-black text-xs">
          <div className="font-bold uppercase tracking-wider mb-2 text-[11px]">
            3. Physical Currency Denominations Counted:
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-400">
                <th className="pb-1">Denomination</th>
                <th className="pb-1 text-center">Count</th>
                <th className="pb-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {DENOMINATIONS.map((denom) => (
                <tr key={denom} className="border-b border-gray-200">
                  <td className="py-1">
                    ₹{denom} {denom <= 5 ? 'Coin' : 'Currency Note'}
                  </td>
                  <td className="py-1 text-center">{counts[denom] || 0}</td>
                  <td className="py-1 text-right font-bold">
                    ₹{((counts[denom] || 0) * denom).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="pt-2">TOTAL COUNTED CASH</td>
                <td className="pt-2 text-center">
                  {Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0)} Pcs
                </td>
                <td className="pt-2 text-right">₹{actualCountedCash.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="pt-8 pb-4 text-xs grid grid-cols-2 gap-8">
          <div>
            <div className="border-t border-black pt-1 text-center">
              Cashier Signature ({society.cashierName})
            </div>
          </div>
          <div>
            <div className="border-t border-black pt-1 text-center">
              Secretary / Manager Signature
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">
                  Cashier Day-End Settlement (Z-Report) · {selectedDate}
                </h3>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
              <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-sm font-mono-code text-xs space-y-4">
                <div className="text-center pb-3 border-b border-slate-300">
                  <h4 className="font-extrabold text-sm uppercase text-slate-900">
                    {society.name}
                  </h4>
                  <p className="text-[11px] text-slate-600">{society.address}</p>
                  <span className="inline-block mt-2 px-2.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-bold text-[10px] text-slate-800 uppercase">
                    Daily Settlement Audit Voucher · {selectedDate}
                  </span>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Opening Cash Float:</span>
                    <span className="font-bold">₹{openingFloat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">(+) Cash Sales ({selectedDate}):</span>
                    <span className="font-bold text-emerald-700">₹{cashSalesTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">(+) Other Cash Inflows:</span>
                    <span className="font-bold text-emerald-700">₹{cashInflowsTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">(-) Cash Outflows / Expenses:</span>
                    <span className="font-bold text-rose-600">-₹{cashOutflowsTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <span className="font-semibold text-slate-800">Expected in Drawer:</span>
                    <span className="font-bold text-slate-900">₹{expectedCashInDrawer.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-800">Actual Cash Counted:</span>
                    <span className="font-extrabold text-slate-900">₹{actualCountedCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-1 text-emerald-800">
                    <span>Reconciliation Variance:</span>
                    <span>
                      {variance >= 0 ? `+₹${variance.toFixed(2)}` : `-₹${Math.abs(variance).toFixed(2)}`} (
                      {variance === 0 ? 'Balanced' : variance > 0 ? 'Excess' : 'Shortage'})
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span>Online UPI Sales:</span>
                    <span className="font-bold">₹{upiSalesTotal.toFixed(2)}</span>
                  </div>
                  {creditSalesTotal > 0 && (
                    <div className="flex justify-between">
                      <span>Member Credit Sales:</span>
                      <span className="font-bold text-amber-700">₹{creditSalesTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm pt-1 border-t-2 border-slate-900">
                    <span>GROSS DAY TURNOVER:</span>
                    <span className="text-emerald-800">
                      ₹{(cashSalesTotal + upiSalesTotal + creditSalesTotal).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadTxt}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Text</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Print Document</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
