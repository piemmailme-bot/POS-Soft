import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Eye,
  ShieldCheck,
  RotateCcw,
  FileSpreadsheet,
  BookOpen,
  Plus,
  X,
  Landmark,
  Trash2,
} from 'lucide-react';
import {
  Product,
  SaleTransactionItem,
  PurchaseTransaction,
  SocietyProfile,
  CompleteInvoice,
  GstGovtPayment,
  ReturnNote,
  AdminStoreSettings,
} from '../types';
import { exportGstAnalysisToCsv, GstSlabSummaryExportRow } from '../utils/csvExporter';
import { getIstDateStr, getIstMonthRange } from '../utils/dateUtils';

interface GstAnalysisManagerProps {
  products: Product[];
  ledger: SaleTransactionItem[];
  purchaseTransactions: PurchaseTransaction[];
  gstPayments?: GstGovtPayment[];
  returnNotes?: ReturnNote[];
  adminSettings?: AdminStoreSettings;
  onUpdateAdminSettings?: (next: AdminStoreSettings) => Promise<void> | void;
  society: SocietyProfile;
  onViewInvoice?: (invoice: CompleteInvoice) => void;
  onRefreshData?: () => Promise<void> | void;
  onAddGstPayment?: (
    payment: Omit<GstGovtPayment, 'id' | 'performedBy'>
  ) => Promise<boolean>;
  onDeleteGstPayment?: (id: string) => Promise<boolean>;
}

const r2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));

const extractDatePart = (dateStr?: string): string => {
  if (!dateStr) return '';
  return String(dateStr).trim().slice(0, 10);
};

export const GstAnalysisManager: React.FC<GstAnalysisManagerProps> = ({
  products,
  ledger,
  purchaseTransactions,
  gstPayments = [],
  returnNotes = [],
  adminSettings,
  onUpdateAdminSettings,
  society,
  onViewInvoice,
  onRefreshData,
  onAddGstPayment,
  onDeleteGstPayment,
}) => {
  const todayStr = getIstDateStr();
  const thisMonthStartStr = `${todayStr.slice(0, 7)}-01`;

  const lastMonthBounds = useMemo(() => getIstMonthRange(-1), []);

  const [periodPreset, setPeriodPreset] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'TODAY' | 'ALL' | 'CUSTOM'>('ALL');
  const [customStart, setCustomStart] = useState<string>(thisMonthStartStr);
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [activeSubTab, setActiveSubTab] = useState<
    'gstr3b' | 'hsn_b2b' | 'output_sales' | 'input_purchases' | 'product_wise' | 'govt_payments'
  >('gstr3b');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Record Govt GST Payment Modal State (closes ONLY via Close / Cancel / Save)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [challanRef, setChallanRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [returnPeriod, setReturnPeriod] = useState(todayStr.slice(0, 7));
  const [quickTotalTax, setQuickTotalTax] = useState('');
  const [cgstInput, setCgstInput] = useState('');
  const [sgstInput, setSgstInput] = useState('');
  const [feeInput, setFeeInput] = useState('0');
  const [paymentSource, setPaymentSource] = useState<'BANK_UPI' | 'CASH'>('BANK_UPI');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Electronic Credit Ledger Opening ITC Balance (stored exclusively in Supabase admin_settings table)
  const [openingCgstItc, setOpeningCgstItc] = useState<number>(() =>
    Math.max(0, Number(adminSettings?.openingCgstItc) || 0)
  );

  const [openingSgstItc, setOpeningSgstItc] = useState<number>(() =>
    Math.max(0, Number(adminSettings?.openingSgstItc) || 0)
  );

  useEffect(() => {
    setOpeningCgstItc(Math.max(0, Number(adminSettings?.openingCgstItc) || 0));
    setOpeningSgstItc(Math.max(0, Number(adminSettings?.openingSgstItc) || 0));
  }, [adminSettings?.openingCgstItc, adminSettings?.openingSgstItc]);

  const handleOpeningCgstChange = (val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setOpeningCgstItc(num);
    if (adminSettings && onUpdateAdminSettings) {
      onUpdateAdminSettings({ ...adminSettings, openingCgstItc: num });
    }
  };

  const handleOpeningSgstChange = (val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setOpeningSgstItc(num);
    if (adminSettings && onUpdateAdminSettings) {
      onUpdateAdminSettings({ ...adminSettings, openingSgstItc: num });
    }
  };

  const handleResetOpeningItc = () => {
    setOpeningCgstItc(0);
    setOpeningSgstItc(0);
    if (adminSettings && onUpdateAdminSettings) {
      onUpdateAdminSettings({ ...adminSettings, openingCgstItc: 0, openingSgstItc: 0 });
    }
  };

  const handleRefreshLive = async () => {
    if (!onRefreshData || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Compute effective date window
  const { effectiveStart, effectiveEnd, periodLabel } = useMemo(() => {
    if (periodPreset === 'TODAY') {
      return { effectiveStart: todayStr, effectiveEnd: todayStr, periodLabel: `Day: ${todayStr}` };
    }
    if (periodPreset === 'THIS_MONTH') {
      return {
        effectiveStart: thisMonthStartStr,
        effectiveEnd: todayStr,
        periodLabel: `This Month (${thisMonthStartStr} to ${todayStr})`,
      };
    }
    if (periodPreset === 'LAST_MONTH') {
      return {
        effectiveStart: lastMonthBounds.start,
        effectiveEnd: lastMonthBounds.end,
        periodLabel: `Last Month (${lastMonthBounds.start} to ${lastMonthBounds.end})`,
      };
    }
    if (periodPreset === 'CUSTOM') {
      return {
        effectiveStart: customStart,
        effectiveEnd: customEnd,
        periodLabel: `${customStart || 'Start'} to ${customEnd || 'End'}`,
      };
    }
    return { effectiveStart: '', effectiveEnd: '', periodLabel: 'All Recorded Dates (Cumulative)' };
  }, [periodPreset, todayStr, thisMonthStartStr, lastMonthBounds, customStart, customEnd]);

  const productMap = useMemo(() => {
    return new Map<number, Product>(products.map((p) => [p.id, p]));
  }, [products]);

  const activeLedger = useMemo(() => {
    if (products.length === 0) return ledger;
    return ledger.filter((item) => productMap.has(item.productId));
  }, [ledger, products.length, productMap]);

  const activePurchases = useMemo(() => {
    if (products.length === 0) return purchaseTransactions;
    return purchaseTransactions.filter((tx) => productMap.has(tx.productId));
  }, [purchaseTransactions, products.length, productMap]);

  // Filter ledger rows, purchases, and Govt GST payments by period
  const periodLedgerItems = useMemo(() => {
    return activeLedger.filter((item) => {
      const d = extractDatePart(item.saleDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [activeLedger, effectiveStart, effectiveEnd]);

  const periodPurchases = useMemo(() => {
    return activePurchases.filter((tx) => {
      const d = extractDatePart(tx.purchaseDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [activePurchases, effectiveStart, effectiveEnd]);

  const periodGovtPayments = useMemo(() => {
    return gstPayments
      .filter((gp) => {
        const d = extractDatePart(gp.paymentDate);
        if (!d) return false;
        if (effectiveStart && d < effectiveStart) return false;
        if (effectiveEnd && d > effectiveEnd) return false;
        return true;
      })
      .sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
  }, [gstPayments, effectiveStart, effectiveEnd]);

  const periodReturnNotes = useMemo(() => {
    return returnNotes.filter((rn) => {
      const d = extractDatePart(rn.noteDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [returnNotes, effectiveStart, effectiveEnd]);

  // Group Output Sales by Invoice (matching Invoice Analytics & Balance Sheet)
  const periodInvoices = useMemo(() => {
    const map = new Map<string, SaleTransactionItem[]>();
    periodLedgerItems.forEach((item) => {
      if (!item.invoiceNo) return;
      const list = map.get(item.invoiceNo) || [];
      list.push(item);
      map.set(item.invoiceNo, list);
    });

    return Array.from(map.values())
      .map((items) => {
        const first = items[0];
        const dateOnly = extractDatePart(first.saleDate);
        const rawItemsTotal = r2(items.reduce((sum, i) => sum + (Number(i.lineTotal) || 0), 0));
        const totalGst = r2(items.reduce((sum, i) => sum + (Number(i.totalGstAmount) || 0), 0));
        const halfInvoiceGst = r2(
          items.reduce((sum, i) => sum + r2((Number(i.totalGstAmount) || 0) / 2), 0)
        );
        const totalCgst = halfInvoiceGst;
        const totalSgst = halfInvoiceGst;

        const rawBaseSum = items.reduce(
          (sum, i) =>
            sum +
            (i.baseAmount !== undefined
              ? Number(i.baseAmount)
              : i.sellingPriceWD !== undefined
              ? Number(i.sellingPriceWD) * Number(i.quantity || 0)
              : Number(i.lineTotal || 0)),
          0
        );
        const baseTotal = r2(rawBaseSum > 0 ? rawBaseSum : Math.max(0, rawItemsTotal - totalGst));
        const expectedRawFromParts = r2(baseTotal + totalGst);

        const isAlreadyRoundedSingleRow =
          items.length === 1 &&
          expectedRawFromParts > 0 &&
          rawItemsTotal > expectedRawFromParts &&
          rawItemsTotal === Math.ceil(expectedRawFromParts);

        const rawTotal = isAlreadyRoundedSingleRow ? expectedRawFromParts : rawItemsTotal;
        const grandTotal = Math.ceil(rawTotal);
        const roundOff = r2(grandTotal - rawTotal);

        const ratesSet = new Set<number>();
        items.forEach((i) => {
          const prod = productMap.get(i.productId);
          const rate =
            i.gstPercent !== undefined && i.gstPercent !== null && Number.isFinite(Number(i.gstPercent))
              ? Number(i.gstPercent)
              : Number(prod?.gstPercent || 0);
          ratesSet.add(rate);
        });

        return {
          saleId: first.saleId,
          invoiceNo: first.invoiceNo,
          saleDate: first.saleDate,
          dateOnly,
          customerName: first.customerName || 'Walk-in Customer',
          buyerGstin: first.buyerGstin || '',
          paymentMode: first.paymentMode || 'CASH',
          cashierName: first.cashierName || 'Society Administrator',
          items,
          gstRatesLabel: Array.from(ratesSet)
            .sort((a, b) => a - b)
            .map((r) => `${r}%`)
            .join(', '),
          baseTotal,
          totalCgst,
          totalSgst,
          totalGst,
          roundOff,
          discountAmt: r2(items.reduce((sum, i) => sum + (Number(i.memberDiscount) || 0), 0)),
          grandTotal,
        };
      })
      .sort((a, b) => String(b.saleDate || '').localeCompare(String(a.saleDate || '')));
  }, [periodLedgerItems, productMap]);

  // Core GSTR-3B Section 49(5) Indian GST Compliance Engine + Challan PMT-06 Payments + Credit/Debit Notes
  const gstSummary = useMemo(() => {
    const creditNoteHalfGst = r2(
      periodReturnNotes
        .filter((rn) => rn.noteType === 'CREDIT_NOTE')
        .reduce((s, rn) => s + r2(Number(rn.totalGstAmount || 0) / 2), 0)
    );
    const creditNoteCgst = creditNoteHalfGst;
    const creditNoteSgst = creditNoteHalfGst;
    const debitNoteHalfGst = r2(
      periodReturnNotes
        .filter((rn) => rn.noteType === 'DEBIT_NOTE')
        .reduce((s, rn) => s + r2(Number(rn.totalGstAmount || 0) / 2), 0)
    );
    const debitNoteCgst = debitNoteHalfGst;
    const debitNoteSgst = debitNoteHalfGst;

    const outputCgst = r2(Math.max(0, periodInvoices.reduce((s, inv) => s + inv.totalCgst, 0) - creditNoteCgst));
    const outputSgst = r2(Math.max(0, periodInvoices.reduce((s, inv) => s + inv.totalSgst, 0) - creditNoteSgst));
    const outputTotal = r2(outputCgst + outputSgst);
    const salesTaxableBase = r2(
      periodLedgerItems.reduce((s, it) => {
        const prod = productMap.get(it.productId);
        const rate =
          it.gstPercent !== undefined && it.gstPercent !== null && Number.isFinite(Number(it.gstPercent))
            ? Number(it.gstPercent)
            : Number(prod?.gstPercent || 0);
        const gst = Number(it.totalGstAmount || 0);
        const base =
          it.baseAmount !== undefined
            ? Number(it.baseAmount)
            : it.sellingPriceWD !== undefined
            ? Number(it.sellingPriceWD) * Number(it.quantity || 0)
            : Math.max(0, Number(it.lineTotal || 0) - gst);
        return rate > 0 ? s + base : s;
      }, 0)
    );
    const salesExemptBase = r2(
      periodLedgerItems.reduce((s, it) => {
        const prod = productMap.get(it.productId);
        const rate =
          it.gstPercent !== undefined && it.gstPercent !== null && Number.isFinite(Number(it.gstPercent))
            ? Number(it.gstPercent)
            : Number(prod?.gstPercent || 0);
        const gst = Number(it.totalGstAmount || 0);
        const base =
          it.baseAmount !== undefined
            ? Number(it.baseAmount)
            : it.sellingPriceWD !== undefined
            ? Number(it.sellingPriceWD) * Number(it.quantity || 0)
            : Math.max(0, Number(it.lineTotal || 0) - gst);
        return rate === 0 ? s + base : s;
      }, 0)
    );
    const totalSalesGross = r2(periodInvoices.reduce((s, inv) => s + inv.grandTotal, 0));

    const periodInputHalfGst = r2(
      periodPurchases.reduce((s, tx) => s + r2(Number(tx.totalGstAmount || 0) / 2), 0)
    );
    const periodInputCgst = r2(Math.max(0, periodInputHalfGst - debitNoteCgst));
    const periodInputSgst = r2(Math.max(0, periodInputHalfGst - debitNoteSgst));
    const periodInputTotal = r2(periodInputCgst + periodInputSgst);
    const purchaseTaxableBase = r2(
      periodPurchases.reduce((s, tx) => {
        const txGst = Number(tx.totalGstAmount || 0);
        const txBase =
          Number(tx.baseAmount || 0) > 0
            ? Number(tx.baseAmount || 0)
            : Math.max(0, Number(tx.totalAmount || 0) - txGst);
        return s + txBase;
      }, 0)
    );
    const totalPurchaseInclGst = r2(
      periodPurchases.reduce((s, tx) => s + Number(tx.totalAmount || 0), 0)
    );

    // Section 49(5) CGST Act 2017: CGST ITC offsets ONLY Output CGST; SGST ITC offsets ONLY Output SGST
    const availableCgstItc = r2(openingCgstItc + periodInputCgst);
    const availableSgstItc = r2(openingSgstItc + periodInputSgst);

    const utilizedCgstItc = r2(Math.min(outputCgst, availableCgstItc));
    const utilizedSgstItc = r2(Math.min(outputSgst, availableSgstItc));

    const netPayableCgstCash = r2(Math.max(0, outputCgst - utilizedCgstItc));
    const netPayableSgstCash = r2(Math.max(0, outputSgst - utilizedSgstItc));
    const netPayableTotalCash = r2(netPayableCgstCash + netPayableSgstCash);

    // Actual Cash/Bank Payments made to Government via Challan PMT-06
    const govtCgstPaid = r2(periodGovtPayments.reduce((s, gp) => s + Number(gp.cgstPaid || 0), 0));
    const govtSgstPaid = r2(periodGovtPayments.reduce((s, gp) => s + Number(gp.sgstPaid || 0), 0));
    const govtFeePaid = r2(periodGovtPayments.reduce((s, gp) => s + Number(gp.interestOrFee || 0), 0));
    const govtTaxPaidTotal = r2(govtCgstPaid + govtSgstPaid);
    const govtTotalPaid = r2(
      periodGovtPayments.reduce((s, gp) => s + Number(gp.totalPaid || 0), 0)
    );

    const remainingPayableCgst = r2(Math.max(0, netPayableCgstCash - govtCgstPaid));
    const remainingPayableSgst = r2(Math.max(0, netPayableSgstCash - govtSgstPaid));
    const remainingPayableTotal = r2(remainingPayableCgst + remainingPayableSgst);
    const excessGovtCashPaid = r2(
      Math.max(0, govtCgstPaid - netPayableCgstCash) +
        Math.max(0, govtSgstPaid - netPayableSgstCash)
    );

    const closingCgstItc = r2(Math.max(0, availableCgstItc - utilizedCgstItc));
    const closingSgstItc = r2(Math.max(0, availableSgstItc - utilizedSgstItc));
    const closingTotalItc = r2(closingCgstItc + closingSgstItc);

    // Slab breakdown (0%, 5%, 12%, 18%, 28%, plus any custom rates present)
    const slabMap = new Map<number, GstSlabSummaryExportRow>();
    const standardSlabs = [0, 5, 12, 18, 28];
    standardSlabs.forEach((rate) => {
      slabMap.set(rate, {
        gstRate: rate,
        salesTaxableBase: 0,
        outputCgst: 0,
        outputSgst: 0,
        outputTotalGst: 0,
        purchaseTaxableBase: 0,
        inputCgst: 0,
        inputSgst: 0,
        inputTotalGst: 0,
      });
    });

    const getSlab = (rate: number): GstSlabSummaryExportRow => {
      const normalized = Number.isFinite(rate) ? Number(rate) : 0;
      const existing = slabMap.get(normalized);
      if (existing) return existing;
      const created: GstSlabSummaryExportRow = {
        gstRate: normalized,
        salesTaxableBase: 0,
        outputCgst: 0,
        outputSgst: 0,
        outputTotalGst: 0,
        purchaseTaxableBase: 0,
        inputCgst: 0,
        inputSgst: 0,
        inputTotalGst: 0,
      };
      slabMap.set(normalized, created);
      return created;
    };

    periodLedgerItems.forEach((it) => {
      const prod = productMap.get(it.productId);
      const rate =
        it.gstPercent !== undefined && it.gstPercent !== null && Number.isFinite(Number(it.gstPercent))
          ? Number(it.gstPercent)
          : Number(prod?.gstPercent || 0);
      const gst = Number(it.totalGstAmount || 0);
      const cgst = it.cgstAmount !== undefined ? Number(it.cgstAmount) : gst / 2;
      const sgst = it.sgstAmount !== undefined ? Number(it.sgstAmount) : gst / 2;
      const base =
        it.baseAmount !== undefined
          ? Number(it.baseAmount)
          : it.sellingPriceWD !== undefined
          ? Number(it.sellingPriceWD) * Number(it.quantity || 0)
          : Math.max(0, Number(it.lineTotal || 0) - gst);

      const slab = getSlab(rate);
      slab.salesTaxableBase = r2(slab.salesTaxableBase + base);
      slab.outputCgst = r2(slab.outputCgst + cgst);
      slab.outputSgst = r2(slab.outputSgst + sgst);
      slab.outputTotalGst = r2(slab.outputTotalGst + gst);
    });

    periodPurchases.forEach((tx) => {
      const prod = productMap.get(tx.productId);
      const rate =
        tx.gstPercent !== undefined && tx.gstPercent !== null && Number.isFinite(Number(tx.gstPercent))
          ? Number(tx.gstPercent)
          : Number(prod?.gstPercent || 0);
      const gst = Number(tx.totalGstAmount || 0);
      const cgst = tx.cgstAmount !== undefined ? Number(tx.cgstAmount) : gst / 2;
      const sgst = tx.sgstAmount !== undefined ? Number(tx.sgstAmount) : gst / 2;
      const base =
        Number(tx.baseAmount || 0) > 0
          ? Number(tx.baseAmount || 0)
          : Math.max(0, Number(tx.totalAmount || 0) - gst);

      const slab = getSlab(rate);
      slab.purchaseTaxableBase = r2(slab.purchaseTaxableBase + base);
      slab.inputCgst = r2(slab.inputCgst + cgst);
      slab.inputSgst = r2(slab.inputSgst + sgst);
      slab.inputTotalGst = r2(slab.inputTotalGst + gst);
    });

    const slabRows = Array.from(slabMap.values()).sort((a, b) => a.gstRate - b.gstRate);

    return {
      outputCgst,
      outputSgst,
      outputTotal,
      salesTaxableBase,
      salesExemptBase,
      totalSalesGross,
      periodInputCgst,
      periodInputSgst,
      periodInputTotal,
      purchaseTaxableBase,
      totalPurchaseInclGst,
      availableCgstItc,
      availableSgstItc,
      utilizedCgstItc,
      utilizedSgstItc,
      netPayableCgstCash,
      netPayableSgstCash,
      netPayableTotalCash,
      govtCgstPaid,
      govtSgstPaid,
      govtFeePaid,
      govtTaxPaidTotal,
      govtTotalPaid,
      remainingPayableCgst,
      remainingPayableSgst,
      remainingPayableTotal,
      excessGovtCashPaid,
      closingCgstItc,
      closingSgstItc,
      closingTotalItc,
      slabRows,
    };
  }, [
    periodInvoices,
    periodLedgerItems,
    periodPurchases,
    periodGovtPayments,
    periodReturnNotes,
    productMap,
    openingCgstItc,
    openingSgstItc,
  ]);

  // GSTR-1 Table 12 HSN-wise Outward Supplies & B2B vs B2C Summary
  const hsnSummaryRows = useMemo(() => {
    const map = new Map<
      string,
      {
        hsnCode: string;
        description: string;
        uqc: string;
        gstRate: number;
        totalQty: number;
        taxableValue: number;
        cgstAmount: number;
        sgstAmount: number;
        totalTax: number;
        totalValue: number;
      }
    >();

    periodLedgerItems.forEach((it) => {
      const prod = productMap.get(it.productId);
      const hsn =
        it.hsnCode ||
        prod?.hsnCode ||
        ((prod?.category || '').toLowerCase().includes('pesti') ? '3808' : '3105');
      const uqc = it.unitType || prod?.unit || 'PCS';
      const rate =
        it.gstPercent !== undefined && it.gstPercent !== null && Number.isFinite(Number(it.gstPercent))
          ? Number(it.gstPercent)
          : Number(prod?.gstPercent || 0);
      const key = `${hsn}|${uqc}|${rate}`;
      const existing = map.get(key) || {
        hsnCode: hsn,
        description:
          hsn === '3808'
            ? 'Insecticides, Fungicides, Herbicides & Agro Pesticides'
            : hsn === '3105' || hsn.startsWith('31')
            ? 'Mineral or Chemical Fertilizers (NPK / Urea / Bio)'
            : prod?.category || 'Agricultural Store Goods',
        uqc,
        gstRate: rate,
        totalQty: 0,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        totalTax: 0,
        totalValue: 0,
      };

      const gst = Number(it.totalGstAmount || 0);
      const cgst = it.cgstAmount !== undefined ? Number(it.cgstAmount) : gst / 2;
      const sgst = it.sgstAmount !== undefined ? Number(it.sgstAmount) : gst / 2;
      const base =
        it.baseAmount !== undefined
          ? Number(it.baseAmount)
          : it.sellingPriceWD !== undefined
          ? Number(it.sellingPriceWD) * Number(it.quantity || 0)
          : Math.max(0, Number(it.lineTotal || 0) - gst);

      existing.totalQty = Number((existing.totalQty + Number(it.quantity || 0)).toFixed(3));
      existing.taxableValue = r2(existing.taxableValue + base);
      existing.cgstAmount = r2(existing.cgstAmount + cgst);
      existing.sgstAmount = r2(existing.sgstAmount + sgst);
      existing.totalTax = r2(existing.totalTax + gst);
      existing.totalValue = r2(existing.totalValue + base + gst);
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [periodLedgerItems, productMap]);

  const b2bVsB2cSummary = useMemo(() => {
    const b2bInvoices = periodInvoices.filter((inv) => Boolean(inv.buyerGstin && inv.buyerGstin.trim()));
    const b2cInvoices = periodInvoices.filter((inv) => !inv.buyerGstin || !inv.buyerGstin.trim());
    return {
      b2bCount: b2bInvoices.length,
      b2bTaxable: r2(b2bInvoices.reduce((s, i) => s + i.baseTotal, 0)),
      b2bGst: r2(b2bInvoices.reduce((s, i) => s + i.totalGst, 0)),
      b2bTotal: r2(b2bInvoices.reduce((s, i) => s + i.grandTotal, 0)),
      b2cCount: b2cInvoices.length,
      b2cTaxable: r2(b2cInvoices.reduce((s, i) => s + i.baseTotal, 0)),
      b2cGst: r2(b2cInvoices.reduce((s, i) => s + i.totalGst, 0)),
      b2cTotal: r2(b2cInvoices.reduce((s, i) => s + i.grandTotal, 0)),
      b2bInvoices,
    };
  }, [periodInvoices]);

  const openRecordPaymentModal = () => {
    const suggestedCgst = gstSummary.remainingPayableCgst > 0 ? gstSummary.remainingPayableCgst : 0;
    const suggestedSgst = gstSummary.remainingPayableSgst > 0 ? gstSummary.remainingPayableSgst : 0;
    const suggestedTotal = r2(suggestedCgst + suggestedSgst);

    setChallanRef(`PMT06-${todayStr.replace(/-/g, '')}-${String(gstPayments.length + 1).padStart(3, '0')}`);
    setPaymentDate(todayStr);
    setReturnPeriod(todayStr.slice(0, 7));
    setQuickTotalTax(suggestedTotal > 0 ? String(suggestedTotal) : '');
    setCgstInput(suggestedCgst > 0 ? String(suggestedCgst) : '');
    setSgstInput(suggestedSgst > 0 ? String(suggestedSgst) : '');
    setFeeInput('0');
    setPaymentSource('BANK_UPI');
    setPaymentNotes('');
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  const handleQuickTotalChange = (val: string) => {
    setQuickTotalTax(val);
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) {
      setCgstInput('');
      setSgstInput('');
      return;
    }
    const half = r2(num / 2);
    const otherHalf = r2(num - half);
    setCgstInput(String(half));
    setSgstInput(String(otherHalf));
  };

  const handleSplitChange = (field: 'cgst' | 'sgst', val: string) => {
    const nextCgst = field === 'cgst' ? val : cgstInput;
    const nextSgst = field === 'sgst' ? val : sgstInput;
    if (field === 'cgst') setCgstInput(val);
    else setSgstInput(val);

    const c = parseFloat(nextCgst) || 0;
    const s = parseFloat(nextSgst) || 0;
    const sum = r2(c + s);
    setQuickTotalTax(sum > 0 ? String(sum) : '');
  };

  const handleSaveGovtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddGstPayment || isSavingPayment) return;
    setPaymentError(null);

    const cgst = Math.max(0, Number(cgstInput) || 0);
    const sgst = Math.max(0, Number(sgstInput) || 0);
    const fee = Math.max(0, Number(feeInput) || 0);
    const total = r2(cgst + sgst + fee);

    if (total <= 0) {
      setPaymentError('Please enter a valid GST amount paid to Government greater than ₹0.');
      return;
    }

    setIsSavingPayment(true);
    try {
      const ok = await onAddGstPayment({
        challanRef: challanRef.trim() || `PMT06-${paymentDate.replace(/-/g, '')}`,
        paymentDate: paymentDate || todayStr,
        returnPeriod: returnPeriod || (paymentDate || todayStr).slice(0, 7),
        cgstPaid: r2(cgst),
        sgstPaid: r2(sgst),
        interestOrFee: r2(fee),
        totalPaid: total,
        paymentSource,
        notes: paymentNotes.trim(),
      });
      if (ok) {
        setIsPaymentModalOpen(false);
        setActiveSubTab('govt_payments');
      } else {
        setPaymentError('Unable to save GST payment to database. Please try again.');
      }
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Product-wise GST Ledger
  const productGstRows = useMemo(() => {
    const map = new Map<
      number,
      {
        productId: number;
        name: string;
        category: string;
        unit: string;
        gstRate: number;
        purchasedQty: number;
        purchaseBase: number;
        inputGst: number;
        soldQty: number;
        salesBase: number;
        outputGst: number;
      }
    >();

    const getEntry = (pId: number) => {
      const existing = map.get(pId);
      if (existing) return existing;
      const prod = productMap.get(pId);
      const entry = {
        productId: pId,
        name: prod?.name || `Product #${pId}`,
        category: prod?.category || 'General',
        unit: prod?.unit || 'PCS',
        gstRate: Number(prod?.gstPercent || 0),
        purchasedQty: 0,
        purchaseBase: 0,
        inputGst: 0,
        soldQty: 0,
        salesBase: 0,
        outputGst: 0,
      };
      map.set(pId, entry);
      return entry;
    };

    periodPurchases.forEach((tx) => {
      const row = getEntry(tx.productId);
      const gst = Number(tx.totalGstAmount || 0);
      const base =
        Number(tx.baseAmount || 0) > 0
          ? Number(tx.baseAmount || 0)
          : Math.max(0, Number(tx.totalAmount || 0) - gst);
      row.purchasedQty += Number(tx.addedQuantity || 0);
      row.purchaseBase = r2(row.purchaseBase + base);
      row.inputGst = r2(row.inputGst + gst);
    });

    periodLedgerItems.forEach((it) => {
      const row = getEntry(it.productId);
      const gst = Number(it.totalGstAmount || 0);
      const base =
        it.baseAmount !== undefined
          ? Number(it.baseAmount)
          : it.sellingPriceWD !== undefined
          ? Number(it.sellingPriceWD) * Number(it.quantity || 0)
          : Math.max(0, Number(it.lineTotal || 0) - gst);
      row.soldQty += Number(it.quantity || 0);
      row.salesBase = r2(row.salesBase + base);
      row.outputGst = r2(row.outputGst + gst);
    });

    const q = searchQuery.trim().toLowerCase();
    return Array.from(map.values())
      .filter((r) => {
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
      })
      .sort((a, b) => b.inputGst + b.outputGst - (a.inputGst + a.outputGst));
  }, [periodPurchases, periodLedgerItems, productMap, searchQuery]);

  const filteredOutputInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return periodInvoices;
    return periodInvoices.filter(
      (inv) =>
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.gstRatesLabel.toLowerCase().includes(q)
    );
  }, [periodInvoices, searchQuery]);

  const filteredInputPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = [...periodPurchases].sort((a, b) =>
      String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''))
    );
    if (!q) return list;
    return list.filter(
      (tx) =>
        (tx.productName || '').toLowerCase().includes(q) ||
        (tx.purchaseRef || '').toLowerCase().includes(q) ||
        (tx.category || '').toLowerCase().includes(q)
    );
  }, [periodPurchases, searchQuery]);

  const filteredGovtPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return periodGovtPayments;
    return periodGovtPayments.filter(
      (gp) =>
        (gp.challanRef || '').toLowerCase().includes(q) ||
        (gp.returnPeriod || '').toLowerCase().includes(q) ||
        (gp.notes || '').toLowerCase().includes(q)
    );
  }, [periodGovtPayments, searchQuery]);

  const openReceiptForInvoice = (invData: (typeof periodInvoices)[number]) => {
    if (!onViewInvoice) return;
    const first = invData.items[0];
    const inv: CompleteInvoice = {
      saleId: invData.saleId,
      invoiceNo: invData.invoiceNo,
      saleDate: invData.saleDate,
      customerName: invData.customerName,
      paymentMode: invData.paymentMode,
      items: invData.items.map((r) => ({
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
      subtotal: r2(invData.baseTotal + invData.totalGst),
      discount: invData.discountAmt || 0,
      memberDiscount: invData.discountAmt || 0,
      grandTotal: invData.grandTotal,
      tenderedCash: first?.tenderedCash,
      changeDue: first?.changeDue,
      upiTxnRef: first?.upiTxnRef,
      cashier: invData.cashierName,
    };
    onViewInvoice(inv);
  };

  const handleExportCsv = () => {
    exportGstAnalysisToCsv({
      societyName: society.name,
      periodLabel,
      outputCgst: gstSummary.outputCgst,
      outputSgst: gstSummary.outputSgst,
      outputTotal: gstSummary.outputTotal,
      openingCgstItc,
      openingSgstItc,
      periodInputCgst: gstSummary.periodInputCgst,
      periodInputSgst: gstSummary.periodInputSgst,
      periodInputTotal: gstSummary.periodInputTotal,
      availableCgstItc: gstSummary.availableCgstItc,
      availableSgstItc: gstSummary.availableSgstItc,
      utilizedCgstItc: gstSummary.utilizedCgstItc,
      utilizedSgstItc: gstSummary.utilizedSgstItc,
      netPayableCgstCash: gstSummary.netPayableCgstCash,
      netPayableSgstCash: gstSummary.netPayableSgstCash,
      netPayableTotalCash: gstSummary.netPayableTotalCash,
      govtCgstPaid: gstSummary.govtCgstPaid,
      govtSgstPaid: gstSummary.govtSgstPaid,
      govtFeePaid: gstSummary.govtFeePaid,
      govtTotalPaid: gstSummary.govtTotalPaid,
      remainingPayableCgst: gstSummary.remainingPayableCgst,
      remainingPayableSgst: gstSummary.remainingPayableSgst,
      remainingPayableTotal: gstSummary.remainingPayableTotal,
      closingCgstItc: gstSummary.closingCgstItc,
      closingSgstItc: gstSummary.closingSgstItc,
      closingTotalItc: gstSummary.closingTotalItc,
      salesTaxableBase: gstSummary.salesTaxableBase,
      salesExemptBase: gstSummary.salesExemptBase,
      purchaseTaxableBase: gstSummary.purchaseTaxableBase,
      slabRows: gstSummary.slabRows,
    });
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 print:bg-white print:text-slate-900 print:border-slate-300">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shrink-0 print:hidden">
              <BadgePercent className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  GST Compliance & Tax Analysis (India)
                </h2>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 print:hidden">
                  CGST Act 2017 · Sec 49(5) & Rule 88A
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                {society.name} · Intra-State CGST (50%) + SGST (50%) Output Liability, Input Tax Credit (ITC) & Govt Challan PMT-06
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {onAddGstPayment && (
              <button
                type="button"
                onClick={openRecordPaymentModal}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Govt GST Payment</span>
              </button>
            )}
            {onRefreshData && (
              <button
                type="button"
                onClick={handleRefreshLive}
                disabled={isRefreshing}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync Live DB'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export GST CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statement</span>
            </button>
          </div>
        </div>

        {/* Period Filter & Opening ITC Ledger Controls */}
        <div className="mt-5 pt-5 border-t border-slate-800 grid grid-cols-1 xl:grid-cols-12 gap-4 items-end print:hidden">
          <div className="xl:col-span-7 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Return / Analysis Period ({periodLabel})
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Time' },
                  { id: 'THIS_MONTH', label: 'This Month (GSTR-3B)' },
                  { id: 'LAST_MONTH', label: 'Last Month' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'CUSTOM', label: 'Custom Range' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    periodPreset === p.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === 'CUSTOM' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono-code text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono-code text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          <div className="xl:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-300">
                Opening Electronic Credit Ledger (Prior Period ITC)
              </span>
              <button
                type="button"
                onClick={handleResetOpeningItc}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Reset opening ITC balances to ₹0"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Opening CGST ITC (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCgstItc}
                  onChange={(e) => handleOpeningCgstChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono-code text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Opening SGST ITC (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingSgstItc}
                  onChange={(e) => handleOpeningSgstChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono-code text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Output GST Collected (Sales)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono-code mt-1.5">
            ₹{gstSummary.outputTotal.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono-code">
            CGST: ₹{gstSummary.outputCgst.toFixed(2)} · SGST: ₹{gstSummary.outputSgst.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            On Taxable Sales ₹{gstSummary.salesTaxableBase.toFixed(2)} ({periodInvoices.length} bills)
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Input GST Paid (Purchases ITC)</span>
            <ArrowDownRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono-code mt-1.5">
            ₹{gstSummary.periodInputTotal.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono-code">
            CGST: ₹{gstSummary.periodInputCgst.toFixed(2)} · SGST: ₹{gstSummary.periodInputSgst.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Closing Unused ITC: ₹{gstSummary.closingTotalItc.toFixed(2)}
          </div>
        </div>

        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
            <span>GST Paid to Govt (PMT-06 Challan)</span>
            <Landmark className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono-code mt-1.5">
            ₹{gstSummary.govtTotalPaid.toFixed(2)}
          </div>
          <div className="text-[11px] text-amber-800 mt-1 font-mono-code">
            CGST: ₹{gstSummary.govtCgstPaid.toFixed(2)} · SGST: ₹{gstSummary.govtSgstPaid.toFixed(2)}
          </div>
          <div className="text-[11px] text-amber-700/90 mt-0.5">
            {periodGovtPayments.length} recorded Govt {periodGovtPayments.length === 1 ? 'challan' : 'challans'}
            {gstSummary.govtFeePaid > 0 ? ` · Fee ₹${gstSummary.govtFeePaid.toFixed(2)}` : ''}
          </div>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            gstSummary.remainingPayableTotal > 0
              ? 'bg-rose-50/70 border-rose-200'
              : 'bg-emerald-50/60 border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Remaining GST Balance Payable</span>
            {gstSummary.remainingPayableTotal > 0 ? (
              <IndianRupee className="w-4 h-4 text-rose-600" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div
            className={`text-2xl font-black font-mono-code mt-1.5 ${
              gstSummary.remainingPayableTotal > 0 ? 'text-rose-700' : 'text-emerald-800'
            }`}
          >
            ₹{gstSummary.remainingPayableTotal.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-600 mt-1 font-mono-code">
            CGST Due: ₹{gstSummary.remainingPayableCgst.toFixed(2)} · SGST Due: ₹{gstSummary.remainingPayableSgst.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {gstSummary.remainingPayableTotal > 0
              ? `Payable after ITC (₹${gstSummary.netPayableTotalCash.toFixed(2)}) & Challans`
              : gstSummary.excessGovtCashPaid > 0
              ? `Advance/Excess paid to Govt: ₹${gstSummary.excessGovtCashPaid.toFixed(2)}`
              : 'Settled by ITC & Govt Challans'}
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'gstr3b', label: 'GSTR-3B Set-Off & Slabs' },
              { id: 'hsn_b2b', label: `GSTR-1 HSN & B2B/B2C (${hsnSummaryRows.length})` },
              { id: 'output_sales', label: `Output GST Sales (${periodInvoices.length})` },
              { id: 'input_purchases', label: `Input GST Purchases (${periodPurchases.length})` },
              { id: 'govt_payments', label: `Govt Payments PMT-06 (${periodGovtPayments.length})` },
              { id: 'product_wise', label: `Product-wise GST (${productGstRows.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSubTab !== 'gstr3b' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter invoice, product, challan..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Sub-Tab 1: GSTR-3B Set-Off & Slab Breakdown */}
      {activeSubTab === 'gstr3b' && (
        <div className="space-y-6">
          {/* GSTR-3B Table 6.1 Utilization */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  GSTR-3B Table 6.1 — Tax Liability, ITC Set-Off & Govt Challan Payments
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Computed strictly under Section 49(5) & Rule 88A of the CGST Act, 2017 (No cross-utilization between CGST and SGST)
                </p>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                  gstSummary.remainingPayableTotal > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {gstSummary.remainingPayableTotal > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Remaining Govt Balance Due: ₹{gstSummary.remainingPayableTotal.toFixed(2)}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Zero Cash Due (Unused ITC: ₹{gstSummary.closingTotalItc.toFixed(2)})
                  </>
                )}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Tax Head</th>
                    <th className="px-3.5 py-3 text-right">Output Liability</th>
                    <th className="px-3.5 py-3 text-right">Available ITC</th>
                    <th className="px-3.5 py-3 text-right">ITC Set-Off</th>
                    <th className="px-3.5 py-3 text-right">Net Due After ITC</th>
                    <th className="px-3.5 py-3 text-right">Paid to Govt (PMT-06)</th>
                    <th className="px-3.5 py-3 text-right">Balance Payable</th>
                    <th className="px-3.5 py-3 text-right">Closing ITC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-code">
                  <tr className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-3 font-sans font-bold text-slate-900">
                      CGST (Central Tax)
                    </td>
                    <td className="px-3.5 py-3 text-right text-slate-900">₹{gstSummary.outputCgst.toFixed(2)}</td>
                    <td className="px-3.5 py-3 text-right text-emerald-700 font-semibold">
                      ₹{gstSummary.availableCgstItc.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-blue-700 font-semibold">
                      ₹{gstSummary.utilizedCgstItc.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-slate-900 font-semibold">
                      ₹{gstSummary.netPayableCgstCash.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-amber-700 font-bold">
                      ₹{gstSummary.govtCgstPaid.toFixed(2)}
                    </td>
                    <td
                      className={`px-3.5 py-3 text-right font-bold ${
                        gstSummary.remainingPayableCgst > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      ₹{gstSummary.remainingPayableCgst.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-emerald-700 font-bold">
                      ₹{gstSummary.closingCgstItc.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-3 font-sans font-bold text-slate-900">
                      SGST (State Tax — WB)
                    </td>
                    <td className="px-3.5 py-3 text-right text-slate-900">₹{gstSummary.outputSgst.toFixed(2)}</td>
                    <td className="px-3.5 py-3 text-right text-emerald-700 font-semibold">
                      ₹{gstSummary.availableSgstItc.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-blue-700 font-semibold">
                      ₹{gstSummary.utilizedSgstItc.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-slate-900 font-semibold">
                      ₹{gstSummary.netPayableSgstCash.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-amber-700 font-bold">
                      ₹{gstSummary.govtSgstPaid.toFixed(2)}
                    </td>
                    <td
                      className={`px-3.5 py-3 text-right font-bold ${
                        gstSummary.remainingPayableSgst > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      ₹{gstSummary.remainingPayableSgst.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-emerald-700 font-bold">
                      ₹{gstSummary.closingSgstItc.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-900 text-white font-mono-code font-bold">
                  <tr>
                    <td className="px-3.5 py-3 font-sans">TOTAL GST POSITION</td>
                    <td className="px-3.5 py-3 text-right">₹{gstSummary.outputTotal.toFixed(2)}</td>
                    <td className="px-3.5 py-3 text-right text-emerald-300">
                      ₹{(gstSummary.availableCgstItc + gstSummary.availableSgstItc).toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-sky-300">
                      ₹{(gstSummary.utilizedCgstItc + gstSummary.utilizedSgstItc).toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right">₹{gstSummary.netPayableTotalCash.toFixed(2)}</td>
                    <td className="px-3.5 py-3 text-right text-amber-300">
                      ₹{gstSummary.govtTaxPaidTotal.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-rose-300">
                      ₹{gstSummary.remainingPayableTotal.toFixed(2)}
                    </td>
                    <td className="px-3.5 py-3 text-right text-emerald-300">
                      ₹{gstSummary.closingTotalItc.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* GSTR-1 / GSTR-2B Slab-Wise Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  GST Rate Slab Breakdown (0% Exempt, 5%, 12%, 18%, 28%)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reconciles GSTR-1 Outward Taxable / Exempt Turnover with GSTR-2B Inward Purchase ITC per Tax Slab
                </p>
              </div>
              <div className="text-xs font-mono-code text-slate-600">
                Taxable Sales: ₹{gstSummary.salesTaxableBase.toFixed(2)} · Nil/Exempt Sales: ₹{gstSummary.salesExemptBase.toFixed(2)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">GST Slab</th>
                    <th className="px-4 py-3 text-right">Sales Taxable Base</th>
                    <th className="px-4 py-3 text-right">Output CGST</th>
                    <th className="px-4 py-3 text-right">Output SGST</th>
                    <th className="px-4 py-3 text-right">Output Total</th>
                    <th className="px-4 py-3 text-right">Purchase Base (Excl GST)</th>
                    <th className="px-4 py-3 text-right">Input CGST</th>
                    <th className="px-4 py-3 text-right">Input SGST</th>
                    <th className="px-4 py-3 text-right">Input Total (ITC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-code">
                  {gstSummary.slabRows.map((slab) => (
                    <tr key={slab.gstRate} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-sans font-bold text-slate-900">
                        {slab.gstRate === 0
                          ? '0% (Nil / Exempt)'
                          : `${slab.gstRate}% GST (${slab.gstRate / 2}% + ${slab.gstRate / 2}%)`}
                      </td>
                      <td className="px-4 py-3 text-right">₹{slab.salesTaxableBase.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{slab.outputCgst.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{slab.outputSgst.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700">
                        ₹{slab.outputTotalGst.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">₹{slab.purchaseTaxableBase.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{slab.inputCgst.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{slab.inputSgst.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        ₹{slab.inputTotalGst.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Indian GST Rules Applied Reference Panel */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <h4 className="font-extrabold text-sm text-slate-900">
                Indian GST Government Rules Applied in This Analysis
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 mb-1">1. Intra-State CGST + SGST Split (Section 9 CGST/WBGST Act)</div>
                <p className="text-slate-600 leading-relaxed">
                  Every taxable sale and local purchase splits total GST equally: <strong>50% CGST</strong> (Central Govt) and <strong>50% SGST</strong> (West Bengal State Govt). 0% items are tracked separately as Nil Rated / Exempt supplies under GSTR-1 Table 8.
                </p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 mb-1">2. Strict ITC Utilization Order (Section 49(5) & Rule 88A)</div>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Input CGST Credit</strong> can only offset <strong>Output CGST</strong> liability, and <strong>Input SGST Credit</strong> can only offset <strong>Output SGST</strong> liability. Cross-utilization of CGST against SGST (or vice versa) is prohibited under Indian GST law.
                </p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 mb-1">3. Recording Cash Tax Payments (Challan PMT-06)</div>
                <p className="text-slate-600 leading-relaxed">
                  When Output GST exceeds Available ITC and you pay tax to the Government (e.g., ₹2,000 via Bank/UPI or Cash on the GST portal), click <strong>Record Govt GST Payment</strong> above to save the Challan PMT-06. Both <strong>GST Analysis</strong> and the <strong>Balance Sheet</strong> update automatically.
                </p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 mb-1">4. Statutory Monthly Return Filing Reference</div>
                <p className="text-slate-600 leading-relaxed">
                  <strong>GSTR-1</strong> (Outward Sales summary) is due by the <strong>11th</strong> of the next month. <strong>GSTR-3B</strong> (Summary return & tax payment after matching Input ITC with supplier GSTR-2B under Section 16) is due by the <strong>20th</strong> of the next month.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Output GST Sales (GSTR-1 Outward Invoices) */}
      {activeSubTab === 'output_sales' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                Outward Supplies Register — Output GST Collected on Sales (GSTR-1)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Invoice-level taxable value, CGST, SGST, and gross invoice amount collected from members/customers
              </p>
            </div>
            <div className="text-xs font-mono-code font-bold text-slate-700">
              Output GST Total: ₹{gstSummary.outputTotal.toFixed(2)}
            </div>
          </div>

          {filteredOutputInvoices.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No sales invoices found for the selected period or search filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Invoice No</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Slabs</th>
                    <th className="px-4 py-3 text-right">Taxable Base</th>
                    <th className="px-4 py-3 text-right">Output CGST</th>
                    <th className="px-4 py-3 text-right">Output SGST</th>
                    <th className="px-4 py-3 text-right">Total Output GST</th>
                    <th className="px-4 py-3 text-right">Invoice Total</th>
                    {onViewInvoice && <th className="px-4 py-3 text-center print:hidden">Bill</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOutputInvoices.map((inv) => (
                    <tr key={inv.invoiceNo} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono-code font-bold text-slate-900">{inv.invoiceNo}</td>
                      <td className="px-4 py-2.5 font-mono-code text-slate-600">{inv.dateOnly}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{inv.customerName}</td>
                      <td className="px-4 py-2.5 font-mono-code text-slate-600">{inv.gstRatesLabel}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code">₹{inv.baseTotal.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code">₹{inv.totalCgst.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code">₹{inv.totalSgst.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code font-bold text-rose-700">
                        ₹{inv.totalGst.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-code font-bold text-slate-900">
                        ₹{inv.grandTotal.toFixed(2)}
                      </td>
                      {onViewInvoice && (
                        <td className="px-4 py-2.5 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => openReceiptForInvoice(inv)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="View GST Invoice Receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 3: Input GST Purchases (GSTR-2B Inward ITC) */}
      {activeSubTab === 'input_purchases' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                Inward Supplies & ITC Register — Input GST Paid on Purchases (GSTR-2B)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every stock addition/purchase recorded with Base Purchase Amount (Without GST) and Input CGST/SGST Paid
              </p>
            </div>
            <div className="text-xs font-mono-code font-bold text-emerald-700">
              Total Eligible Input ITC: ₹{gstSummary.periodInputTotal.toFixed(2)}
            </div>
          </div>

          {filteredInputPurchases.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No purchase transactions found for the selected period or search filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Purchase Ref</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Product & Category</th>
                    <th className="px-4 py-3 text-right">Added Qty</th>
                    <th className="px-4 py-3 text-right">Base (Excl GST)</th>
                    <th className="px-4 py-3 text-right">GST %</th>
                    <th className="px-4 py-3 text-right">Input CGST</th>
                    <th className="px-4 py-3 text-right">Input SGST</th>
                    <th className="px-4 py-3 text-right">Total Input GST</th>
                    <th className="px-4 py-3 text-right">Total Paid (Incl GST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInputPurchases.map((tx) => {
                    const gst = Number(tx.totalGstAmount || 0);
                    const cgst = tx.cgstAmount !== undefined ? Number(tx.cgstAmount) : gst / 2;
                    const sgst = tx.sgstAmount !== undefined ? Number(tx.sgstAmount) : gst / 2;
                    const base =
                      Number(tx.baseAmount || 0) > 0
                        ? Number(tx.baseAmount || 0)
                        : Math.max(0, Number(tx.totalAmount || 0) - gst);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono-code font-bold text-slate-900">
                          {tx.purchaseRef}
                        </td>
                        <td className="px-4 py-2.5 font-mono-code text-slate-600">
                          {extractDatePart(tx.purchaseDate)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{tx.productName}</div>
                          <div className="text-[11px] text-slate-500">{tx.category}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-code">
                          {Number(tx.addedQuantity || 0).toFixed(2)} {tx.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-code">₹{base.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-code">{Number(tx.gstPercent || 0)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono-code">₹{cgst.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-code">₹{sgst.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-code font-bold text-emerald-700">
                          ₹{gst.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-code font-bold text-slate-900">
                          ₹{Number(tx.totalAmount || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 4: Govt Payments (Challan PMT-06 Register) */}
      {activeSubTab === 'govt_payments' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                GST Paid to Government — Challan PMT-06 / GSTR-3B Cash Ledger Register
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Recorded GST tax payments paid directly to the Government (automatically reduces GST Liability and Cash/Bank in Balance Sheet)
              </p>
            </div>
            {onAddGstPayment && (
              <button
                type="button"
                onClick={openRecordPaymentModal}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer print:hidden"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add Govt GST Challan</span>
              </button>
            )}
          </div>

          {filteredGovtPayments.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Landmark className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="text-xs text-slate-500">
                No Govt GST Challan payments recorded yet for this period.
              </div>
              {onAddGstPayment && (
                <button
                  type="button"
                  onClick={openRecordPaymentModal}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Govt GST Payment</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Challan / CPIN Ref</th>
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Return Period</th>
                    <th className="px-4 py-3">Paid From</th>
                    <th className="px-4 py-3 text-right">CGST Paid</th>
                    <th className="px-4 py-3 text-right">SGST Paid</th>
                    <th className="px-4 py-3 text-right">Fee / Interest</th>
                    <th className="px-4 py-3 text-right">Total Paid</th>
                    <th className="px-4 py-3">Notes / Staff</th>
                    {onDeleteGstPayment && <th className="px-4 py-3 text-center print:hidden">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGovtPayments.map((gp) => (
                    <tr key={gp.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono-code font-bold text-slate-900">
                        {gp.challanRef}
                      </td>
                      <td className="px-4 py-2.5 font-mono-code text-slate-600">{gp.paymentDate}</td>
                      <td className="px-4 py-2.5 font-mono-code text-slate-700">{gp.returnPeriod}</td>
                      <td className="px-4 py-2.5 text-slate-700 font-semibold">
                        {gp.paymentSource === 'CASH' ? 'Cash Drawer' : 'Bank / UPI'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-code">₹{gp.cgstPaid.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code">₹{gp.sgstPaid.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono-code text-slate-600">
                        ₹{gp.interestOrFee.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-code font-bold text-amber-800">
                        ₹{gp.totalPaid.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        <div>{gp.notes || '—'}</div>
                        <div className="text-[10px] text-slate-400">By: {gp.performedBy}</div>
                      </td>
                      {onDeleteGstPayment && (
                        <td className="px-4 py-2.5 text-center print:hidden">
                          {confirmDeleteId === gp.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteGstPayment(gp.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(gp.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete Challan Entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 5: Product-wise GST Reconciliation */}
      {activeSubTab === 'product_wise' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                Product-wise Input ITC vs Output GST Reconciliation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare GST paid on stock purchases against GST collected on customer sales per SKU
              </p>
            </div>
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
          </div>

          {productGstRows.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No product GST activity found for the selected period or search filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">GST %</th>
                    <th className="px-4 py-3 text-right">Purchased Qty</th>
                    <th className="px-4 py-3 text-right">Purchase Base</th>
                    <th className="px-4 py-3 text-right">Input GST Paid</th>
                    <th className="px-4 py-3 text-right">Sold Qty</th>
                    <th className="px-4 py-3 text-right">Sales Base</th>
                    <th className="px-4 py-3 text-right">Output GST</th>
                    <th className="px-4 py-3 text-right">Net Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-code">
                  {productGstRows.map((row) => {
                    const net = r2(row.outputGst - row.inputGst);
                    return (
                      <tr key={row.productId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-sans">
                          <div className="font-bold text-slate-900">{row.name}</div>
                          <div className="text-[11px] text-slate-500">{row.category}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">{row.gstRate}%</td>
                        <td className="px-4 py-2.5 text-right">
                          {row.purchasedQty.toFixed(2)} {row.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right">₹{row.purchaseBase.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 font-bold">
                          ₹{row.inputGst.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.soldQty.toFixed(2)} {row.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right">₹{row.salesBase.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-rose-700 font-bold">
                          ₹{row.outputGst.toFixed(2)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-bold ${
                            net > 0 ? 'text-rose-700' : net < 0 ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {net > 0
                            ? `Payable ₹${net.toFixed(2)}`
                            : net < 0
                            ? `ITC ₹${Math.abs(net).toFixed(2)}`
                            : '₹0.00'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 6: GSTR-1 Table 12 HSN Summary & B2B vs B2C Split */}
      {activeSubTab === 'hsn_b2b' && (
        <div className="space-y-6">
          {/* B2B vs B2C Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                GSTR-1 Table 4A — B2B Supplies (With Buyer GSTIN)
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono-code mt-1">
                ₹{b2bVsB2cSummary.b2bTotal.toFixed(2)}
              </div>
              <div className="text-xs text-slate-600 font-mono-code mt-1">
                {b2bVsB2cSummary.b2bCount} B2B Invoices · Taxable: ₹{b2bVsB2cSummary.b2bTaxable.toFixed(2)} · GST: ₹{b2bVsB2cSummary.b2bGst.toFixed(2)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                GSTR-1 Table 7 — B2C Supplies (Retail / Unregistered Farmers)
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono-code mt-1">
                ₹{b2bVsB2cSummary.b2cTotal.toFixed(2)}
              </div>
              <div className="text-xs text-slate-600 font-mono-code mt-1">
                {b2bVsB2cSummary.b2cCount} B2C Invoices · Taxable: ₹{b2bVsB2cSummary.b2cTaxable.toFixed(2)} · GST: ₹{b2bVsB2cSummary.b2cGst.toFixed(2)}
              </div>
            </div>
          </div>

          {/* GSTR-1 Table 12 HSN-wise Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  GSTR-1 Table 12 — HSN / SAC Wise Summary of Outward Supplies
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aggregated by HSN Code (e.g., 3105 Fertilizers, 3808 Agro Pesticides), UQC Unit, and GST Rate
                </p>
              </div>
              <span className="text-xs font-mono-code font-bold text-slate-600">
                Society GSTIN:{' '}
                {adminSettings?.societyGstin && adminSettings.societyGstin !== '19AAAAD0000A1Z5'
                  ? adminSettings.societyGstin
                  : society.gstin || '19AAAAD9763A1ZS'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">HSN / SAC</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">UQC</th>
                    <th className="px-4 py-3 text-right">Total Qty</th>
                    <th className="px-4 py-3 text-right">GST Rate</th>
                    <th className="px-4 py-3 text-right">Taxable Value (₹)</th>
                    <th className="px-4 py-3 text-right">CGST (₹)</th>
                    <th className="px-4 py-3 text-right">SGST (₹)</th>
                    <th className="px-4 py-3 text-right">Total Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-code">
                  {hsnSummaryRows.map((row) => (
                    <tr key={`${row.hsnCode}-${row.uqc}-${row.gstRate}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{row.hsnCode}</td>
                      <td className="px-4 py-2.5 font-sans text-slate-700">{row.description}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.uqc}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{row.totalQty.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">{row.gstRate}%</td>
                      <td className="px-4 py-2.5 text-right">₹{row.taxableValue.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">₹{row.cgstAmount.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right">₹{row.sgstAmount.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-extrabold text-slate-900">
                        ₹{row.totalValue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {hsnSummaryRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center font-sans text-slate-400">
                        No outward supplies recorded for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record GST Payment to Government (Challan PMT-06) - closes ONLY via Close/Cancel/Save */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  Record GST Payment to Govt (Challan PMT-06)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Save GSTR-3B tax challan paid to Government (auto-syncs GST Analysis & Balance Sheet)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGovtPayment} className="p-6 space-y-4 text-xs">
              {paymentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Challan / CPIN No.</label>
                  <input
                    type="text"
                    value={challanRef}
                    onChange={(e) => setChallanRef(e.target.value)}
                    placeholder="PMT06-..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Return Period</label>
                  <input
                    type="month"
                    value={returnPeriod}
                    onChange={(e) => setReturnPeriod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <label className="font-bold text-emerald-950 block mb-1">
                    Total GST Tax Paid to Govt (₹) — Auto-splits 50% CGST + 50% SGST
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quickTotalTax}
                    onChange={(e) => handleQuickTotalChange(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg font-mono-code font-bold text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">CGST Paid (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cgstInput}
                      onChange={(e) => handleSplitChange('cgst', e.target.value)}
                      placeholder="1000"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">SGST Paid (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sgstInput}
                      onChange={(e) => handleSplitChange('sgst', e.target.value)}
                      placeholder="1000"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Interest / Fee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Paid From Account</label>
                  <select
                    value={paymentSource}
                    onChange={(e) =>
                      setPaymentSource(e.target.value === 'CASH' ? 'CASH' : 'BANK_UPI')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="BANK_UPI">Bank / Online UPI Account</option>
                    <option value="CASH">Counter Cash Drawer</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Remarks / Challan Note</label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. GSTR-3B Govt Tax Paid"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayment}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow cursor-pointer"
                >
                  {isSavingPayment ? 'Saving...' : 'Save Govt GST Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
