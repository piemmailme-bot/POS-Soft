import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Calendar,
  Filter,
  Eye,
  Download,
  CreditCard,
  Banknote,
  QrCode,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Clock,
  User,
  Hash,
  RefreshCw
} from 'lucide-react';
import { SaleTransactionItem, CompleteInvoice, CashierUser } from '../types';
import { exportLedgerToCsv } from '../utils/csvExporter';
import { authFetch } from '../utils/api';

interface InvoiceManagerProps {
  ledger: SaleTransactionItem[];
  onViewInvoice: (invoice: CompleteInvoice) => void;
  societyName: string;
  onRefreshData?: () => Promise<void> | void;
}

export const InvoiceManager: React.FC<InvoiceManagerProps> = ({
  ledger,
  onViewInvoice,
  societyName,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshData) {
        await onRefreshData();
      } else {
        await authFetch('/api/supabase/refresh', { cache: 'no-store' });
      }
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Group ledger items by invoiceNo
  const groupedInvoices = useMemo(() => {
    const map = new Map<string, SaleTransactionItem[]>();
    ledger.forEach((item) => {
      if (!item.invoiceNo) return;
      const items = map.get(item.invoiceNo) || [];
      items.push(item);
      map.set(item.invoiceNo, items);
    });

    return Array.from(map.values()).map((items) => {
      const first = items[0];
      const rawItemsTotal = Number(items.reduce((sum, i) => sum + (i.lineTotal || 0), 0).toFixed(2));
      const totalGst = Number(items.reduce((sum, i) => sum + (i.totalGstAmount || 0), 0).toFixed(2));
      const totalCgst = Number(items.reduce((sum, i) => sum + (i.cgstAmount || (i.totalGstAmount ? i.totalGstAmount / 2 : 0)), 0).toFixed(2));
      const totalSgst = Number(items.reduce((sum, i) => sum + (i.sgstAmount || (i.totalGstAmount ? i.totalGstAmount / 2 : 0)), 0).toFixed(2));
      const rawBaseSum = items.reduce(
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

      // Handle both line-item totals (raw unrounded sum) and single-row fallback totals (already rounded)
      const isAlreadyRoundedSingleRow =
        items.length === 1 &&
        expectedRawFromParts > 0 &&
        rawItemsTotal > expectedRawFromParts &&
        rawItemsTotal === Math.ceil(expectedRawFromParts);

      const rawTotal = isAlreadyRoundedSingleRow ? expectedRawFromParts : rawItemsTotal;
      const grandTotal = Math.ceil(rawTotal);
      const roundOff = Number((grandTotal - rawTotal).toFixed(2));
      const discountAmt = Number(items.reduce((sum, i) => sum + (Number(i.memberDiscount) || 0), 0).toFixed(2));

      return {
        invoiceNo: first.invoiceNo || 'N/A',
        saleId: first.saleId,
        saleDate: first.saleDate || '',
        customerName: first.customerName || 'Walk-in Customer',
        paymentMode: (first.paymentMode || 'CASH').toUpperCase(),
        cashierName: first.cashierName || 'Subrata Roy',
        rawTotal,
        roundOff,
        discountAmt,
        totalAmount: grandTotal,
        baseTotal,
        totalGst,
        totalCgst,
        totalSgst,
        tenderedCash: first.tenderedCash,
        changeDue: first.changeDue,
        upiTxnRef: first.upiTxnRef,
        itemCount: items.length,
        items: items
      };
    }).sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo));
  }, [ledger]);

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    return groupedInvoices.filter((inv) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.cashierName.toLowerCase().includes(q);
      
      const matchesMode = modeFilter === 'ALL' || inv.paymentMode === modeFilter.toUpperCase();
      const matchesDate = !dateFilter || inv.saleDate.startsWith(dateFilter);

      return matchesSearch && matchesMode && matchesDate;
    });
  }, [groupedInvoices, searchQuery, modeFilter, dateFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const total = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const count = filteredInvoices.length;
    const upi = filteredInvoices.filter(i => i.paymentMode === 'UPI').reduce((sum, i) => sum + i.totalAmount, 0);
    const cash = filteredInvoices.filter(i => i.paymentMode === 'CASH').reduce((sum, i) => sum + i.totalAmount, 0);
    const baseTotal = filteredInvoices.reduce((sum, inv) => sum + inv.baseTotal, 0);
    const gstTotal = filteredInvoices.reduce((sum, inv) => sum + inv.totalGst, 0);
    const cgstTotal = filteredInvoices.reduce((sum, inv) => sum + inv.totalCgst, 0);
    const sgstTotal = filteredInvoices.reduce((sum, inv) => sum + inv.totalSgst, 0);
    const roundOffTotal = Number(filteredInvoices.reduce((sum, inv) => sum + inv.roundOff, 0).toFixed(2));
    const discountTotal = Number(filteredInvoices.reduce((sum, inv) => sum + inv.discountAmt, 0).toFixed(2));
    return { total, count, upi, cash, baseTotal, gstTotal, cgstTotal, sgstTotal, roundOffTotal, discountTotal };
  }, [filteredInvoices]);

  const handleInspect = (invData: any) => {
    const tendered =
      invData.paymentMode === 'CASH'
        ? (invData.tenderedCash && invData.tenderedCash >= invData.totalAmount
            ? invData.tenderedCash
            : invData.totalAmount)
        : undefined;
    const change =
      invData.paymentMode === 'CASH'
        ? (invData.changeDue !== undefined && tendered !== undefined
            ? Math.max(0, Number((tendered - invData.totalAmount).toFixed(2)))
            : 0)
        : 0;

    const inv: CompleteInvoice = {
      saleId: invData.saleId,
      invoiceNo: invData.invoiceNo,
      saleDate: invData.saleDate,
      customerName: invData.customerName,
      paymentMode: invData.paymentMode,
      items: invData.items.map((r: any) => ({
        productId: r.productId,
        productName: r.productName,
        barcode: r.barcode,
        quantity: r.quantity,
        unitType: r.unitType,
        purchasePrice: r.costPrice,
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
        sellingPrice: r.sellingPrice,
        lineTotal: r.lineTotal,
      })),
      baseAmount: invData.baseTotal,
      totalGst: invData.totalGst,
      cgstAmount: invData.totalCgst,
      sgstAmount: invData.totalSgst,
      roundOff: invData.roundOff,
      subtotal: invData.rawTotal,
      discount: invData.discountAmt || 0,
      memberDiscount: invData.discountAmt || 0,
      grandTotal: invData.totalAmount,
      cashier: invData.cashierName,
      tenderedCash: tendered,
      changeDue: change,
      upiTxnRef: invData.upiTxnRef,
    };
    onViewInvoice(inv);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Platform Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">Invoice Analytics Hub</h2>
                <p className="text-sm text-slate-400 mt-0.5">Individual transaction summary & cloud persistent invoice archive</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button 
               onClick={handleRefresh}
               disabled={isRefreshing}
               className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all whitespace-nowrap shrink-0 cursor-pointer"
             >
               <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
               <span>{isRefreshing ? 'Refreshing...' : 'Refresh Cloud Data'}</span>
             </button>
             <button 
               onClick={() => exportLedgerToCsv(ledger, societyName)}
               className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
             >
               <Download className="w-4 h-4" />
               Export All Data
             </button>
          </div>
        </div>

        {/* Metrics Bar with CGST, SGST, Base, Discounts & Round Off breakdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mt-8 pt-6 border-t border-slate-800/50">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Turnover (Rounded)</span>
            <div className="text-xl font-black text-white font-mono-code">₹{metrics.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Base (Excl. GST)</span>
            <div className="text-xl font-black text-slate-200 font-mono-code">₹{metrics.baseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest block">CGST Collected</span>
            <div className="text-xl font-black text-cyan-300 font-mono-code">₹{metrics.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block">SGST Collected</span>
            <div className="text-xl font-black text-teal-300 font-mono-code">₹{metrics.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block">Total GST Charge</span>
            <div className="text-xl font-black text-emerald-400 font-mono-code">₹{metrics.gstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-widest block">Discounts Allowed</span>
            <div className="text-xl font-black text-rose-300 font-mono-code">-₹{metrics.discountTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">Round Off Adj.</span>
            <div className="text-xl font-black text-amber-300 font-mono-code">+₹{metrics.roundOffTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest block">Invoices</span>
            <div className="text-xl font-black text-blue-400 font-mono-code">{metrics.count} <span className="text-[10px] text-slate-500 font-sans font-medium uppercase">Memos</span></div>
          </div>
        </div>
      </div>

      {/* Filters Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search by Invoice No, Customer Name or Cashier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none"
            />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="text-slate-400 hover:text-rose-500">✕</button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shrink-0">
            {['ALL', 'UPI', 'CASH'].map(m => (
              <button
                key={m}
                onClick={() => setModeFilter(m)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${modeFilter === m ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Invoice Details</th>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Customer / Member</th>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Payment Mode</th>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest">Cashier</th>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-right">Invoice Total</th>
                <th className="py-4 px-6 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((inv) => (
                <tr key={inv.invoiceNo} className="group hover:bg-blue-50/30 transition-all duration-200">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${inv.paymentMode === 'UPI' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                        <Hash className="w-5 h-5 opacity-60" />
                      </div>
                      <div>
                        <div className="font-black text-slate-900 text-sm group-hover:text-blue-600 transition-colors">#{inv.invoiceNo}</div>
                        <div className="text-[11px] text-slate-500 font-medium truncate max-w-[220px]" title={inv.items.map(i => `${i.productName} (${i.quantity} ${i.unitType})`).join(', ')}>
                          {inv.items.map(i => i.productName).join(', ')}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-500 font-mono-code">{inv.saleDate}</span>
                          <span className="text-slate-300 mx-1">|</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{inv.itemCount} Items</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="text-sm font-bold text-slate-700">{inv.customerName}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black border tracking-wider ${
                      inv.paymentMode === 'UPI' 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {inv.paymentMode === 'UPI' ? <QrCode className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                      {inv.paymentMode}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-xs font-bold text-slate-600">{inv.cashierName}</div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="text-base font-black text-slate-900 font-mono-code">₹{inv.totalAmount.toFixed(2)}</div>
                    <div className="text-[10px] font-mono-code text-slate-500 mt-0.5 whitespace-nowrap">
                      Base: ₹{inv.baseTotal.toFixed(2)}
                      {inv.totalGst > 0 && (
                        <span className="text-emerald-700 ml-1">
                          + GST ₹{inv.totalGst.toFixed(2)} (C: ₹{inv.totalCgst.toFixed(2)}, S: ₹{inv.totalSgst.toFixed(2)})
                        </span>
                      )}
                    </div>
                    {inv.discountAmt > 0 && (
                      <div className="text-[10px] font-mono-code text-rose-600 font-bold mt-0.5 whitespace-nowrap">
                        Bill Discount Allowed: -₹{inv.discountAmt.toFixed(2)}
                      </div>
                    )}
                    {inv.roundOff !== 0 && (
                      <div className="text-[10px] font-mono-code text-amber-700 font-bold mt-0.5 whitespace-nowrap">
                        + Round Off Adjustment: {inv.roundOff > 0 ? `+₹${inv.roundOff.toFixed(2)}` : `-₹${Math.abs(inv.roundOff).toFixed(2)}`}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button 
                      onClick={() => handleInspect(inv)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredInvoices.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto border border-slate-100">
               <Search className="w-10 h-10 text-slate-200" />
            </div>
            <div className="space-y-1">
              <h3 className="text-slate-900 font-black">No Invoices Found</h3>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">Try adjusting your search or filters to find specific transaction records.</p>
            </div>
            <button 
              onClick={() => {setSearchQuery(''); setModeFilter('ALL'); setDateFilter('');}}
              className="text-xs font-black text-blue-600 hover:underline underline-offset-4"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
