import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  PieChart,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  Download,
  Eye,
  X,
  Clock,
  User,
  Hash,
  Box,
  Layers,
  Sparkles,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  ArrowDownRight,
  Calculator,
  Printer,
  HelpCircle,
  TrendingDown,
  Calendar,
  ArrowLeftRight
} from 'lucide-react';
import { Product, SaleTransactionItem, CompleteInvoice, PurchaseTransaction, PurchaseEntryType } from '../types';
import {
  exportLedgerToCsv,
  exportGstRefundReportToCsv,
  exportPurchaseSummaryToCsv,
  exportPurchaseTransactionsToCsv,
  GstReportRow,
} from '../utils/csvExporter';
import { getIstDateStr } from '../utils/dateUtils';

interface PurchaseSummaryManagerProps {
  products: Product[];
  ledger: SaleTransactionItem[];
  categories: string[];
  purchaseTransactions?: PurchaseTransaction[];
  onViewInvoice?: (invoice: CompleteInvoice) => void;
}

export const PurchaseSummaryManager: React.FC<PurchaseSummaryManagerProps> = ({
  products,
  ledger,
  categories,
  purchaseTransactions = [],
  onViewInvoice,
}) => {
  const [activeView, setActiveView] = useState<'summary' | 'transactions' | 'gst_refund'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [purchaseEntryFilter, setPurchaseEntryFilter] = useState<'ALL' | PurchaseEntryType>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Items');
  const [transactionScope, setTransactionScope] = useState<'both' | 'purchase' | 'sell'>('both');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'this_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'purchaseValue' | 'salesValue' | 'profit' | 'gstAccrued' | 'utilization'>('purchaseValue');

  // Active product selected for "Utilize" modal
  const [utilizeProduct, setUtilizeProduct] = useState<Product | null>(null);
  const [utilizeSearch, setUtilizeSearch] = useState('');

  const handlePresetChange = (preset: 'all' | 'today' | 'this_month' | 'custom') => {
    setDatePreset(preset);
    const todayStr = getIstDateStr();

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      setStartDate(`${todayStr.slice(0, 7)}-01`);
      setEndDate(todayStr);
    } else if (preset === 'custom') {
      if (!startDate) setStartDate(todayStr);
      if (!endDate) setEndDate(todayStr);
    }
  };

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const resolvePaymentStatus = (
    status?: 'CREDIT' | 'CASH' | 'BANK_UPI'
  ): 'CREDIT' | 'CASH' | 'BANK_UPI' =>
    status === 'CASH' || status === 'BANK_UPI' ? status : 'CREDIT';

  const extractDatePart = (raw?: string): string => {
    if (!raw) return '';
    const trimmed = String(raw).trim();
    const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    return trimmed.substring(0, 10);
  };

  const hasDateFilter = Boolean(startDate || endDate);

  const productIdSet = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  // Match BalanceSheetManager: only include purchases belonging to active catalog products
  const activePurchaseTransactions = useMemo(() => {
    if (products.length === 0) return purchaseTransactions;
    return purchaseTransactions.filter((tx) => productIdSet.has(tx.productId));
  }, [purchaseTransactions, products.length, productIdSet]);

  // Date-filtered purchase transactions (used by Tab 1, Tab 3, and Utilize modal)
  const dateFilteredPurchases = useMemo(() => {
    return activePurchaseTransactions.filter((tx) => {
      const txDateStr = extractDatePart(tx.purchaseDate);
      if (!txDateStr) return !hasDateFilter;
      if (startDate && txDateStr < startDate) return false;
      if (endDate && txDateStr > endDate) return false;
      return true;
    });
  }, [activePurchaseTransactions, startDate, endDate, hasDateFilter]);

  // Aggregate actual recorded purchase transactions per product (exact same math as BalanceSheetManager)
  const productPurchaseMap = useMemo(() => {
    const map = new Map<
      number,
      {
        totalQtyPurchased: number;
        totalBaseAmount: number;
        totalInputGst: number;
        totalPurchaseInclGst: number;
        creditPurchaseAmount: number;
        paidPurchaseAmount: number;
        purchaseCount: number;
        purchaseItems: PurchaseTransaction[];
      }
    >();

    dateFilteredPurchases.forEach((tx) => {
      if (!tx.productId) return;
      const existing = map.get(tx.productId) || {
        totalQtyPurchased: 0,
        totalBaseAmount: 0,
        totalInputGst: 0,
        totalPurchaseInclGst: 0,
        creditPurchaseAmount: 0,
        paidPurchaseAmount: 0,
        purchaseCount: 0,
        purchaseItems: [],
      };

      const qty = Number(tx.addedQuantity || 0);
      const txGst = Number(tx.totalGstAmount || 0);
      const txBase =
        Number(tx.baseAmount || 0) > 0
          ? Number(tx.baseAmount || 0)
          : Math.max(0, Number(tx.totalAmount || 0) - txGst);
      const txTotal = r2(txBase + txGst);

      existing.totalQtyPurchased = Number((existing.totalQtyPurchased + qty).toFixed(3));
      existing.totalBaseAmount = r2(existing.totalBaseAmount + txBase);
      existing.totalInputGst = r2(existing.totalInputGst + txGst);
      existing.totalPurchaseInclGst = r2(existing.totalPurchaseInclGst + txTotal);
      if (resolvePaymentStatus(tx.paymentStatus) === 'CREDIT') {
        existing.creditPurchaseAmount = r2(existing.creditPurchaseAmount + txTotal);
      } else {
        existing.paidPurchaseAmount = r2(existing.paidPurchaseAmount + txTotal);
      }
      existing.purchaseCount += 1;
      existing.purchaseItems.push(tx);
      map.set(tx.productId, existing);
    });

    return map;
  }, [dateFilteredPurchases]);

  // Filter sales ledger transactions by the active Date Range
  const filteredLedger = useMemo(() => {
    return ledger.filter((item) => {
      const itemDateStr = extractDatePart(item.saleDate);
      if (!itemDateStr) return !hasDateFilter;
      if (startDate && itemDateStr < startDate) return false;
      if (endDate && itemDateStr > endDate) return false;
      return true;
    });
  }, [ledger, startDate, endDate, hasDateFilter]);

  // 1. Calculate sales summary map for every product from the date-filtered sales ledger
  const productSalesMap = useMemo(() => {
    const map = new Map<number, {
      totalQtySold: number;
      totalRevenue: number;
      totalSalesBase: number;
      totalOutputGst: number;
      transactionCount: number;
      salesItems: SaleTransactionItem[];
    }>();

    filteredLedger.forEach((item) => {
      if (!item.productId) return;
      const existing = map.get(item.productId) || {
        totalQtySold: 0,
        totalRevenue: 0,
        totalSalesBase: 0,
        totalOutputGst: 0,
        transactionCount: 0,
        salesItems: [],
      };

      const qty = Number(item.quantity || 0);
      const rev = Number(item.lineTotal || 0);
      const outGst = Number(item.totalGstAmount || 0);
      const base = item.baseAmount !== undefined && item.baseAmount !== null ? Number(item.baseAmount) : Math.max(0, rev - outGst);

      existing.totalQtySold += qty;
      existing.totalRevenue += rev;
      existing.totalSalesBase += base;
      existing.totalOutputGst += outGst;
      existing.transactionCount += 1;
      existing.salesItems.push(item);
      map.set(item.productId, existing);
    });

    return map;
  }, [filteredLedger]);

  // 2. Process product purchase, profit & GST accrued breakdown
  // Uses actual recorded PurchaseTransactions (reconciling 1-to-1 with Balance Sheet & Sundry Creditors),
  // falling back to catalog opening valuation ONLY in All-Time view for legacy products without purchase bills.
  const processedProducts = useMemo(() => {
    return products.map((product) => {
      const stock = Math.max(0, product.stock || 0);
      const rawPurchasePrice = Number(product.costPrice || 0);
      const gstRate =
        product.gstPercent !== undefined && product.gstPercent !== null && Number.isFinite(Number(product.gstPercent))
          ? Number(product.gstPercent)
          : 0;

      // Catalog fallback rates (Purchase Price is WITHOUT GST / WD GST)
      const catalogUnitBase = rawPurchasePrice;
      const catalogUnitGst = (catalogUnitBase * gstRate) / 100;
      const catalogUnitWithGst = catalogUnitBase + catalogUnitGst;

      // Sales data for this product in active date range
      const sales = productSalesMap.get(product.id) || {
        totalQtySold: 0,
        totalRevenue: 0,
        totalSalesBase: 0,
        totalOutputGst: 0,
        transactionCount: 0,
        salesItems: [],
      };

      // Actual recorded purchases for this product in active date range
      const purchases = productPurchaseMap.get(product.id);
      const useActualPurchaseLog = hasDateFilter || (purchases !== undefined && purchases.purchaseCount > 0);

      let totalPurchasedStock = 0;
      let totalBaseAmountExclGst = 0;
      let totalInputGstPaid = 0;
      let totalPurchaseInclGst = 0;
      let purchaseCount = 0;
      let creditPurchaseAmount = 0;
      let paidPurchaseAmount = 0;
      let purchaseItems: PurchaseTransaction[] = [];
      let isEstimatedFromCatalog = false;

      if (useActualPurchaseLog) {
        totalPurchasedStock = purchases ? purchases.totalQtyPurchased : 0;
        totalBaseAmountExclGst = purchases ? purchases.totalBaseAmount : 0;
        totalInputGstPaid = purchases ? purchases.totalInputGst : 0;
        totalPurchaseInclGst = purchases ? purchases.totalPurchaseInclGst : 0;
        purchaseCount = purchases ? purchases.purchaseCount : 0;
        creditPurchaseAmount = purchases ? purchases.creditPurchaseAmount : 0;
        paidPurchaseAmount = purchases ? purchases.paidPurchaseAmount : 0;
        purchaseItems = purchases ? purchases.purchaseItems : [];
      } else {
        // Legacy opening catalog item with zero purchase bills in All Time view
        isEstimatedFromCatalog = true;
        totalPurchasedStock = stock + sales.totalQtySold;
        totalBaseAmountExclGst = r2(totalPurchasedStock * catalogUnitBase);
        totalInputGstPaid = r2(totalPurchasedStock * catalogUnitGst);
        totalPurchaseInclGst = r2(totalBaseAmountExclGst + totalInputGstPaid);
      }

      // Effective average unit rates so per-unit sublabels always match row totals
      const unitBaseAmount =
        totalPurchasedStock > 0 ? totalBaseAmountExclGst / totalPurchasedStock : catalogUnitBase;
      const unitPurchaseWithGst =
        totalPurchasedStock > 0 ? totalPurchaseInclGst / totalPurchasedStock : catalogUnitWithGst;
      const unitGstAmount =
        totalPurchasedStock > 0 ? totalInputGstPaid / totalPurchasedStock : catalogUnitGst;
      const effectiveGstRate =
        purchaseCount > 0 && totalBaseAmountExclGst > 0
          ? r2((totalInputGstPaid / totalBaseAmountExclGst) * 100)
          : gstRate;
      const halfGstRate = r2(effectiveGstRate / 2);

      // COGS (Cost of Goods Sold) for units sold
      const costRateForCogs = unitBaseAmount > 0 ? unitBaseAmount : catalogUnitBase;
      const costWithGstForCogs = unitPurchaseWithGst > 0 ? unitPurchaseWithGst : catalogUnitWithGst;
      const cogsBase = sales.totalQtySold * costRateForCogs;

      // Total Profit Amount Till Now = Net Sales Base Revenue - Cost of Goods Sold (Base)
      const totalProfitTillNow = sales.totalSalesBase - cogsBase;

      // Gross Profit (Gross Sales Revenue - Gross Purchase Cost With GST of sold units)
      const grossProfitTillNow = sales.totalRevenue - sales.totalQtySold * costWithGstForCogs;

      // Profit margin %
      const profitMarginPercent = cogsBase > 0 ? (totalProfitTillNow / cogsBase) * 100 : 0;

      // Total GST Accrued / Refundable to Government (Input Tax Credit balance)
      // Input GST Paid on Purchases (A) minus Output GST collected on Sales (B)
      const totalOutputGstCollected = sales.totalOutputGst;
      const netGstAccruedRefundable = r2(totalInputGstPaid - totalOutputGstCollected);

      const inputCgst = r2(totalInputGstPaid / 2);
      const inputSgst = r2(totalInputGstPaid - inputCgst);
      const outputCgst = r2(totalOutputGstCollected / 2);
      const outputSgst = r2(totalOutputGstCollected - outputCgst);
      const netCgstRefundable = r2(netGstAccruedRefundable / 2);
      const netSgstRefundable = r2(netGstAccruedRefundable - netCgstRefundable);

      // Stock Utilization % = Sold Qty / Total Purchased Stock * 100
      const utilizationDenominator = totalPurchasedStock > 0 ? totalPurchasedStock : stock + sales.totalQtySold;
      const utilizationPercent =
        utilizationDenominator > 0 ? (sales.totalQtySold / utilizationDenominator) * 100 : 0;

      return {
        product,
        stock,
        totalPurchasedStock,
        rawPurchasePrice,
        unitPurchaseWithGst,
        gstRate: effectiveGstRate,
        halfGstRate,
        unitBaseAmount,
        unitGstAmount,
        totalPurchaseInclGst,
        totalBaseAmountExclGst,
        totalInputGstPaid,
        purchaseCount,
        creditPurchaseAmount,
        paidPurchaseAmount,
        purchaseItems,
        isEstimatedFromCatalog,
        totalQtySold: sales.totalQtySold,
        totalSalesRevenue: sales.totalRevenue,
        totalSalesBase: sales.totalSalesBase,
        totalOutputGstCollected,
        cogsBase,
        totalProfitTillNow,
        grossProfitTillNow,
        profitMarginPercent,
        netGstAccruedRefundable,
        inputCgst,
        inputSgst,
        outputCgst,
        outputSgst,
        netCgstRefundable,
        netSgstRefundable,
        salesCount: sales.transactionCount,
        salesItems: sales.salesItems,
        utilizationPercent,
      };
    });
  }, [products, productSalesMap, productPurchaseMap, hasDateFilter]);

  // 3. Filter and sort
  const filteredProducts = useMemo(() => {
    return processedProducts
      .filter((row) => {
        const { product } = row;
        const matchesCategory =
          selectedCategory === 'All Items' || product.category === selectedCategory;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          product.name.toLowerCase().includes(q) ||
          product.barcode.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q);
        if (!matchesCategory || !matchesSearch) return false;

        // When a date filter is active, show only products that actually had activity in that period
        if (hasDateFilter) {
          if (transactionScope === 'purchase') return row.purchaseCount > 0;
          if (transactionScope === 'sell') return row.salesCount > 0;
          return row.purchaseCount > 0 || row.salesCount > 0;
        }

        // In All-Time view, honor scope so Only Sell shows sold items & Only Purchase shows purchased items
        if (transactionScope === 'sell') return row.salesCount > 0;
        if (transactionScope === 'purchase') return row.purchaseCount > 0 || row.totalPurchasedStock > 0;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.product.name.localeCompare(b.product.name);
        if (sortBy === 'stock') return b.stock - a.stock;
        if (sortBy === 'purchaseValue') return b.totalPurchaseInclGst - a.totalPurchaseInclGst;
        if (sortBy === 'salesValue') return b.totalSalesRevenue - a.totalSalesRevenue;
        if (sortBy === 'profit') return b.totalProfitTillNow - a.totalProfitTillNow;
        if (sortBy === 'gstAccrued') return b.netGstAccruedRefundable - a.netGstAccruedRefundable;
        if (sortBy === 'utilization') return b.utilizationPercent - a.utilizationPercent;
        return 0;
      });
  }, [processedProducts, selectedCategory, searchQuery, sortBy, hasDateFilter, transactionScope]);

  // 4. Overall Purchase & GST Summary Metrics (filtered based on active search/category/date filters & transaction scope)
  const overallMetrics = useMemo(() => {
    let totalPurchaseInclGst = 0;
    let totalBaseExclGst = 0;
    let totalInputGstPaid = 0;
    let totalCreditPurchases = 0;
    let totalPaidPurchases = 0;
    let totalPurchaseBills = 0;
    let totalOutputGstCollected = 0;
    let totalSalesRevenue = 0;
    let totalSalesBase = 0;
    let totalProfit = 0;
    let totalPurchasedStock = 0;
    let totalUnitsSold = 0;
    let totalStockAvailable = 0;

    filteredProducts.forEach((item) => {
      // Purchase related
      if (transactionScope === 'both' || transactionScope === 'purchase') {
        totalPurchaseInclGst = r2(totalPurchaseInclGst + item.totalPurchaseInclGst);
        totalBaseExclGst = r2(totalBaseExclGst + item.totalBaseAmountExclGst);
        totalInputGstPaid = r2(totalInputGstPaid + item.totalInputGstPaid);
        totalCreditPurchases = r2(totalCreditPurchases + item.creditPurchaseAmount);
        totalPaidPurchases = r2(totalPaidPurchases + item.paidPurchaseAmount);
        totalPurchaseBills += item.purchaseCount;
        totalPurchasedStock += item.totalPurchasedStock;
        totalStockAvailable += item.stock;
      }
      // Sales related
      if (transactionScope === 'both' || transactionScope === 'sell') {
        totalOutputGstCollected = r2(totalOutputGstCollected + item.totalOutputGstCollected);
        totalSalesRevenue = r2(totalSalesRevenue + item.totalSalesRevenue);
        totalSalesBase = r2(totalSalesBase + item.totalSalesBase);
        totalProfit = r2(totalProfit + item.totalProfitTillNow);
        totalUnitsSold += item.totalQtySold;
      }
    });

    const totalNetRefundableGst = r2(totalInputGstPaid - totalOutputGstCollected);
    const overallUtilization = totalPurchasedStock > 0 ? (totalUnitsSold / totalPurchasedStock) * 100 : 0;

    return {
      totalPurchaseInclGst,
      totalBaseExclGst,
      totalInputGstPaid,
      totalCreditPurchases,
      totalPaidPurchases,
      totalPurchaseBills,
      totalOutputGstCollected,
      totalNetRefundableGst,
      totalSalesRevenue,
      totalSalesBase,
      totalProfit,
      totalPurchasedStock,
      totalUnitsSold,
      totalStockAvailable,
      overallUtilization,
    };
  }, [filteredProducts, transactionScope]);

  // Rows formatted for GST Export CSV
  const gstReportRows: GstReportRow[] = useMemo(() => {
    return filteredProducts.map((p) => ({
      productName: p.product.name,
      category: p.product.category,
      barcode: p.product.barcode,
      unit: p.product.unit,
      gstRate: p.gstRate,
      totalPurchasedStock: p.totalPurchasedStock,
      totalQtySold: p.totalQtySold,
      availableStock: p.stock,
      totalInputGstPaid: p.totalInputGstPaid,
      totalOutputGstCollected: p.totalOutputGstCollected,
      netRefundableGst: p.netGstAccruedRefundable,
      inputCgst: p.inputCgst,
      inputSgst: p.inputSgst,
      outputCgst: p.outputCgst,
      outputSgst: p.outputSgst,
    }));
  }, [filteredProducts]);

  // Details for selected product in Utilize Modal
  const selectedUtilizeData = useMemo(() => {
    if (!utilizeProduct) return null;
    return processedProducts.find((p) => p.product.id === utilizeProduct.id) || null;
  }, [utilizeProduct, processedProducts]);

  // Filtered sales items inside Utilize Modal
  const filteredUtilizeSales = useMemo(() => {
    if (!selectedUtilizeData) return [];
    const q = utilizeSearch.toLowerCase().trim();
    if (!q) return selectedUtilizeData.salesItems;
    return selectedUtilizeData.salesItems.filter(
      (item) =>
        (item.invoiceNo || '').toLowerCase().includes(q) ||
        (item.customerName || '').toLowerCase().includes(q) ||
        (item.cashierName || '').toLowerCase().includes(q) ||
        (item.paymentMode || '').toLowerCase().includes(q)
    );
  }, [selectedUtilizeData, utilizeSearch]);

  const handleInspectInvoice = (saleItem: SaleTransactionItem) => {
    if (!onViewInvoice) return;
    const inv: CompleteInvoice = {
      saleId: saleItem.saleId,
      invoiceNo: saleItem.invoiceNo,
      saleDate: saleItem.saleDate,
      customerName: saleItem.customerName || 'Walk-in Customer',
      paymentMode: saleItem.paymentMode,
      items: [
        {
          productId: saleItem.productId,
          productName: saleItem.productName,
          barcode: saleItem.barcode,
          quantity: saleItem.quantity,
          unitType: saleItem.unitType,
          purchasePrice: saleItem.costPrice,
          sellingPriceWD: saleItem.sellingPriceWD,
          gstPercent: saleItem.gstPercent,
          cgstPercent: saleItem.cgstPercent,
          sgstPercent: saleItem.sgstPercent,
          cgstAmount: saleItem.cgstAmount,
          sgstAmount: saleItem.sgstAmount,
          totalGstAmount: saleItem.totalGstAmount,
          barcodeMode: saleItem.barcodeMode,
          saleType: saleItem.saleType,
          measuredWeightText: saleItem.measuredWeightText,
          packetBarcode: saleItem.packetBarcode,
          sellingPrice: saleItem.sellingPrice,
          lineTotal: saleItem.lineTotal,
        },
      ],
      baseAmount: saleItem.baseAmount || saleItem.lineTotal,
      totalGst: saleItem.totalGstAmount || 0,
      cgstAmount: saleItem.cgstAmount || 0,
      sgstAmount: saleItem.sgstAmount || 0,
      subtotal: saleItem.lineTotal,
      discount: 0,
      grandTotal: saleItem.lineTotal,
      cashier: saleItem.cashierName || 'Society Administrator',
      tenderedCash: saleItem.paymentMode === 'CASH' ? saleItem.lineTotal : undefined,
      changeDue: 0,
    };
    setUtilizeProduct(null);
    onViewInvoice(inv);
  };

  // Filtered separate purchase transactions (respects category, date, search, entry type)
  const filteredPurchaseTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activePurchaseTransactions.filter((tx) => {
      if (selectedCategory !== 'All Items' && tx.category !== selectedCategory) return false;
      if (purchaseEntryFilter !== 'ALL' && tx.entryType !== purchaseEntryFilter) return false;
      const txDateStr = extractDatePart(tx.purchaseDate);
      if (txDateStr) {
        if (startDate && txDateStr < startDate) return false;
        if (endDate && txDateStr > endDate) return false;
      } else if (hasDateFilter) {
        return false;
      }
      if (q) {
        const hay = `${tx.productName} ${tx.purchaseRef} ${tx.barcode} ${tx.category} ${tx.supplierName || ''} ${tx.supplierInvoiceNo || ''} ${tx.supplierNote || ''} ${tx.performedBy}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activePurchaseTransactions, selectedCategory, purchaseEntryFilter, startDate, endDate, hasDateFilter, searchQuery]);

  const purchaseTxTotals = useMemo(() => {
    return filteredPurchaseTransactions.reduce(
      (acc, tx) => {
        const txGst = Number(tx.totalGstAmount || 0);
        const txBase =
          Number(tx.baseAmount || 0) > 0
            ? Number(tx.baseAmount || 0)
            : Math.max(0, Number(tx.totalAmount || 0) - txGst);
        const txTot = r2(txBase + txGst);
        acc.totalQty = Number((acc.totalQty + Number(tx.addedQuantity || 0)).toFixed(3));
        acc.totalBase = r2(acc.totalBase + txBase);
        acc.totalGst = r2(acc.totalGst + txGst);
        acc.totalAmt = r2(acc.totalAmt + txTot);
        if (resolvePaymentStatus(tx.paymentStatus) === 'CREDIT') {
          acc.creditAmt = r2(acc.creditAmt + txTot);
        } else {
          acc.paidAmt = r2(acc.paidAmt + txTot);
        }
        return acc;
      },
      { totalQty: 0, totalBase: 0, totalGst: 0, totalAmt: 0, creditAmt: 0, paidAmt: 0 }
    );
  }, [filteredPurchaseTransactions]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 print-container">
      {/* View Switcher Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveView('summary')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'summary'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 text-emerald-600" />
            <span>Product Purchase &amp; Profit Summary</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('transactions')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'transactions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-teal-600" />
            <span>Separate Purchase Transactions ({filteredPurchaseTransactions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('gst_refund')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeView === 'gst_refund'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-amber-600" />
            <span>GST Credit / Refund Statement</span>
          </button>
        </div>

        {activeView === 'transactions' && (
          <button
            type="button"
            onClick={() => exportPurchaseTransactionsToCsv(filteredPurchaseTransactions)}
            disabled={filteredPurchaseTransactions.length === 0}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Purchase Log CSV</span>
          </button>
        )}
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by product name, barcode, ref or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="All Items">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {selectedCategory !== 'All Items' && (
              <button
                onClick={() => setSelectedCategory('All Items')}
                className="p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors ml-0.5"
                title="Clear Category Filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Transaction Scope Filter (Sell & Purchase, Only Purchase, Only Sell) */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
            <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={transactionScope}
              onChange={(e) => setTransactionScope(e.target.value as 'both' | 'purchase' | 'sell')}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="both">View: Sell & Purchase</option>
              <option value="purchase">View: Only Purchase</option>
              <option value="sell">View: Only Sell</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Date: All Time</option>
              <option value="today">Date: Today</option>
              <option value="this_month">Date: This Month</option>
              <option value="custom">Date: Custom Range</option>
            </select>

            {(datePreset === 'custom' || startDate || endDate) && (
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="bg-white border border-slate-200 text-[11px] font-mono-code font-bold text-slate-700 px-1.5 py-0.5 rounded outline-none focus:border-emerald-500 cursor-pointer"
                  title="Start Date"
                />
                <span className="text-[10px] text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="bg-white border border-slate-200 text-[11px] font-mono-code font-bold text-slate-700 px-1.5 py-0.5 rounded outline-none focus:border-emerald-500 cursor-pointer"
                  title="End Date"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => handlePresetChange('all')}
                    className="p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors"
                    title="Clear Date Filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="purchaseValue">Sort: Highest Purchase Value</option>
              <option value="salesValue">Sort: Highest Sales Revenue</option>
              <option value="profit">Sort: Highest Profit Amount</option>
              <option value="gstAccrued">Sort: Highest Refundable GST</option>
              <option value="utilization">Sort: Highest Utilization %</option>
              <option value="stock">Sort: Available Stock</option>
              <option value="name">Sort: Product Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* VIEW 1: Main Purchase & Profit Table */}
      {activeView === 'summary' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-[9.5px] font-black text-slate-600 uppercase tracking-tight whitespace-nowrap">
                    Product
                  </th>
                  {(transactionScope === 'both' || transactionScope === 'purchase') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-slate-700 uppercase tracking-tight text-center whitespace-nowrap bg-emerald-50/60 border-x border-slate-200/60">
                      Purchased Stock
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'purchase') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-slate-600 uppercase tracking-tight text-right whitespace-nowrap">
                      Purchase (Incl. GST)
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'purchase') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-slate-600 uppercase tracking-tight text-right whitespace-nowrap">
                      Base (Excl. GST)
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'purchase') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-amber-800 uppercase tracking-tight text-right whitespace-nowrap bg-amber-50/70 border-x border-amber-200/60">
                      Total GST Paid
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'sell') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-cyan-800 uppercase tracking-tight text-right whitespace-nowrap bg-cyan-50/70 border-r border-cyan-200/60">
                      Total GST Received
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'sell') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-slate-600 uppercase tracking-tight text-right whitespace-nowrap">
                      Sales Revenue
                    </th>
                  )}
                  {(transactionScope === 'both' || transactionScope === 'sell') && (
                    <th className="py-2.5 px-2 text-[9.5px] font-black text-slate-800 uppercase tracking-tight text-right whitespace-nowrap bg-emerald-100/60 border-x border-emerald-200">
                      Profit Till Now
                    </th>
                  )}
                  <th className="py-2.5 px-3 text-[9.5px] font-black text-slate-600 uppercase tracking-tight text-center whitespace-nowrap print:hidden">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((row) => (
                  <tr key={row.product.id} className="group hover:bg-emerald-50/30 transition-all duration-150">
                    {/* Product Info */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 border border-slate-200">
                          <Box className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs group-hover:text-emerald-700 transition-colors truncate max-w-[140px]">
                            {row.product.name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[8.5px] font-bold text-slate-500 bg-slate-100 px-1 py-0.1 rounded shrink-0">
                              {row.product.category}
                            </span>
                            <span className="text-[8.5px] font-mono-code text-slate-400 truncate max-w-[70px]">
                              #{row.product.barcode}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Total Purchased Stock */}
                    {(transactionScope === 'both' || transactionScope === 'purchase') && (
                      <td className="py-2.5 px-2 text-center bg-emerald-50/30 border-x border-slate-200/60">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-[10.5px] font-extrabold font-mono-code text-slate-900 bg-emerald-100/80 border border-emerald-300 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                            {row.totalPurchasedStock.toFixed(2)} {row.product.unit}
                          </span>
                          <span className="text-[8.5px] font-bold text-slate-600 mt-0.5 whitespace-nowrap">
                            Sold: {row.totalQtySold.toFixed(1)} | Avail: <span className={row.stock <= row.product.minStockLevel ? 'text-rose-600 font-black' : 'text-slate-900 font-extrabold'}>{row.stock.toFixed(1)}</span>
                            {row.stock <= row.product.minStockLevel && <span className="text-rose-600 font-black ml-1">(Low)</span>}
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Total Purchase Amount (Incl. GST) */}
                    {(transactionScope === 'both' || transactionScope === 'purchase') && (
                      <td className="py-2.5 px-2 text-right">
                        <div className="text-[11.5px] font-extrabold text-slate-900 font-mono-code whitespace-nowrap">
                          ₹{row.totalPurchaseInclGst.toFixed(2)}
                        </div>
                        <span className="text-[8.5px] text-slate-400 font-mono-code whitespace-nowrap block">
                          @ ₹{row.unitPurchaseWithGst.toFixed(2)} WT / {row.product.unit}
                        </span>
                        {row.purchaseCount > 0 ? (
                          <span className="text-[8.5px] font-bold font-mono-code whitespace-nowrap block mt-0.5 text-slate-500">
                            {row.purchaseCount} {row.purchaseCount === 1 ? 'bill' : 'bills'}
                            {row.creditPurchaseAmount > 0 && (
                              <span className="text-amber-700 ml-1">
                                · Cr. ₹{row.creditPurchaseAmount.toFixed(2)}
                              </span>
                            )}
                          </span>
                        ) : row.isEstimatedFromCatalog ? (
                          <span className="text-[8px] font-semibold text-slate-400 whitespace-nowrap block">
                            Opening catalog est.
                          </span>
                        ) : null}
                      </td>
                    )}

                    {/* Actual Product Amount (Without GST) */}
                    {(transactionScope === 'both' || transactionScope === 'purchase') && (
                      <td className="py-2.5 px-2 text-right">
                        <div className="text-[11.5px] font-bold text-slate-800 font-mono-code whitespace-nowrap">
                          ₹{row.totalBaseAmountExclGst.toFixed(2)}
                        </div>
                        <span className="text-[8.5px] text-slate-400 font-mono-code whitespace-nowrap block">
                          WD GST ₹{row.unitBaseAmount.toFixed(2)}
                        </span>
                      </td>
                    )}

                    {/* Total GST Paid */}
                    {(transactionScope === 'both' || transactionScope === 'purchase') && (
                      <td className="py-2.5 px-2 text-right bg-amber-50/40 border-x border-amber-200/60">
                        <div className="text-[11.5px] font-black text-amber-900 font-mono-code whitespace-nowrap">
                          ₹{row.totalInputGstPaid.toFixed(2)}
                        </div>
                        <span className="text-[8.5px] text-amber-700 font-bold font-mono-code whitespace-nowrap block">
                          {row.gstRate}% GST (C: {row.halfGstRate}%, S: {row.halfGstRate}%)
                        </span>
                      </td>
                    )}

                    {/* Total GST Received */}
                    {(transactionScope === 'both' || transactionScope === 'sell') && (
                      <td className="py-2.5 px-2 text-right bg-cyan-50/40 border-r border-cyan-200/60">
                        <div className="text-[11.5px] font-black text-cyan-900 font-mono-code whitespace-nowrap">
                          ₹{row.totalOutputGstCollected.toFixed(2)}
                        </div>
                        <span className="text-[8.5px] text-cyan-700 font-bold font-mono-code whitespace-nowrap block">
                          From {row.totalQtySold.toFixed(1)} {row.product.unit} sold
                        </span>
                      </td>
                    )}

                    {/* Sales Revenue */}
                    {(transactionScope === 'both' || transactionScope === 'sell') && (
                      <td className="py-2.5 px-2 text-right">
                        <div className="text-[11.5px] font-extrabold text-slate-900 font-mono-code whitespace-nowrap">
                          ₹{row.totalSalesRevenue.toFixed(2)}
                        </div>
                        <span className="text-[8.5px] text-slate-500 font-mono-code block whitespace-nowrap">
                          {row.salesCount} transactions
                        </span>
                      </td>
                    )}

                    {/* Total Profit Amount Till Now */}
                    {(transactionScope === 'both' || transactionScope === 'sell') && (
                      <td className="py-2.5 px-2 text-right bg-emerald-100/30 border-x border-emerald-200/80">
                        <div className={`text-[11.5px] font-black font-mono-code whitespace-nowrap ${
                          row.totalProfitTillNow >= 0 ? 'text-emerald-800' : 'text-rose-700'
                        }`}>
                          ₹{row.totalProfitTillNow.toFixed(2)}
                        </div>
                      </td>
                    )}

                    {/* Action: Utilize Button */}
                    <td className="py-2.5 px-3 text-center print:hidden">
                      <button
                        onClick={() => setUtilizeProduct(row.product)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 whitespace-nowrap"
                        title="View all selling utilization details against this product"
                      >
                        <PieChart className="w-3 h-3" />
                        <span>Utilize</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <Box className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">No products matched your search filter.</p>
            </div>
          )}

          {/* BOTTOM SUMMARY ROW & PRINT BUTTON */}
          {filteredProducts.length > 0 && (
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-6 text-xs font-mono-code">
                {(transactionScope === 'both' || transactionScope === 'purchase') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Purchase (Incl. GST)</span>
                    <span className="text-base font-black text-white">₹{overallMetrics.totalPurchaseInclGst.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'purchase') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Base (Excl. GST)</span>
                    <span className="text-base font-black text-slate-200">₹{overallMetrics.totalBaseExclGst.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'purchase') && overallMetrics.totalCreditPurchases > 0 && (
                  <div>
                    <span className="text-[10px] text-amber-300/90 block uppercase font-sans font-bold">On Credit (Sundry Cr.)</span>
                    <span className="text-base font-black text-amber-300">₹{overallMetrics.totalCreditPurchases.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'sell') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Sales Revenue</span>
                    <span className="text-base font-black text-cyan-300">₹{overallMetrics.totalSalesRevenue.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'sell') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Profit Till Now</span>
                    <span className="text-base font-black text-emerald-400">₹{overallMetrics.totalProfit.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'purchase') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total GST Paid</span>
                    <span className="text-base font-black text-amber-300">₹{overallMetrics.totalInputGstPaid.toFixed(2)}</span>
                  </div>
                )}
                {(transactionScope === 'both' || transactionScope === 'sell') && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total GST Received</span>
                    <span className="text-base font-black text-teal-300">₹{overallMetrics.totalOutputGstCollected.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 print:hidden">
                <button
                  onClick={() => {
                    const reportData = filteredProducts.map((p) => ({
                      productName: p.product.name,
                      category: p.product.category,
                      barcode: p.product.barcode,
                      unit: p.product.unit,
                      totalPurchasedStock: p.totalPurchasedStock,
                      totalQtySold: p.totalQtySold,
                      availableStock: p.stock,
                      totalPurchaseInclGst: p.totalPurchaseInclGst,
                      totalBaseAmountExclGst: p.totalBaseAmountExclGst,
                      rawPurchasePrice: p.unitPurchaseWithGst,
                      unitBaseAmount: p.unitBaseAmount,
                      gstRate: p.gstRate,
                      totalInputGstPaid: p.totalInputGstPaid,
                      totalOutputGstCollected: p.totalOutputGstCollected,
                      totalSalesRevenue: p.totalSalesRevenue,
                      totalProfitTillNow: p.totalProfitTillNow,
                      profitMarginPercent: p.profitMarginPercent,
                    }));
                    exportPurchaseSummaryToCsv(reportData);
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                  title="Download Purchase Summary as Excel / CSV file"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Summary</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: Separate Purchase Transactions Log */}
      {activeView === 'transactions' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span>Individual Purchase &amp; Stock Fill Ledger ({filteredPurchaseTransactions.length} entries)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every new product addition and existing product stock fill is recorded as a separate purchase transaction.
              </p>
            </div>
            <select
              value={purchaseEntryFilter}
              onChange={(e) => setPurchaseEntryFilter(e.target.value as 'ALL' | PurchaseEntryType)}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-700 outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Types ({purchaseTransactions.length})</option>
              <option value="NEW_PRODUCT">New Product Additions</option>
              <option value="FILL_EXISTING">Fill Existing Stock</option>
              <option value="QUICK_RESTOCK">Quick Stock Restocks</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-600 uppercase">
                <tr>
                  <th className="py-3 px-4">Purchase Ref &amp; Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4 text-center">Stock Fill</th>
                  <th className="py-3 px-4 text-right">Unit Rate</th>
                  <th className="py-3 px-4 text-right">Base Amount</th>
                  <th className="py-3 px-4 text-right">Input GST</th>
                  <th className="py-3 px-4 text-right">Total Purchase</th>
                  <th className="py-3 px-4 text-center">Mode of Payment</th>
                  <th className="py-3 px-4">Entered By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchaseTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-14 text-center text-slate-400">
                      <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-slate-600 text-sm">No purchase transactions match current filters.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Add a new product or use &quot;Fill / Add Existing Product&quot; inside Inventory to record purchases.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPurchaseTransactions.map((tx) => {
                    const badgeClass =
                      tx.entryType === 'NEW_PRODUCT'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : tx.entryType === 'QUICK_RESTOCK'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-teal-100 text-teal-800 border-teal-200';
                    const typeLabel =
                      tx.entryType === 'NEW_PRODUCT'
                        ? 'NEW PRODUCT'
                        : tx.entryType === 'QUICK_RESTOCK'
                        ? 'QUICK RESTOCK'
                        : 'FILL EXISTING';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="font-mono-code font-bold text-slate-900">{tx.purchaseRef}</div>
                          <div className="text-[10.5px] font-mono-code text-slate-500">{tx.purchaseDate}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[9.5px] font-bold font-mono-code border ${badgeClass}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{tx.productName}</div>
                          <div className="text-[10px] font-mono-code text-slate-500">
                            {tx.category} · #{tx.barcode} {tx.batchNo ? `· Batch ${tx.batchNo}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono-code">
                          <div className="font-black text-teal-700">
                            +{tx.addedQuantity} {tx.unit}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {tx.previousStock} → <strong className="text-slate-900">{tx.newStock}</strong>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-code text-slate-700">
                          ₹{Number(tx.purchasePrice || 0).toFixed(2)}/{tx.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-code text-slate-800 font-semibold">
                          ₹{(() => {
                            const gst = Number(tx.totalGstAmount || 0);
                            const base = Number(tx.baseAmount || 0) > 0 ? Number(tx.baseAmount || 0) : Math.max(0, Number(tx.totalAmount || 0) - gst);
                            return base.toFixed(2);
                          })()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-code text-amber-800 font-semibold">
                          ₹{Number(tx.totalGstAmount || 0).toFixed(2)}
                          <span className="block text-[9.5px] text-slate-400">{tx.gstPercent}%</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-code font-black text-slate-900">
                          ₹{(() => {
                            const gst = Number(tx.totalGstAmount || 0);
                            const base = Number(tx.baseAmount || 0) > 0 ? Number(tx.baseAmount || 0) : Math.max(0, Number(tx.totalAmount || 0) - gst);
                            return r2(base + gst).toFixed(2);
                          })()}
                        </td>
                        <td className="py-2.5 px-4 text-center whitespace-nowrap">
                          {(() => {
                            const payMode = resolvePaymentStatus(tx.paymentStatus);
                            if (payMode === 'CREDIT') {
                              return (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wide">
                                  Sundry Creditor (Credit)
                                </span>
                              );
                            }
                            if (payMode === 'CASH') {
                              return (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase tracking-wide">
                                  Cash
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-black uppercase tracking-wide">
                                Bank / NEFT / UPI
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-700">
                          {tx.performedBy}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPurchaseTransactions.length > 0 && (
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-6 text-xs font-mono-code">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Transactions</span>
                  <span className="text-base font-black text-white">{filteredPurchaseTransactions.length}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Base Purchase</span>
                  <span className="text-base font-black text-slate-200">₹{purchaseTxTotals.totalBase.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Input GST</span>
                  <span className="text-base font-black text-amber-300">₹{purchaseTxTotals.totalGst.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Total Purchase Value</span>
                  <span className="text-base font-black text-teal-300">₹{purchaseTxTotals.totalAmt.toFixed(2)}</span>
                </div>
                {purchaseTxTotals.creditAmt > 0 && (
                  <div>
                    <span className="text-[10px] text-amber-300/90 block uppercase font-sans font-bold">On Credit (Sundry Cr.)</span>
                    <span className="text-base font-black text-amber-300">₹{purchaseTxTotals.creditAmt.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => exportPurchaseTransactionsToCsv(filteredPurchaseTransactions)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Download Purchase Log CSV</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Consolidated Separate Report for Refundable GST After Selling */}
      {activeView === 'gst_refund' && (
        <div className="space-y-6">
          {/* Summary Explanation Banner */}
          <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-emerald-900 text-white rounded-3xl p-6 shadow-xl border border-teal-800/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-teal-300" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Consolidated GST Refund & Input Tax Credit (ITC) Statement</h3>
                  <p className="text-xs text-teal-200/80 mt-0.5">
                    Official tax credit position: Input GST paid on purchases vs. Output GST collected from sales
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  Print Statement
                </button>
              </div>
            </div>

            {/* Refundable GST Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-teal-800/40">
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-teal-700/30 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  (A) Total Input GST Paid (Purchase)
                </span>
                <div className="text-xl font-black text-amber-300 font-mono-code">
                  ₹{overallMetrics.totalInputGstPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono-code pt-1">
                  <span>Input CGST: ₹{(overallMetrics.totalInputGstPaid / 2).toFixed(2)}</span>
                  <span>Input SGST: ₹{(overallMetrics.totalInputGstPaid / 2).toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-2xl border border-teal-700/30 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  (B) Total Output GST Collected (Sales)
                </span>
                <div className="text-xl font-black text-cyan-300 font-mono-code">
                  ₹{overallMetrics.totalOutputGstCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono-code pt-1">
                  <span>Output CGST: ₹{(overallMetrics.totalOutputGstCollected / 2).toFixed(2)}</span>
                  <span>Output SGST: ₹{(overallMetrics.totalOutputGstCollected / 2).toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-teal-950/90 p-4 rounded-2xl border border-teal-500/40 space-y-1 col-span-1 sm:col-span-2">
                <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest block flex items-center justify-between">
                  <span>(A - B) Net Refundable GST Balance (Input Tax Credit)</span>
                  <span className="bg-teal-500/20 text-teal-200 border border-teal-400/30 text-[9px] px-2 py-0.5 rounded font-mono-code">
                    {overallMetrics.totalNetRefundableGst >= 0 ? 'ELIGIBLE REFUND / CREDIT' : 'NET TAX PAYABLE'}
                  </span>
                </span>
                <div className={`text-2xl font-black font-mono-code ${
                  overallMetrics.totalNetRefundableGst >= 0 ? 'text-teal-300' : 'text-amber-300'
                }`}>
                  ₹{overallMetrics.totalNetRefundableGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex justify-between text-[11px] text-teal-100/90 font-mono-code font-bold pt-1">
                  <span>CGST Refundable: ₹{(overallMetrics.totalNetRefundableGst / 2).toFixed(2)}</span>
                  <span>SGST Refundable: ₹{(overallMetrics.totalNetRefundableGst / 2).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Consolidated Product GST Ledger Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Product-wise GST Input vs. Output Tax Credit Reconciliation Ledger</span>
              </h4>
              <span className="text-xs font-bold text-slate-500 font-mono-code">
                Showing {filteredProducts.length} items
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-[9.5px] font-black text-slate-600 uppercase tracking-tight">
                  <tr>
                    <th className="py-2.5 px-3">Product & Category</th>
                    <th className="py-2.5 px-2 text-center">GST Rate</th>
                    <th className="py-2.5 px-2 text-center">Purchased / Sold Qty</th>
                    {(transactionScope === 'both' || transactionScope === 'purchase') && (
                      <th className="py-2.5 px-2 text-right bg-amber-50/70 text-amber-900 font-black">
                        Total GST Paid
                      </th>
                    )}
                    {(transactionScope === 'both' || transactionScope === 'sell') && (
                      <th className="py-2.5 px-2 text-right bg-cyan-50/70 text-cyan-900 font-black">
                        Total GST Received
                      </th>
                    )}
                    <th className="py-2.5 px-2 text-right">CGST Balance</th>
                    <th className="py-2.5 px-2 text-right">SGST Balance</th>
                    <th className="py-2.5 px-3 text-center">Tax Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProducts.map((row) => (
                    <tr key={`gst-row-${row.product.id}`} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900">
                        <div className="text-xs truncate max-w-[160px]">{row.product.name}</div>
                        <div className="text-[8.5px] font-normal text-slate-500 font-mono-code">
                          {row.product.category} · #{row.product.barcode}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center">
                        <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 font-mono-code font-bold text-slate-800 rounded text-[10px]">
                          {row.gstRate}%
                        </span>
                      </td>

                      <td className="py-2 px-2 text-center font-mono-code text-[10.5px]">
                        <span className="font-bold text-slate-900">{row.totalPurchasedStock.toFixed(1)}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-emerald-700 font-bold">{row.totalQtySold.toFixed(1)}</span>
                        <span className="text-slate-500 text-[9px] block">{row.product.unit}</span>
                      </td>

                      {(transactionScope === 'both' || transactionScope === 'purchase') && (
                        <td className="py-2 px-2 text-right font-mono-code font-bold text-amber-800 bg-amber-50/20 text-[11px]">
                          ₹{row.totalInputGstPaid.toFixed(2)}
                        </td>
                      )}

                      {(transactionScope === 'both' || transactionScope === 'sell') && (
                        <td className="py-2 px-2 text-right font-mono-code font-bold text-cyan-800 bg-cyan-50/20 text-[11px]">
                          ₹{row.totalOutputGstCollected.toFixed(2)}
                        </td>
                      )}

                      <td className="py-2 px-2 text-right font-mono-code text-slate-700 text-[10.5px]">
                        ₹{row.netCgstRefundable.toFixed(2)}
                      </td>

                      <td className="py-2 px-2 text-right font-mono-code text-slate-700 text-[10.5px]">
                        ₹{row.netSgstRefundable.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {row.netGstAccruedRefundable > 0 ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-bold text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Refundable
                          </span>
                        ) : row.netGstAccruedRefundable < 0 ? (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full font-bold text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-amber-700" />
                            Payable
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full font-bold text-[10px] uppercase tracking-wider">
                            Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UTILIZE MODAL: Selling Details & Stock Utilization Against Selected Product */}
      {/* ========================================================================= */}
      {selectedUtilizeData && utilizeProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
                  <PieChart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                    <span>Product Utilization: {selectedUtilizeData.product.name}</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono-code font-bold">
                      #{selectedUtilizeData.product.barcode}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Complete sales log, selling price breakdowns & inventory utilization
                  </p>
                </div>
              </div>

              <button
                onClick={() => setUtilizeProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Product Utilization Stat Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Purchased Qty</span>
                  <div className="text-base font-black text-slate-900 font-mono-code">
                    {selectedUtilizeData.totalPurchasedStock.toFixed(2)} {selectedUtilizeData.product.unit}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Purchase (Incl. GST)</span>
                  <div className="text-base font-black text-slate-900 font-mono-code">
                    ₹{selectedUtilizeData.totalPurchaseInclGst.toFixed(2)}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Available Stock</span>
                  <div className="text-base font-black text-slate-900 font-mono-code">
                    {selectedUtilizeData.stock.toFixed(2)} {selectedUtilizeData.product.unit}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Units Sold</span>
                  <div className="text-base font-black text-emerald-700 font-mono-code">
                    {selectedUtilizeData.totalQtySold.toFixed(2)} {selectedUtilizeData.product.unit}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Sales Generated</span>
                  <div className="text-base font-black text-cyan-800 font-mono-code">
                    ₹{selectedUtilizeData.totalSalesRevenue.toFixed(2)}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Profit Amount Till Now</span>
                  <div className={`text-base font-black font-mono-code ${
                    selectedUtilizeData.totalProfitTillNow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    ₹{selectedUtilizeData.totalProfitTillNow.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Progress Bar Gauge */}
              <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Inventory Utilization Progress</span>
                  </span>
                  <span className="font-mono-code text-sm">
                    {selectedUtilizeData.utilizationPercent.toFixed(1)}% Utilized
                  </span>
                </div>

                <div className="w-full h-3 bg-emerald-200/80 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, selectedUtilizeData.utilizationPercent)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[10px] text-emerald-800 font-mono-code">
                  <span>Sold: {selectedUtilizeData.totalQtySold.toFixed(2)} {selectedUtilizeData.product.unit}</span>
                  <span>In Stock: {selectedUtilizeData.stock.toFixed(2)} {selectedUtilizeData.product.unit}</span>
                </div>
              </div>

              {/* Recorded Purchase Bills Breakdown */}
              {selectedUtilizeData.purchaseItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-teal-600" />
                    <span>Recorded Purchase Bills ({selectedUtilizeData.purchaseItems.length})</span>
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-52">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase">Ref &amp; Date</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase text-center">Qty Added</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase text-right">Rate (WD)</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase text-right">Base</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase text-right">GST</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase text-right">Total</th>
                            <th className="py-2 px-3 text-[10px] font-black text-slate-600 uppercase">Mode of Payment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {selectedUtilizeData.purchaseItems.map((tx) => {
                            const txGst = Number(tx.totalGstAmount || 0);
                            const txBase =
                              Number(tx.baseAmount || 0) > 0
                                ? Number(tx.baseAmount || 0)
                                : Math.max(0, Number(tx.totalAmount || 0) - txGst);
                            const txTot = r2(txBase + txGst);
                            return (
                              <tr key={tx.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-mono-code">
                                  <div className="font-bold text-slate-900">{tx.purchaseRef}</div>
                                  <div className="text-[10px] text-slate-500">{tx.purchaseDate}</div>
                                </td>
                                <td className="py-2 px-3 text-center font-mono-code font-bold text-teal-800">
                                  +{tx.addedQuantity} {tx.unit}
                                </td>
                                <td className="py-2 px-3 text-right font-mono-code text-slate-700">
                                  ₹{Number(tx.purchasePrice || 0).toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono-code text-slate-800">
                                  ₹{txBase.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono-code text-amber-800">
                                  ₹{txGst.toFixed(2)} ({tx.gstPercent}%)
                                </td>
                                <td className="py-2 px-3 text-right font-mono-code font-black text-slate-900">
                                  ₹{txTot.toFixed(2)}
                                </td>
                                <td className="py-2 px-3">
                                  {(() => {
                                    const payMode = resolvePaymentStatus(tx.paymentStatus);
                                    return (
                                      <span
                                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                                          payMode === 'CREDIT'
                                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                                            : payMode === 'CASH'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                            : 'bg-sky-100 text-sky-800 border-sky-200'
                                        }`}
                                      >
                                        {payMode === 'CREDIT'
                                          ? 'Sundry Creditor (Credit)'
                                          : payMode === 'CASH'
                                          ? 'Cash'
                                          : 'Bank / NEFT / UPI'}
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Search & Transaction Log Header */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Selling Details & Transaction Log ({filteredUtilizeSales.length} Sales)</span>
                </h4>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by Invoice, Customer or Cashier..."
                    value={utilizeSearch}
                    onChange={(e) => setUtilizeSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Transaction Detail Log Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase">Invoice No</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase">Date & Time</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase">Customer</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase text-center">Sale Method</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase">Cashier</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase text-center">Qty Sold</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase text-right">Selling Price (WT GST)</th>
                        <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase text-right">Line Total</th>
                        {onViewInvoice && (
                          <th className="py-2.5 px-4 text-[10px] font-black text-slate-600 uppercase text-center">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredUtilizeSales.map((sale, idx) => (
                        <tr key={`${sale.invoiceNo}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-black text-slate-900 font-mono-code">
                            #{sale.invoiceNo}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 font-mono-code text-[11px]">
                            {sale.saleDate}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-800">
                            {sale.customerName || 'Walk-in Customer'}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {sale.barcodeMode === 'WITHOUT_BARCODE' || sale.saleType === 'DIRECT_LOOSE' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                ⚖️ Loose (No Barcode)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                🏷️ Barcode
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {sale.cashierName || 'Subrata Roy'}
                          </td>
                          <td className="py-2.5 px-4 text-center font-bold text-emerald-800 font-mono-code">
                            {sale.quantity} {sale.unitType}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-code text-slate-700">
                            ₹{sale.sellingPrice.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-slate-900 font-mono-code">
                            ₹{sale.lineTotal.toFixed(2)}
                          </td>
                          {onViewInvoice && (
                            <td className="py-2.5 px-4 text-center">
                              <button
                                onClick={() => handleInspectInvoice(sale)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold transition-all"
                              >
                                View Invoice
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredUtilizeSales.length === 0 && (
                  <div className="py-10 text-center text-slate-400 space-y-1">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-500">No sales transactions recorded for this product yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs font-mono-code font-bold text-slate-600">
                Total Revenue Generated: <span className="text-emerald-800 font-black text-sm">₹{selectedUtilizeData.totalSalesRevenue.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setUtilizeProduct(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
