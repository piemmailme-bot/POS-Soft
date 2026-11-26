import { SaleTransactionItem, PurchaseTransaction } from '../types';
import { getIstDateStr } from './dateUtils';

export function exportLedgerToCsv(ledger: SaleTransactionItem[], societyName = 'Deganga CADPFSCS Ltd'): void {
  // Title row
  const titleRow = `Sales Transaction Ledger (Stock Output),,,,,,,,,,,,`;
  
  // Header row matching schema with sale_mode (With Barcode vs Without Barcode)
  const headers = [
    'sale_item_id',
    'sale_id',
    'invoice_no',
    'sale_date',
    'member_no / Customer',
    'payment_mode',
    'sale_mode',
    'product_id',
    'product_name',
    'barcode',
    'quantity',
    'unit_type',
    'selling_price',
    'line_total'
  ].join(',');

  // Data rows
  const rows = ledger.map(item => {
    const pName = (item.productName || '').replace(/"/g, '""');
    const cName = (item.customerName || '').replace(/"/g, '""');
    const invNo = (item.invoiceNo || '');
    const sDate = (item.saleDate || '');
    const barcode = (item.barcode || '');
    const qty = Number(item.quantity || 0).toFixed(3);
    const sp = Number(item.sellingPrice || 0).toFixed(2);
    const lt = Number(item.lineTotal || 0).toFixed(2);
    const saleMode = item.barcodeMode === 'WITHOUT_BARCODE'
      ? 'Without Barcode (Direct Loose)'
      : 'With Barcode';

    return [
      item.saleItemId || '',
      item.saleId || '',
      `"${invNo}"`,
      `"${sDate}"`,
      `"${cName}"`,
      item.paymentMode || 'UPI',
      `"${saleMode}"`,
      item.productId || '',
      `"${pName}"`,
      `"${barcode}"`,
      qty,
      item.unitType || 'PCS',
      `₹${sp}`,
      `₹${lt}`
    ].join(',');
  });

  const csvContent = [titleRow, headers, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${societyName.replace(/\s+/g, '_')}_Sales_Ledger_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface GstReportRow {
  productName: string;
  category: string;
  barcode: string;
  unit: string;
  gstRate: number;
  totalPurchasedStock: number;
  totalQtySold: number;
  availableStock: number;
  totalInputGstPaid: number;
  totalOutputGstCollected: number;
  netRefundableGst: number;
  inputCgst: number;
  inputSgst: number;
  outputCgst: number;
  outputSgst: number;
}

export function exportGstRefundReportToCsv(gstRows: GstReportRow[], societyName = 'Deganga CADPFSCS Ltd'): void {
  const titleRow = `Consolidated GST Refund & Input Tax Credit (ITC) Report - ${societyName},,,,,,,,,,,`;
  const headers = [
    'Product Name',
    'Category',
    'Barcode',
    'GST Rate (%)',
    'Total Purchased Stock',
    'Qty Sold',
    'Available Stock',
    'Total Input GST Paid (A)',
    'Input CGST',
    'Input SGST',
    'Total Output GST Collected (B)',
    'Output CGST',
    'Output SGST',
    'Net Refundable GST (A - B)',
    'Status'
  ].join(',');

  const rows = gstRows.map((r) => {
    const pName = r.productName.replace(/"/g, '""');
    const cat = r.category.replace(/"/g, '""');
    const status = r.netRefundableGst > 0 ? 'Refundable ITC Balance' : r.netRefundableGst < 0 ? 'Tax Payable to Govt' : 'Settled';

    return [
      `"${pName}"`,
      `"${cat}"`,
      `"${r.barcode}"`,
      `${r.gstRate}%`,
      `${r.totalPurchasedStock.toFixed(2)} ${r.unit}`,
      `${r.totalQtySold.toFixed(2)} ${r.unit}`,
      `${r.availableStock.toFixed(2)} ${r.unit}`,
      `₹${r.totalInputGstPaid.toFixed(2)}`,
      `₹${r.inputCgst.toFixed(2)}`,
      `₹${r.inputSgst.toFixed(2)}`,
      `₹${r.totalOutputGstCollected.toFixed(2)}`,
      `₹${r.outputCgst.toFixed(2)}`,
      `₹${r.outputSgst.toFixed(2)}`,
      `₹${r.netRefundableGst.toFixed(2)}`,
      `"${status}"`
    ].join(',');
  });

  const csvContent = [titleRow, headers, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${societyName.replace(/\s+/g, '_')}_GST_Refund_Report_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PurchaseSummaryRow {
  productName: string;
  category: string;
  barcode: string;
  unit: string;
  totalPurchasedStock: number;
  totalQtySold: number;
  availableStock: number;
  totalPurchaseInclGst: number;
  totalBaseAmountExclGst: number;
  rawPurchasePrice: number;
  unitBaseAmount: number;
  gstRate: number;
  totalInputGstPaid: number;
  totalOutputGstCollected: number;
  totalSalesRevenue: number;
  totalProfitTillNow: number;
  profitMarginPercent: number;
}

export function exportPurchaseSummaryToCsv(rows: PurchaseSummaryRow[], societyName = 'Deganga CADPFSCS Ltd'): void {
  const titleRow = `Purchase & GST Summary Report - ${societyName},,,,,,,,,`;
  const headers = [
    'Product Name',
    'Category',
    'Barcode',
    'Unit',
    'Purchased Stock',
    'Sold Qty',
    'Available Stock',
    'Purchase Price (Incl GST)',
    'Purchase Base (Excl GST)',
    'Total Purchase (Incl GST)',
    'Total Base (Excl GST)',
    'GST Rate (%)',
    'Total GST Paid',
    'Total GST Received',
    'Sales Revenue',
    'Profit Till Now',
    'Margin (%)'
  ].join(',');

  const csvRows = rows.map((r) => {
    return [
      `"${r.productName.replace(/"/g, '""')}"`,
      `"${r.category.replace(/"/g, '""')}"`,
      `"${r.barcode}"`,
      r.unit,
      r.totalPurchasedStock.toFixed(2),
      r.totalQtySold.toFixed(2),
      r.availableStock.toFixed(2),
      r.rawPurchasePrice.toFixed(2),
      r.unitBaseAmount.toFixed(2),
      r.totalPurchaseInclGst.toFixed(2),
      r.totalBaseAmountExclGst.toFixed(2),
      `${r.gstRate}%`,
      r.totalInputGstPaid.toFixed(2),
      r.totalOutputGstCollected.toFixed(2),
      r.totalSalesRevenue.toFixed(2),
      r.totalProfitTillNow.toFixed(2),
      `${r.profitMarginPercent.toFixed(1)}%`
    ].join(',');
  });

  const csvContent = [titleRow, headers, ...csvRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${societyName.replace(/\s+/g, '_')}_Purchase_Summary_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportPurchaseTransactionsToCsv(
  transactions: PurchaseTransaction[],
  societyName = 'Deganga CADPFSCS Ltd'
): void {
  const titleRow = `Purchase & Stock Fill Transactions Log - ${societyName},,,,,,,,,,,,,`;
  const headers = [
    'Purchase Ref',
    'Date & Time',
    'Entry Type',
    'Product ID',
    'Product Name',
    'Category',
    'Barcode',
    'Unit',
    'Previous Stock',
    'Added Qty',
    'New Stock',
    'Unit Purchase Price (₹)',
    'GST (%)',
    'Base Amount (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'Total GST (₹)',
    'Total Purchase Amount (₹)',
    'Batch No',
    'Mode of Payment',
    'Performed By',
  ].join(',');

  const rows = transactions.map((tx) => {
    const typeLabel =
      tx.entryType === 'NEW_PRODUCT'
        ? 'New Product Addition'
        : tx.entryType === 'QUICK_RESTOCK'
        ? 'Quick Stock Restock'
        : 'Fill Existing Product';
    const paymentModeLabel =
      tx.paymentStatus === 'CASH'
        ? 'Cash'
        : tx.paymentStatus === 'BANK_UPI'
        ? 'Bank / NEFT / UPI'
        : 'Sundry Creditor (Credit)';
    return [
      `"${tx.purchaseRef || ''}"`,
      `"${tx.purchaseDate || ''}"`,
      `"${typeLabel}"`,
      tx.productId || '',
      `"${(tx.productName || '').replace(/"/g, '""')}"`,
      `"${(tx.category || '').replace(/"/g, '""')}"`,
      `"${tx.barcode || ''}"`,
      tx.unit || 'KG',
      Number(tx.previousStock || 0).toFixed(3),
      Number(tx.addedQuantity || 0).toFixed(3),
      Number(tx.newStock || 0).toFixed(3),
      Number(tx.purchasePrice || 0).toFixed(2),
      `${Number(tx.gstPercent || 0)}%`,
      Number(tx.baseAmount || 0).toFixed(2),
      Number(tx.cgstAmount || 0).toFixed(2),
      Number(tx.sgstAmount || 0).toFixed(2),
      Number(tx.totalGstAmount || 0).toFixed(2),
      Number(tx.totalAmount || 0).toFixed(2),
      `"${(tx.batchNo || '').replace(/"/g, '""')}"`,
      `"${paymentModeLabel}"`,
      `"${(tx.performedBy || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csvContent = [titleRow, headers, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${societyName.replace(/\s+/g, '_')}_Purchase_Transactions_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface BalanceSheetDayRow {
  date: string;
  invoiceCount: number;
  cashSales: number;
  upiSales: number;
  salesBase: number;
  discountAllowed?: number;
  outputCgst: number;
  outputSgst: number;
  outputGst: number;
  roundOff: number;
  grossTurnover: number;
  cogsBase: number;
  tradingProfit: number;
  purchasesBase: number;
  purchasesCgst: number;
  purchasesSgst: number;
  purchasesGst: number;
  purchaseCount: number;
}

export interface LedgerHeadExportRow {
  ledgerHead: string;
  amount: number;
}

export interface BalanceSheetExportData {
  societyName: string;
  periodLabel: string;
  // Trading Account
  openingStockBase: number;
  purchaseBase: number;
  salesBase: number;
  closingStockBase: number;
  closingStockInclGst: number;
  cogsBase: number;
  grossProfit: number;
  // Separate CGST & SGST Summary
  outputCgst: number;
  outputSgst: number;
  inputCgst: number;
  inputSgst: number;
  openingCgstItc: number;
  openingSgstItc: number;
  govtCgstPaidTotal: number;
  govtSgstPaidTotal: number;
  // Profit & Loss Account
  roundOffIncome: number;
  govtFeePaidTotal: number;
  expenseLedgers: LedgerHeadExportRow[];
  otherIncomeLedgers: LedgerHeadExportRow[];
  totalOperatingExpenses: number;
  totalOtherIncome: number;
  netProfit: number;
  // Cash & Bank Account
  openingCashFloat: number;
  openingBankBalance: number;
  cashSales: number;
  upiSales: number;
  otherIncomeCash: number;
  otherIncomeBank: number;
  expenseCash: number;
  expenseBank: number;
  purchasePaidCash: number;
  purchasePaidBank: number;
  govtPaidCash: number;
  govtPaidBank: number;
  cashInHand: number;
  bankUpiBalance: number;
  // Pure Balance Sheet
  openingCapitalFund: number;
  closingCapitalFund: number;
  sundryCreditors: number;
  netCgstPayable: number;
  netSgstPayable: number;
  netGstPayable: number;
  cgstItcReceivable: number;
  sgstItcReceivable: number;
  itcReceivable: number;
  totalAssets: number;
  totalLiabilitiesAndCapital: number;
  // Metadata
  purchaseSettlementLabel: string;
  dayRows: BalanceSheetDayRow[];
}

export function exportBalanceSheetToCsv(data: BalanceSheetExportData): void {
  const tradingTotal = Math.max(
    data.openingStockBase + data.purchaseBase + Math.max(0, data.grossProfit),
    data.salesBase + data.closingStockBase + Math.max(0, -data.grossProfit)
  );
  const plTotal = Math.max(
    Math.max(0, data.grossProfit) +
      Math.max(0, data.roundOffIncome) +
      data.totalOtherIncome +
      Math.max(0, -data.netProfit),
    Math.max(0, -data.grossProfit) +
      Math.max(0, -data.roundOffIncome) +
      data.govtFeePaidTotal +
      data.totalOperatingExpenses +
      Math.max(0, data.netProfit)
  );
  const cashReceiptsTotal = data.openingCashFloat + data.cashSales + data.otherIncomeCash;
  const bankReceiptsTotal = data.openingBankBalance + data.upiSales + data.otherIncomeBank;

  const lines = [
    `Standard Indian Final Accounts (Trading A/c, P&L A/c, Cash Book & Balance Sheet) - ${data.societyName}`,
    `Period,${JSON.stringify(data.periodLabel)}`,
    `Stock Purchase Settlement Mode,${JSON.stringify(data.purchaseSettlementLabel)}`,
    '',
    '1. TRADING ACCOUNT (EXCLUDING CGST & SGST)',
    'Dr. Particulars,Amount (INR),Cr. Particulars,Amount (INR)',
    `To Opening Stock (Excl. GST),${data.openingStockBase.toFixed(2)},By Sales Revenue (Excl. GST),${data.salesBase.toFixed(2)}`,
    `To Purchases (Without GST),${data.purchaseBase.toFixed(2)},By Closing Stock (Excl. GST),${data.closingStockBase.toFixed(2)}`,
    `(Memo: Input CGST ${data.inputCgst.toFixed(2)} | Input SGST ${data.inputSgst.toFixed(2)}),0.00,(Memo: Output CGST ${data.outputCgst.toFixed(2)} | Output SGST ${data.outputSgst.toFixed(2)}),0.00`,
    data.grossProfit >= 0
      ? `To Gross Profit c/d (to P&L A/c),${data.grossProfit.toFixed(2)},,`
      : `,,By Gross Loss c/d (to P&L A/c),${Math.abs(data.grossProfit).toFixed(2)}`,
    `TOTAL TRADING DR.,${tradingTotal.toFixed(2)},TOTAL TRADING CR.,${tradingTotal.toFixed(2)}`,
    '',
    '2. PROFIT & LOSS ACCOUNT',
    'Dr. Particulars,Amount (INR),Cr. Particulars,Amount (INR)',
    data.grossProfit < 0
      ? `To Gross Loss b/d,${Math.abs(data.grossProfit).toFixed(2)},By Gross Profit b/d,0.00`
      : `To Gross Loss b/d,0.00,By Gross Profit b/d,${data.grossProfit.toFixed(2)}`,
    data.roundOffIncome < 0
      ? `To Round-Off Adjustment Allowed,${Math.abs(data.roundOffIncome).toFixed(2)},By Round-Off Adjustment Income,0.00`
      : `To Round-Off Adjustment Allowed,0.00,By Round-Off Adjustment Income,${data.roundOffIncome.toFixed(2)}`,
    `To GST Interest / Late Fee (PMT-06),${data.govtFeePaidTotal.toFixed(2)},,`,
    ...data.expenseLedgers.map(
      (e) => `${JSON.stringify(`To ${e.ledgerHead}`)},${e.amount.toFixed(2)},,`
    ),
    ...data.otherIncomeLedgers.map(
      (inc) => `,,${JSON.stringify(`By ${inc.ledgerHead}`)},${inc.amount.toFixed(2)}`
    ),
    data.netProfit >= 0
      ? `To Net Profit (Transferred to Capital A/c),${data.netProfit.toFixed(2)},,`
      : `,,By Net Loss (Transferred to Capital A/c),${Math.abs(data.netProfit).toFixed(2)}`,
    `TOTAL P&L DR.,${plTotal.toFixed(2)},TOTAL P&L CR.,${plTotal.toFixed(2)}`,
    '',
    '3. CASH & BANK ACCOUNT (CASH BOOK)',
    'Dr. Receipts,Cash (INR),Bank / UPI (INR),Cr. Payments,Cash (INR),Bank / UPI (INR)',
    `To Opening Balance b/d,${data.openingCashFloat.toFixed(2)},${data.openingBankBalance.toFixed(2)},By Stock Purchases Paid,${data.purchasePaidCash.toFixed(2)},${data.purchasePaidBank.toFixed(2)}`,
    `To Cash Sales Collections,${data.cashSales.toFixed(2)},0.00,By Operating Expenses (Salary/Rent/Misc),${data.expenseCash.toFixed(2)},${data.expenseBank.toFixed(2)}`,
    `To UPI / Bank Sales Collections,0.00,${data.upiSales.toFixed(2)},By Govt GST Challans PMT-06 (CGST ${data.govtCgstPaidTotal.toFixed(2)} + SGST ${data.govtSgstPaidTotal.toFixed(2)}),${data.govtPaidCash.toFixed(2)},${data.govtPaidBank.toFixed(2)}`,
    `To Other Income Receipts,${data.otherIncomeCash.toFixed(2)},${data.otherIncomeBank.toFixed(2)},By Closing Balance c/d,${data.cashInHand.toFixed(2)},${data.bankUpiBalance.toFixed(2)}`,
    `TOTAL RECEIPTS,${cashReceiptsTotal.toFixed(2)},${bankReceiptsTotal.toFixed(2)},TOTAL PAYMENTS & CLOSING,${cashReceiptsTotal.toFixed(2)},${bankReceiptsTotal.toFixed(2)}`,
    '',
    '4. BALANCE SHEET (POSITION STATEMENT - AS ON PERIOD END)',
    'LIABILITIES & CAPITAL,Amount (INR),ASSETS,Amount (INR)',
    `Opening Capital Fund,${data.openingCapitalFund.toFixed(2)},Closing Stock-in-Trade (Cost Excl. GST),${data.closingStockBase.toFixed(2)}`,
    `${data.netProfit >= 0 ? 'Add: Net Profit (from P&L A/c)' : 'Less: Net Loss (from P&L A/c)'},${data.netProfit.toFixed(2)},Cash in Hand (Closing Balance),${data.cashInHand.toFixed(2)}`,
    `Closing Capital Fund (Subtotal),${data.closingCapitalFund.toFixed(2)},Bank / UPI Balance (Closing Balance),${data.bankUpiBalance.toFixed(2)}`,
    `Sundry Creditors (Stock Purchase Payables),${data.sundryCreditors.toFixed(2)},CGST Input Tax Credit (ITC) Receivable (Central Tax),${data.cgstItcReceivable.toFixed(2)}`,
    `CGST Payable to Govt (Central Tax),${data.netCgstPayable.toFixed(2)},SGST Input Tax Credit (ITC) Receivable (State Tax),${data.sgstItcReceivable.toFixed(2)}`,
    `SGST Payable to Govt (State Tax),${data.netSgstPayable.toFixed(2)},(Memo: Closing Stock Incl. GST),${data.closingStockInclGst.toFixed(2)}`,
    `TOTAL LIABILITIES & CAPITAL,${data.totalLiabilitiesAndCapital.toFixed(2)},TOTAL ASSETS,${data.totalAssets.toFixed(2)}`,
    '',
    'CGST & SGST STATUTORY LEDGER SUMMARY (SECTION 49(5) CGST ACT 2017)',
    'Tax Head,Opening ITC,Period Input ITC,Output Tax Collected,Govt PMT-06 Paid,Net Payable (Liability),Closing ITC Receivable (Asset)',
    `CGST (Central Tax),${data.openingCgstItc.toFixed(2)},${data.inputCgst.toFixed(2)},${data.outputCgst.toFixed(2)},${data.govtCgstPaidTotal.toFixed(2)},${data.netCgstPayable.toFixed(2)},${data.cgstItcReceivable.toFixed(2)}`,
    `SGST (State Tax),${data.openingSgstItc.toFixed(2)},${data.inputSgst.toFixed(2)},${data.outputSgst.toFixed(2)},${data.govtSgstPaidTotal.toFixed(2)},${data.netSgstPayable.toFixed(2)},${data.sgstItcReceivable.toFixed(2)}`,
    `TOTAL GST,${(data.openingCgstItc + data.openingSgstItc).toFixed(2)},${(data.inputCgst + data.inputSgst).toFixed(2)},${(data.outputCgst + data.outputSgst).toFixed(2)},${(data.govtCgstPaidTotal + data.govtSgstPaidTotal).toFixed(2)},${data.netGstPayable.toFixed(2)},${data.itcReceivable.toFixed(2)}`,
    '',
    'DAY-WISE SUPPORTING REGISTER',
    'Date,Invoices,Cash Sales,UPI Sales,Sales Base (Excl GST),Discount Allowed,Output CGST,Output SGST,Output Total GST,Round Off,Gross Turnover,COGS (Without GST),Trading Profit,Purchases (Without GST),Input CGST,Input SGST,Input Total GST,Purchase Entries',
    ...data.dayRows.map((r) =>
      [
        r.date,
        r.invoiceCount,
        r.cashSales.toFixed(2),
        r.upiSales.toFixed(2),
        r.salesBase.toFixed(2),
        (r.discountAllowed || 0).toFixed(2),
        r.outputCgst.toFixed(2),
        r.outputSgst.toFixed(2),
        r.outputGst.toFixed(2),
        r.roundOff.toFixed(2),
        r.grossTurnover.toFixed(2),
        r.cogsBase.toFixed(2),
        r.tradingProfit.toFixed(2),
        r.purchasesBase.toFixed(2),
        r.purchasesCgst.toFixed(2),
        r.purchasesSgst.toFixed(2),
        r.purchasesGst.toFixed(2),
        r.purchaseCount,
      ].join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${data.societyName.replace(/\s+/g, '_')}_Final_Accounts_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface GstSlabSummaryExportRow {
  gstRate: number;
  salesTaxableBase: number;
  outputCgst: number;
  outputSgst: number;
  outputTotalGst: number;
  purchaseTaxableBase: number;
  inputCgst: number;
  inputSgst: number;
  inputTotalGst: number;
}

export interface GstAnalysisExportData {
  societyName: string;
  periodLabel: string;
  outputCgst: number;
  outputSgst: number;
  outputTotal: number;
  openingCgstItc: number;
  openingSgstItc: number;
  periodInputCgst: number;
  periodInputSgst: number;
  periodInputTotal: number;
  availableCgstItc: number;
  availableSgstItc: number;
  utilizedCgstItc: number;
  utilizedSgstItc: number;
  netPayableCgstCash: number;
  netPayableSgstCash: number;
  netPayableTotalCash: number;
  govtCgstPaid: number;
  govtSgstPaid: number;
  govtFeePaid: number;
  govtTotalPaid: number;
  remainingPayableCgst: number;
  remainingPayableSgst: number;
  remainingPayableTotal: number;
  closingCgstItc: number;
  closingSgstItc: number;
  closingTotalItc: number;
  salesTaxableBase: number;
  salesExemptBase: number;
  purchaseTaxableBase: number;
  slabRows: GstSlabSummaryExportRow[];
}

export function exportGstAnalysisToCsv(data: GstAnalysisExportData): void {
  const lines = [
    `GST Compliance & GSTR-3B Tax Set-Off Statement (India) - ${data.societyName}`,
    `Period,${JSON.stringify(data.periodLabel)}`,
    '',
    'GSTR-3B TABLE 6.1 - TAX LIABILITY, ITC UTILIZATION & GOVT CHALLAN PAYMENTS (SECTION 49(5) CGST ACT 2017)',
    'Tax Head,Output Tax Liability (INR),Opening ITC Balance (INR),Current Period Input ITC (INR),Total Available ITC (INR),ITC Set-Off Utilized (INR),Tax Payable Before Challan (INR),Paid to Govt PMT-06 (INR),Remaining Balance Payable (INR),Closing ITC Carried Forward (INR)',
    `CGST (Central Tax),${data.outputCgst.toFixed(2)},${data.openingCgstItc.toFixed(2)},${data.periodInputCgst.toFixed(2)},${data.availableCgstItc.toFixed(2)},${data.utilizedCgstItc.toFixed(2)},${data.netPayableCgstCash.toFixed(2)},${data.govtCgstPaid.toFixed(2)},${data.remainingPayableCgst.toFixed(2)},${data.closingCgstItc.toFixed(2)}`,
    `SGST (State Tax),${data.outputSgst.toFixed(2)},${data.openingSgstItc.toFixed(2)},${data.periodInputSgst.toFixed(2)},${data.availableSgstItc.toFixed(2)},${data.utilizedSgstItc.toFixed(2)},${data.netPayableSgstCash.toFixed(2)},${data.govtSgstPaid.toFixed(2)},${data.remainingPayableSgst.toFixed(2)},${data.closingSgstItc.toFixed(2)}`,
    `Interest / Late Fee,0.00,0.00,0.00,0.00,0.00,0.00,${data.govtFeePaid.toFixed(2)},0.00,0.00`,
    `TOTAL GST,${data.outputTotal.toFixed(2)},${(data.openingCgstItc + data.openingSgstItc).toFixed(2)},${data.periodInputTotal.toFixed(2)},${(data.availableCgstItc + data.availableSgstItc).toFixed(2)},${(data.utilizedCgstItc + data.utilizedSgstItc).toFixed(2)},${data.netPayableTotalCash.toFixed(2)},${data.govtTotalPaid.toFixed(2)},${data.remainingPayableTotal.toFixed(2)},${data.closingTotalItc.toFixed(2)}`,
    '',
    'TURNOVER SUMMARY',
    `Taxable Outward Supplies (Sales Base Excl GST),${data.salesTaxableBase.toFixed(2)}`,
    `Nil Rated / Exempt Outward Supplies (0% GST),${data.salesExemptBase.toFixed(2)}`,
    `Inward Supplies Taxable Base (Purchases Excl GST),${data.purchaseTaxableBase.toFixed(2)}`,
    '',
    'GST SLAB-WISE SUMMARY (GSTR-1 & GSTR-2B)',
    'GST Slab (%),Sales Taxable Value,Output CGST,Output SGST,Output Total GST,Purchase Taxable Value,Input CGST,Input SGST,Input Total ITC',
    ...data.slabRows.map((s) =>
      [
        `${s.gstRate}%`,
        s.salesTaxableBase.toFixed(2),
        s.outputCgst.toFixed(2),
        s.outputSgst.toFixed(2),
        s.outputTotalGst.toFixed(2),
        s.purchaseTaxableBase.toFixed(2),
        s.inputCgst.toFixed(2),
        s.inputSgst.toFixed(2),
        s.inputTotalGst.toFixed(2),
      ].join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = getIstDateStr();
  link.setAttribute('href', url);
  link.setAttribute('download', `${data.societyName.replace(/\s+/g, '_')}_GST_Analysis_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}



