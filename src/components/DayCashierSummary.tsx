import React, { useState } from 'react';
import {
  Calendar,
  Users,
  TrendingUp,
  Banknote,
  QrCode,
  Search,
  Receipt,
  Download,
  ShieldCheck,
  Layers,
  Clock,
  CheckCircle2,
  Scale,
  Tag
} from 'lucide-react';
import { SaleTransactionItem, CashierUser, CompleteInvoice } from '../types';
import { getIstDateStr, getIstDateOffsetStr } from '../utils/dateUtils';
import { exportLedgerToCsv } from '../utils/csvExporter';

interface DayCashierSummaryProps {
  ledger: SaleTransactionItem[];
  cashiers: CashierUser[];
  onViewInvoice: (invoice: CompleteInvoice) => void;
  societyName: string;
}

export const DayCashierSummary: React.FC<DayCashierSummaryProps> = ({
  ledger,
  cashiers,
  onViewInvoice,
  societyName,
}) => {
  // Robust IST Date Priority (Asia/Kolkata)
  const todayStr = getIstDateStr();

  // Extract unique dates from ledger and ALWAYS include todayStr
  const datesSet = Array.from(
    new Set([
      todayStr,
      ...ledger.map((item) => {
        const sDate = item.saleDate || '';
        return sDate.split(' ')[0] || sDate.split('T')[0] || sDate;
      }),
    ])
  )
    .filter(Boolean)
    .sort()
    .reverse();

  const currentDate = todayStr;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(currentDate);
  const [selectedCashierFilter, setSelectedCashierFilter] = useState<string>('ALL');
  const [ledgerDateStart, setLedgerDateStart] = useState<string>('');
  const [ledgerDateEnd, setLedgerDateEnd] = useState<string>('');
  const [barcodeFilter, setBarcodeFilter] = useState<'ALL' | 'WITH_BARCODE' | 'WITHOUT_BARCODE'>('ALL');

  // Date Range Quick Helper Calculations
  const yesterdayStr = getIstDateOffsetStr(-1);
  const sevenDaysAgoStr = getIstDateOffsetStr(-6);

  const thisMonthStr = todayStr.slice(0, 7);

  const handleClearFilters = () => {
    setSelectedDateFilter('ALL');
    setSelectedCashierFilter('ALL');
    setBarcodeFilter('ALL');
    setSearchQuery('');
    setLedgerDateStart('');
    setLedgerDateEnd('');
    setDateRangeStart('');
    setDateRangeEnd('');
    setCashierDateRangeStart('');
    setCashierDateRangeEnd('');
  };

  // Filtered ledger rows
  const filteredLedger = ledger.filter((row) => {
    const sDate = row.saleDate || '';
    const rowDate = sDate.split(' ')[0] || sDate;
    
    let matchesDate = true;
    if (selectedDateFilter === 'ALL') {
      // If user specified custom start or end dates while in ALL mode, respect them
      if (ledgerDateStart && rowDate < ledgerDateStart) matchesDate = false;
      if (ledgerDateEnd && rowDate > ledgerDateEnd) matchesDate = false;
    } else if (selectedDateFilter === 'DATE_RANGE') {
      if (ledgerDateStart && rowDate < ledgerDateStart) matchesDate = false;
      if (ledgerDateEnd && rowDate > ledgerDateEnd) matchesDate = false;
    } else if (selectedDateFilter === 'TODAY' || selectedDateFilter === currentDate) {
      matchesDate = rowDate === currentDate;
    } else if (selectedDateFilter === 'YESTERDAY') {
      matchesDate = rowDate === yesterdayStr;
    } else if (selectedDateFilter === 'LAST_7_DAYS') {
      matchesDate = rowDate >= sevenDaysAgoStr && rowDate <= todayStr;
    } else if (selectedDateFilter === 'THIS_MONTH') {
      matchesDate = rowDate.startsWith(thisMonthStr);
    } else {
      matchesDate = rowDate === selectedDateFilter;
    }

    const matchesCashier =
      selectedCashierFilter === 'ALL' || ((row as any).cashierName || '').includes(selectedCashierFilter);

    const isWithoutBarcode = row.barcodeMode === 'WITHOUT_BARCODE' || row.barcode === 'WITHOUT_BARCODE' || row.saleType === 'DIRECT_LOOSE';
    let matchesBarcode = true;
    if (barcodeFilter === 'WITH_BARCODE') {
      matchesBarcode = !isWithoutBarcode;
    } else if (barcodeFilter === 'WITHOUT_BARCODE') {
      matchesBarcode = isWithoutBarcode;
    }

    const q = (searchQuery || '').toLowerCase().trim();
    const dateMatch = (row.saleDate || '').toLowerCase().includes(q) ||
      (Boolean(row.saleDate) && (() => {
        const parts = (row.saleDate.split(' ')[0] || '').split('-');
        if (parts.length === 3) {
          const ddmmyyyy = `${parts[2]}-${parts[1]}-${parts[0]}`;
          const ddmmyyyySlash = `${parts[2]}/${parts[1]}/${parts[0]}`;
          return ddmmyyyy.includes(q) || ddmmyyyySlash.includes(q);
        }
        return false;
      })());

    const matchesSearch =
      !q ||
      (row.invoiceNo || '').toLowerCase().includes(q) ||
      (row.customerName || '').toLowerCase().includes(q) ||
      (row.productName || '').toLowerCase().includes(q) ||
      (row.barcode || '').includes(q) ||
      dateMatch;

    return matchesDate && matchesCashier && matchesSearch && matchesBarcode;
  }).sort((a, b) => {
    const timeA = new Date(a.saleDate || 0).getTime();
    const timeB = new Date(b.saleDate || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return b.saleItemId - a.saleItemId;
  });

  const getFilteredLedgerTotal = () => {
    return filteredLedger.reduce((sum, r) => sum + r.lineTotal, 0);
  };

  // Today's priority metrics (rows matching currentDate)
  const todayRows = ledger.filter((row) => {
    const sDate = row.saleDate || '';
    const rowDate = sDate.split(' ')[0] || sDate;
    return rowDate === currentDate;
  });

  const todayTurnover = todayRows.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  const todayUpi = todayRows.filter((i) => (i.paymentMode || '').toUpperCase() === 'UPI').reduce((sum, i) => sum + (i.lineTotal || 0), 0);
  const todayCash = todayRows.filter((i) => (i.paymentMode || '').toUpperCase() === 'CASH').reduce((sum, i) => sum + (i.lineTotal || 0), 0);
  const todayInvoiceCount = new Set(todayRows.map((r) => r.invoiceNo || '')).size;

  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');
  const [cashierDateRangeStart, setCashierDateRangeStart] = useState<string>('');
  const [cashierDateRangeEnd, setCashierDateRangeEnd] = useState<string>('');

  // Group by Date for Day-wise Summary (only working days where transactions occurred)
  const daySummaryMap = new Map<string, { turnover: number; upi: number; cash: number; count: number }>();

  // Aggregate transaction totals into daySummaryMap
  ledger.forEach((item) => {
    const sDate = item.saleDate || '';
    const d = (sDate.split(' ')[0] || sDate.split('T')[0] || sDate).trim();
    if (!d) return;
    const existing = daySummaryMap.get(d) || { turnover: 0, upi: 0, cash: 0, count: 0 };
    const amt = Number(item.lineTotal || 0);
    existing.turnover += amt;
    const mode = (item.paymentMode || '').toUpperCase();
    if (mode === 'UPI') existing.upi += amt;
    if (mode === 'CASH') existing.cash += amt;
    existing.count += 1;
    daySummaryMap.set(d, existing);
  });

  const sortedDates = Array.from(daySummaryMap.keys())
    .filter((d) => (daySummaryMap.get(d)?.count || 0) > 0)
    .sort()
    .reverse();

  const filteredDates = sortedDates.filter((date) => {
    if (dateRangeStart && date < dateRangeStart) return false;
    if (dateRangeEnd && date > dateRangeEnd) return false;
    return true;
  });

  // Display only working days with actual transactions
  const displayDates = filteredDates;


  // Group by Cashier for Cashier-wise Summary (only cashiers with transactions > 0)
  const cashierSummaryMap = new Map<string, { name: string; staffCode?: string; turnover: number; upi: number; cash: number; count: number }>();

  const activeSummaryDate = selectedDateFilter === 'ALL' ? currentDate : selectedDateFilter;

  ledger.forEach((item) => {
    const sDate = item.saleDate || '';
    const rowDate = (sDate.split(' ')[0] || sDate.split('T')[0] || sDate).trim();
    
    let inRange = false;
    if (cashierDateRangeStart || cashierDateRangeEnd) {
      inRange = true;
      if (cashierDateRangeStart && rowDate < cashierDateRangeStart) inRange = false;
      if (cashierDateRangeEnd && rowDate > cashierDateRangeEnd) inRange = false;
    } else {
      inRange = (rowDate === activeSummaryDate);
    }

    if (inRange) {
      const rawName = (item.cashierName || 'Subrata Roy').trim();
      const matchedCashier = cashiers.find(
        (c) => c?.name && (rawName === c.name || rawName.startsWith(`${c.name} (`))
      );
      const canonicalName = matchedCashier ? matchedCashier.name : rawName;
      const existing = cashierSummaryMap.get(canonicalName) || {
        name: canonicalName,
        staffCode: matchedCashier?.staffCode,
        turnover: 0,
        upi: 0,
        cash: 0,
        count: 0,
      };
      const amt = Number(item.lineTotal || 0);
      existing.turnover += amt;
      const mode = (item.paymentMode || '').toUpperCase();
      if (mode === 'UPI') existing.upi += amt;
      if (mode === 'CASH') existing.cash += amt;
      existing.count += 1;
      cashierSummaryMap.set(canonicalName, existing);
    }
  });

  const activeCashierSummaries = Array.from(cashierSummaryMap.values())
    .filter((entry) => entry.count > 0 && entry.turnover > 0)
    .sort((a, b) => b.turnover - a.turnover);

  const getInvoiceTotal = (invoiceNo: string) => {
    return ledger.filter((r) => r.invoiceNo === invoiceNo).reduce((sum, r) => sum + r.lineTotal, 0);
  };

  const handleExport = () => {
    exportLedgerToCsv(ledger, societyName);
  };

  const handleInspectInvoice = (invoiceNo: string) => {
    const matchingRows = ledger.filter((r) => r.invoiceNo === invoiceNo);
    if (matchingRows.length === 0) return;

    const first = matchingRows[0];
    const rawItemsTotal = Number(matchingRows.reduce((sum, r) => sum + (r.lineTotal || 0), 0).toFixed(2));
    const totalGst = Number(matchingRows.reduce((sum, r) => sum + (r.totalGstAmount || 0), 0).toFixed(2));
    const totalCgst = Number(
      matchingRows
        .reduce((sum, r) => sum + (r.cgstAmount || (r.totalGstAmount ? r.totalGstAmount / 2 : 0)), 0)
        .toFixed(2)
    );
    const totalSgst = Number(
      matchingRows
        .reduce((sum, r) => sum + (r.sgstAmount || (r.totalGstAmount ? r.totalGstAmount / 2 : 0)), 0)
        .toFixed(2)
    );
    const rawBaseSum = matchingRows.reduce(
      (sum, i) =>
        sum +
        (i.baseAmount !== undefined
          ? i.baseAmount
          : i.sellingPriceWD !== undefined
          ? i.sellingPriceWD * i.quantity
          : i.lineTotal),
      0
    );
    const baseTotal = Number((rawBaseSum > 0 ? rawBaseSum : Math.max(0, rawItemsTotal - totalGst)).toFixed(2));
    const expectedRawFromParts = Number((baseTotal + totalGst).toFixed(2));
    const isAlreadyRoundedSingleRow =
      matchingRows.length === 1 &&
      expectedRawFromParts > 0 &&
      rawItemsTotal > expectedRawFromParts &&
      rawItemsTotal === Math.ceil(expectedRawFromParts);
    const rawTotal = isAlreadyRoundedSingleRow ? expectedRawFromParts : rawItemsTotal;
    const grandTotal = Math.ceil(rawTotal);
    const roundOff = Number((grandTotal - rawTotal).toFixed(2));

    const inv: CompleteInvoice = {
      saleId: first.saleId,
      invoiceNo: first.invoiceNo,
      saleDate: first.saleDate,
      customerName: first.customerName,
      paymentMode: first.paymentMode,
      items: matchingRows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        barcode: r.barcode,
        quantity: r.quantity,
        unitType: r.unitType,
        sellingPrice: r.sellingPrice,
        lineTotal: r.lineTotal,
        sellingPriceWD: r.sellingPriceWD,
        gstPercent: r.gstPercent,
        cgstPercent: r.cgstPercent,
        sgstPercent: r.sgstPercent,
        cgstAmount: r.cgstAmount,
        sgstAmount: r.sgstAmount,
        totalGstAmount: r.totalGstAmount,
        baseAmount: r.baseAmount,
        barcodeMode: r.barcodeMode,
        saleType: r.saleType,
        measuredWeightText: r.measuredWeightText,
        packetBarcode: r.packetBarcode,
      })),
      baseAmount: baseTotal,
      totalGst,
      cgstAmount: totalCgst,
      sgstAmount: totalSgst,
      roundOff,
      subtotal: rawTotal,
      discount: Number(matchingRows.reduce((sum, r) => sum + (Number(r.memberDiscount) || 0), 0).toFixed(2)),
      memberDiscount: Number(matchingRows.reduce((sum, r) => sum + (Number(r.memberDiscount) || 0), 0).toFixed(2)),
      grandTotal,
      cashier: (first as any).cashierName || 'Subrata Roy (Staff #402)',
      tenderedCash: first.paymentMode === 'CASH' ? (first.tenderedCash && first.tenderedCash >= grandTotal ? first.tenderedCash : grandTotal) : undefined,
      changeDue: first.paymentMode === 'CASH' ? (first.changeDue || 0) : 0,
      upiTxnRef: first.upiTxnRef,
    };

    onViewInvoice(inv);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      {/* ========================================================= */}
      {/* PRIORITY SECTION: CURRENT DATE SUMMARY (TODAY)            */}
      {/* ========================================================= */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-xl p-3 shadow-lg border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
              <span>Today's Live Business Performance</span>
              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold rounded-full text-[9px] flex items-center gap-1 font-mono-code">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                CURRENT DATE
              </span>
            </h2>
            <span className="text-slate-400 text-[10px] font-mono-code flex items-center gap-1 border-l border-slate-800 pl-2">
              <Calendar className="w-3 h-3 text-amber-400" />
              {currentDate}
            </span>
          </div>

          <button
            onClick={handleExport}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow transition-all shrink-0"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Today's Metrics Grid */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 relative z-10">
          <div className="bg-slate-900/90 border border-slate-800/90 py-2 px-3 rounded-lg shadow-inner flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Turnover
              </span>
              <div className="text-base font-black text-emerald-400 font-mono-code leading-tight">
                ₹{todayTurnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono-code bg-slate-800/80 px-1.5 py-0.5 rounded">
              {todayInvoiceCount} Invoices
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/90 py-2 px-3 rounded-lg shadow-inner flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                <QrCode className="w-3 h-3" />
                UPI / Online
              </span>
              <div className="text-base font-extrabold text-emerald-200 font-mono-code leading-tight">
                ₹{todayUpi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="text-[9px] text-slate-500 hidden sm:inline">Bank</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800/90 py-2 px-3 rounded-lg shadow-inner flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <Banknote className="w-3 h-3" />
                Cash In Hand
              </span>
              <div className="text-base font-extrabold text-amber-200 font-mono-code leading-tight">
                ₹{todayCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* DAY-WISE & CASHIER-WISE ANALYTICS CARDS                     */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Day-wise Summary Table */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-base text-slate-900">Day-wise Summary</h3>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              {displayDates.length} Working {displayDates.length === 1 ? 'Day' : 'Days'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px] pb-1">
            <input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
              className="border border-slate-300 rounded px-1.5 py-0.5"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              className="border border-slate-300 rounded px-1.5 py-0.5"
            />
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider font-mono-code">
                <tr>
                  <th className="py-1.5 px-2">Date</th>
                  <th className="py-1.5 px-2 text-right">Turnover</th>
                  <th className="py-1.5 px-2 text-right">UPI</th>
                  <th className="py-1.5 px-2 text-right">Cash</th>
                  <th className="py-1.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-code">
                {displayDates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 font-sans text-xs">
                      No working days with transactions found.
                    </td>
                  </tr>
                ) : (
                  displayDates.map((dateStr) => {
                    const metrics = daySummaryMap.get(dateStr)!;
                    return (
                      <tr key={dateStr} className={`hover:bg-slate-50 ${dateStr === currentDate ? 'bg-emerald-50/60 font-bold' : ''}`}>
                        <td className="py-1.5 px-2 text-slate-900 flex items-center gap-1">
                          {dateStr === currentDate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>}
                          {dateStr}
                        </td>
                        <td className="py-1.5 px-2 text-right font-extrabold text-emerald-800">
                          ₹{metrics.turnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-600 text-[10px]">
                          ₹{metrics.upi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-600 text-[10px]">
                          ₹{metrics.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <button
                            onClick={() => setSelectedDateFilter(dateStr)}
                            className="px-2 py-1 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                          >
                            Filter
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cashier-wise Summary Table */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  { (cashierDateRangeStart || cashierDateRangeEnd)
                    ? 'Cashier-wise Range Summary'
                    : activeSummaryDate === currentDate
                    ? "Cashier-wise Today's Summary"
                    : 'Cashier-wise Summary' }
                </h3>
                <p className="text-[10px] text-slate-400 font-mono-code">
                  { (cashierDateRangeStart || cashierDateRangeEnd) ? `${cashierDateRangeStart || '...'} to ${cashierDateRangeEnd || '...'}` : activeSummaryDate }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <input
                type="date"
                value={cashierDateRangeStart}
                onChange={(e) => setCashierDateRangeStart(e.target.value)}
                className="border border-slate-300 rounded px-1.5 py-0.5"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={cashierDateRangeEnd}
                onChange={(e) => setCashierDateRangeEnd(e.target.value)}
                className="border border-slate-300 rounded px-1.5 py-0.5"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider font-mono-code">
                <tr>
                  <th className="py-2.5 px-3">Cashier Name</th>
                  <th className="py-2.5 px-3 text-right">Total Sales</th>
                  <th className="py-2.5 px-3 text-right">UPI</th>
                  <th className="py-2.5 px-3 text-right">Cash</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-code">
                {activeCashierSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 font-sans text-xs">
                      No cashier transactions recorded for this date.
                    </td>
                  </tr>
                ) : (
                  activeCashierSummaries.map((data) => (
                    <tr key={data.name} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-sans font-bold text-slate-900">
                        {data.name}{' '}
                        {data.staffCode && (
                          <span className="text-[10px] font-mono-code text-slate-500">({data.staffCode})</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-extrabold text-emerald-800">
                        ₹{data.turnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        ₹{data.upi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600">
                        ₹{data.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => setSelectedCashierFilter(data.name)}
                          className="px-2 py-1 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                        >
                          Filter
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* DETAILED TRANSACTIONS LEDGER TABLE                        */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Detailed Transaction Ledger
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                {filteredLedger.length} {filteredLedger.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
              <span className="font-medium">Active Filter:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold font-mono-code text-[11px] border border-emerald-300">
                {selectedDateFilter === 'ALL'
                  ? (ledgerDateStart || ledgerDateEnd
                      ? `Range: ${ledgerDateStart || 'Earliest'} → ${ledgerDateEnd || 'Latest'}`
                      : 'All Transactions (Full History)')
                  : selectedDateFilter === 'DATE_RANGE'
                  ? `Date Range: ${ledgerDateStart || 'Earliest'} → ${ledgerDateEnd || 'Latest'}`
                  : selectedDateFilter === 'TODAY' || selectedDateFilter === currentDate
                  ? `Today (${currentDate})`
                  : selectedDateFilter === 'YESTERDAY'
                  ? `Yesterday (${yesterdayStr})`
                  : selectedDateFilter === 'LAST_7_DAYS'
                  ? 'Last 7 Days'
                  : selectedDateFilter === 'THIS_MONTH'
                  ? `This Month (${thisMonthStr})`
                  : `Date: ${selectedDateFilter}`}
              </span>

              {selectedCashierFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[11px] border border-blue-200">
                  Cashier: {selectedCashierFilter}
                </span>
              )}

              {barcodeFilter !== 'ALL' && (
                <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
                  barcodeFilter === 'WITH_BARCODE'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  {barcodeFilter === 'WITH_BARCODE' ? '🏷️ With Barcode Only' : '⚖️ Loose (No Barcode) Only'}
                </span>
              )}

              <div className="bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 ml-1">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">Total:</span>
                <span className="text-xs font-black text-emerald-900 font-mono-code">
                  ₹{getFilteredLedgerTotal().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => exportLedgerToCsv(filteredLedger, `${societyName}_Transactions`)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              title="Download currently filtered transactions as CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV ({filteredLedger.length})</span>
            </button>

            {(selectedDateFilter !== 'ALL' || selectedCashierFilter !== 'ALL' || ledgerDateStart || ledgerDateEnd || searchQuery) && (
              <button
                onClick={handleClearFilters}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors"
                title="Reset all filters to All Transactions"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Search & Comprehensive Filters Bar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice no, member, item name, barcode..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium shadow-sm"
              />
            </div>

            {/* Quick Filter Pill Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold text-[11px] mr-1">Quick:</span>
              
              <button
                type="button"
                onClick={() => {
                  setSelectedDateFilter('ALL');
                  setLedgerDateStart('');
                  setLedgerDateEnd('');
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  selectedDateFilter === 'ALL' && !ledgerDateStart && !ledgerDateEnd
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                All Transactions
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDateFilter(currentDate);
                  setLedgerDateStart('');
                  setLedgerDateEnd('');
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  selectedDateFilter === currentDate || selectedDateFilter === 'TODAY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedDateFilter('DATE_RANGE');
                  if (!ledgerDateStart && !ledgerDateEnd) {
                    setLedgerDateStart(sevenDaysAgoStr);
                    setLedgerDateEnd(todayStr);
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 transition-all ${
                  selectedDateFilter === 'DATE_RANGE' || ledgerDateStart || ledgerDateEnd
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Date Range</span>
              </button>
            </div>

            {/* Dropdown Selectors */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">Date Filter:</span>
                <select
                  value={selectedDateFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedDateFilter(val);
                    if (val === 'DATE_RANGE' && !ledgerDateStart && !ledgerDateEnd) {
                      setLedgerDateStart(sevenDaysAgoStr);
                      setLedgerDateEnd(todayStr);
                    }
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono-code font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">All Transactions (Chronological)</option>
                  <option value="DATE_RANGE">📅 Custom Date Range (From - To)...</option>
                  <option value={currentDate}>
                    {currentDate} (Today - Priority)
                  </option>
                  <option value="YESTERDAY">Yesterday ({yesterdayStr})</option>
                  <option value="LAST_7_DAYS">Last 7 Days</option>
                  <option value="THIS_MONTH">This Month ({thisMonthStr})</option>
                  
                  {datesSet.filter((d) => d !== currentDate).length > 0 && (
                    <optgroup label="Past Business Dates">
                      {datesSet
                        .filter((d) => d !== currentDate)
                        .map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Cashier Filter Dropdown */}
              <select
                value={selectedCashierFilter}
                onChange={(e) => setSelectedCashierFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">All Cashiers</option>
                {cashiers.map((c) => (
                  <option key={c.staffCode} value={c.name}>
                    {c.name} ({c.staffCode})
                  </option>
                ))}
              </select>

              {/* Barcode vs Loose Filter Toggle */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shadow-sm text-xs">
                <button
                  type="button"
                  onClick={() => setBarcodeFilter('ALL')}
                  className={`px-2 py-1 rounded-md font-bold text-[11px] transition-all ${
                    barcodeFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Show all items"
                >
                  All Modes
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeFilter('WITH_BARCODE')}
                  className={`px-2 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all ${
                    barcodeFilter === 'WITH_BARCODE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                  title="Filter to items sold with barcode"
                >
                  <Tag className="w-3 h-3" />
                  <span>Barcode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeFilter('WITHOUT_BARCODE')}
                  className={`px-2 py-1 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all ${
                    barcodeFilter === 'WITHOUT_BARCODE'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                  title="Filter to loose items sold without barcode"
                >
                  <Scale className="w-3 h-3" />
                  <span>Loose</span>
                </button>
              </div>
            </div>
          </div>

          {/* Expanded Custom Date Range Picker */}
          {(selectedDateFilter === 'DATE_RANGE' || ledgerDateStart || ledgerDateEnd) && (
            <div className="flex flex-wrap items-center gap-3 pt-2.5 pb-1 border-t border-slate-200/80 animate-fadeIn">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                Select Custom Date Range:
              </span>

              <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-sm text-xs">
                <span className="text-slate-500 font-bold text-[11px]">FROM:</span>
                <input
                  type="date"
                  value={ledgerDateStart}
                  onChange={(e) => {
                    setLedgerDateStart(e.target.value);
                    setSelectedDateFilter('DATE_RANGE');
                  }}
                  className="bg-transparent border-0 font-mono-code font-bold text-slate-900 focus:outline-none"
                />

                <span className="text-slate-400 font-bold text-[11px] px-1">TO:</span>
                <input
                  type="date"
                  value={ledgerDateEnd}
                  onChange={(e) => {
                    setLedgerDateEnd(e.target.value);
                    setSelectedDateFilter('DATE_RANGE');
                  }}
                  className="bg-transparent border-0 font-mono-code font-bold text-slate-900 focus:outline-none"
                />

                {(ledgerDateStart || ledgerDateEnd) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerDateStart('');
                      setLedgerDateEnd('');
                      setSelectedDateFilter('ALL');
                    }}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 text-xs font-bold ml-1 transition-colors"
                    title="Clear Date Range and return to All Transactions"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Quick Range Presets */}
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setLedgerDateStart(todayStr);
                    setLedgerDateEnd(todayStr);
                    setSelectedDateFilter('DATE_RANGE');
                  }}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold"
                >
                  Today Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerDateStart(sevenDaysAgoStr);
                    setLedgerDateEnd(todayStr);
                    setSelectedDateFilter('DATE_RANGE');
                  }}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold"
                >
                  Past 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerDateStart(`${thisMonthStr}-01`);
                    setLedgerDateEnd(todayStr);
                    setSelectedDateFilter('DATE_RANGE');
                  }}
                  className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold"
                >
                  This Month
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono-code table-auto">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider font-sans text-[10px]">
              <tr>
                <th className="py-2 px-1.5 whitespace-nowrap">Invoice No</th>
                <th className="py-2 px-1.5 whitespace-nowrap">Date / Time</th>
                <th className="py-2 px-1.5">Cashier</th>
                <th className="py-2 px-1.5">Customer / Member</th>
                <th className="py-2 px-1 text-center whitespace-nowrap">Mode</th>
                <th className="py-2 px-1.5">Product Name</th>
                <th className="py-2 px-1.5 text-center whitespace-nowrap">Method</th>
                <th className="py-2 px-1.5 text-right whitespace-nowrap">QTY / UNIT</th>
                <th className="py-2 px-1.5 text-right whitespace-nowrap">Total</th>
                <th className="py-2 px-1 text-center whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.map((row) => {
                const isLoose = row.barcodeMode === 'WITHOUT_BARCODE' || row.barcode === 'WITHOUT_BARCODE' || row.saleType === 'DIRECT_LOOSE';
                const formattedQty = row.quantity % 1 === 0 ? row.quantity : row.quantity.toFixed(3);
                const unitStr = row.unitType || 'KG';

                return (
                  <tr key={row.saleItemId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-1.5 font-bold text-slate-900 whitespace-nowrap">{row.invoiceNo}</td>
                    <td className="py-1.5 px-1.5 text-slate-500 whitespace-nowrap text-[11px]">{row.saleDate}</td>
                    <td className="py-1.5 px-1.5 text-slate-700 font-sans text-[11px] truncate max-w-[85px]" title={row.cashierName}>
                      {row.cashierName || 'Subrata Roy'}
                    </td>
                    <td className="py-1.5 px-1.5 font-sans font-medium text-slate-800 text-[11px] max-w-[105px] truncate" title={row.customerName}>
                      {row.customerName}
                    </td>
                    <td className="py-1.5 px-1 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          row.paymentMode === 'UPI'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {row.paymentMode}
                      </span>
                    </td>
                    <td className="py-1.5 px-1.5 font-sans font-semibold text-slate-900 text-[11px] max-w-[150px] truncate" title={row.productName}>
                      {row.productName}
                    </td>
                    <td className="py-1.5 px-1.5 text-center whitespace-nowrap font-sans">
                      {isLoose ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <Scale className="w-2.5 h-2.5 text-amber-700" />
                          Loose (No Barcode)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <Tag className="w-2.5 h-2.5 text-emerald-700" />
                          With Barcode
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5 text-right whitespace-nowrap font-mono-code">
                      <span className="font-extrabold text-slate-900 text-xs">
                        {formattedQty} / {unitStr}
                      </span>
                      {row.measuredWeightText && isLoose && (
                        <div className="text-[9px] text-amber-700 font-bold">{row.measuredWeightText}</div>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5 text-right font-black text-emerald-800 whitespace-nowrap font-mono-code text-xs">
                      <div>₹{row.lineTotal.toFixed(2)}</div>
                      {Number(row.memberDiscount || 0) > 0 && (
                        <div className="text-[9px] font-bold text-rose-600">
                          Disc: -₹{Number(row.memberDiscount).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleInspectInvoice(row.invoiceNo)}
                        className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900"
                        title="View Invoice Memo"
                      >
                        <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredLedger.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs">
            No transactions match the selected day and cashier filter.
          </div>
        )}
      </div>
    </div>
  );
};
