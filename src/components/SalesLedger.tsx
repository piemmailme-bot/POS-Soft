import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  Eye,
  CheckCircle2,
  TrendingUp,
  Receipt,
  Scale,
  Tag,
  Layers
} from 'lucide-react';
import { SaleTransactionItem, PaymentMode, CompleteInvoice } from '../types';
import { exportLedgerToCsv } from '../utils/csvExporter';

interface SalesLedgerProps {
  ledger: SaleTransactionItem[];
  onViewInvoice: (invoice: CompleteInvoice) => void;
  societyName: string;
}

export const SalesLedger: React.FC<SalesLedgerProps> = ({
  ledger,
  onViewInvoice,
  societyName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [barcodeFilter, setBarcodeFilter] = useState<'ALL' | 'WITH_BARCODE' | 'WITHOUT_BARCODE'>('ALL');

  // Filter items
  const filteredLedger = ledger.filter((row) => {
    const q = (searchQuery || '').toLowerCase();
    const matchesSearch =
      (row.invoiceNo || '').toLowerCase().includes(q) ||
      (row.customerName || '').toLowerCase().includes(q) ||
      (row.productName || '').toLowerCase().includes(q) ||
      (row.barcode || '').includes(q);

    const matchesMode = modeFilter === 'ALL' || row.paymentMode === modeFilter;

    const isWithoutBarcode = row.barcodeMode === 'WITHOUT_BARCODE' || row.barcode === 'WITHOUT_BARCODE';
    let matchesBarcode = true;
    if (barcodeFilter === 'WITH_BARCODE') {
      matchesBarcode = !isWithoutBarcode;
    } else if (barcodeFilter === 'WITHOUT_BARCODE') {
      matchesBarcode = isWithoutBarcode;
    }

    return matchesSearch && matchesMode && matchesBarcode;
  });

  // Calculate metrics
  const totalTurnover = ledger.reduce((sum, item) => sum + item.lineTotal, 0);
  const upiTotal = ledger
    .filter((i) => i.paymentMode === 'UPI')
    .reduce((sum, item) => sum + item.lineTotal, 0);
  const cashTotal = ledger
    .filter((i) => i.paymentMode === 'CASH')
    .reduce((sum, item) => sum + item.lineTotal, 0);

  const barcodeItems = ledger.filter(
    (i) => i.barcodeMode !== 'WITHOUT_BARCODE' && i.barcode !== 'WITHOUT_BARCODE'
  );
  const looseWithoutBarcodeItems = ledger.filter(
    (i) => i.barcodeMode === 'WITHOUT_BARCODE' || i.barcode === 'WITHOUT_BARCODE'
  );

  const barcodeTotal = barcodeItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const looseTotal = looseWithoutBarcodeItems.reduce((sum, i) => sum + i.lineTotal, 0);

  const handleExport = () => {
    exportLedgerToCsv(ledger, societyName);
  };

  // Group ledger items into an invoice when viewing
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
    const rawTotal = rawItemsTotal;
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
      cashier: first.cashierName || 'Subrata Roy (Staff #402)',
      tenderedCash: first.paymentMode === 'CASH' ? (first.tenderedCash && first.tenderedCash >= grandTotal ? first.tenderedCash : grandTotal) : undefined,
      changeDue: first.paymentMode === 'CASH' ? (first.changeDue || 0) : 0,
      upiTxnRef: first.upiTxnRef,
    };

    onViewInvoice(inv);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner with Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Ledger Turnover
          </span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono-code">
            ₹{totalTurnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{ledger.length} line items recorded</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            Online QR / UPI Collections
          </span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono-code">
            ₹{upiTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Direct bank credit</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-amber-600" />
            Barcode vs Direct Loose
          </span>
          <div className="flex items-baseline justify-between mt-1 text-xs font-bold">
            <span className="text-emerald-800">
              🏷️ Barcode: {barcodeItems.length}
            </span>
            <span className="text-amber-900">
              ⚖️ Loose: {looseWithoutBarcodeItems.length}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-mono-code mt-1 pt-1 border-t border-slate-100">
            <span>₹{barcodeTotal.toFixed(2)}</span>
            <span>₹{looseTotal.toFixed(2)}</span>
          </div>
        </div>

      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-lg text-slate-900">
                Sales Transaction Ledger (Stock Output)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks every sale item with distinct classification for <strong className="text-emerald-800">With Barcode</strong> and <strong className="text-amber-800">Without Barcode (Direct Loose Measured)</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-colors flex-1 md:flex-initial justify-center"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV Database</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice no, customer, item, barcode..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Barcode Mode Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setBarcodeFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  barcodeFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({ledger.length})
              </button>
              <button
                type="button"
                onClick={() => setBarcodeFilter('WITH_BARCODE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  barcodeFilter === 'WITH_BARCODE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>With Barcode ({barcodeItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setBarcodeFilter('WITHOUT_BARCODE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  barcodeFilter === 'WITHOUT_BARCODE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Scale className="w-3 h-3" />
                <span>Without Barcode ({looseWithoutBarcodeItems.length})</span>
              </button>
            </div>

            {/* Payment Mode Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
              {['ALL', 'UPI', 'CASH'].map((m) => (
                <button
                  key={m}
                  onClick={() => setModeFilter(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    modeFilter === m
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m === 'ALL' ? 'All Modes' : m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono-code">
            <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider font-sans">
              <tr>
                <th className="py-2.5 px-2">Item ID</th>
                <th className="py-2.5 px-2 whitespace-nowrap">Invoice No</th>
                <th className="py-2.5 px-2 whitespace-nowrap">Date / Time</th>
                <th className="py-2.5 px-2">Member / Customer</th>
                <th className="py-2.5 px-1 text-center whitespace-nowrap">Mode</th>
                <th className="py-2.5 px-2">Product Name</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">Method / Barcode</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">QTY / UNIT</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">Price</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">Line Total</th>
                <th className="py-2.5 px-1 text-center whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.map((row) => {
                const isLoose = row.barcodeMode === 'WITHOUT_BARCODE' || row.barcode === 'WITHOUT_BARCODE' || row.saleType === 'DIRECT_LOOSE';
                const formattedQty = row.quantity % 1 === 0 ? row.quantity : row.quantity.toFixed(3);
                const unitStr = row.unitType || 'KG';

                return (
                  <tr key={row.saleItemId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-2 text-slate-500 font-mono-code text-[11px]">{row.saleItemId}</td>
                    <td className="py-2 px-2 font-bold text-slate-900 whitespace-nowrap">{row.invoiceNo}</td>
                    <td className="py-2 px-2 text-slate-500 whitespace-nowrap text-[11px]">{row.saleDate}</td>
                    <td className="py-2 px-2 font-sans font-medium text-slate-800 text-[11px] max-w-[150px] truncate" title={row.customerName}>
                      {row.customerName}
                    </td>
                    <td className="py-2 px-1 text-center whitespace-nowrap">
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
                    <td className="py-2 px-2 font-sans font-semibold text-slate-900 text-[11px] max-w-[160px] truncate" title={row.productName}>
                      {row.productName}
                    </td>
                    <td className="py-2 px-2 text-center font-sans whitespace-nowrap">
                      {isLoose ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            <Scale className="w-2.5 h-2.5 text-amber-700" />
                            Loose (No Barcode)
                          </span>
                          {row.measuredWeightText && (
                            <span className="text-[9px] text-amber-800 font-mono-code font-bold mt-0.5">
                              {row.measuredWeightText}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Tag className="w-2.5 h-2.5 text-emerald-700" />
                            With Barcode
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono-code mt-0.5 truncate max-w-[110px]">
                            #{row.barcode}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-code whitespace-nowrap">
                      <span className="font-extrabold text-slate-900 text-xs">
                        {formattedQty} / {unitStr}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600 font-mono-code whitespace-nowrap">
                      ₹{row.sellingPrice.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-extrabold text-emerald-800 font-mono-code whitespace-nowrap">
                      ₹{row.lineTotal.toFixed(2)}
                    </td>
                    <td className="py-2 px-1 text-center whitespace-nowrap">
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
          <div className="p-8 text-center text-slate-400 text-xs">
            No transactions match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
