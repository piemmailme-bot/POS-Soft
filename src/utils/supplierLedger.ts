import {
  AccountLedgerVoucher,
  PartyAccount,
  PurchaseTransaction,
  ReturnNote,
  SupplierCategory,
} from '../types';

export const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'Manufacturer',
  'Distributor',
  'Wholesaler',
  'Retailer',
  'Other',
];

export const INDIAN_STATES: string[] = [
  'West Bengal',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu & Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function normalizePhoneDigits(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits;
}

export function normalizeNameKey(name?: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Generates the next unique sequential Supplier ID in the format SUP-0001, SUP-0002, ...
 */
export function generateNextSupplierCode(existingParties: PartyAccount[]): string {
  let maxNum = 0;
  const usedCodes = new Set<string>();

  for (const p of existingParties) {
    if (p.partyType !== 'SUPPLIER') continue;
    const code = String(p.supplierCode || '').trim().toUpperCase();
    if (!code) continue;
    usedCodes.add(code);
    const match = code.match(/^SUP-(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }

  let next = maxNum + 1;
  let candidate = `SUP-${String(next).padStart(4, '0')}`;
  while (usedCodes.has(candidate)) {
    next += 1;
    candidate = `SUP-${String(next).padStart(4, '0')}`;
  }
  return candidate;
}

export interface DuplicateSupplierCheckResult {
  isDuplicate: boolean;
  field?: 'name' | 'phone' | 'gstin' | 'pan' | 'supplierCode';
  message?: string;
  matchedSupplier?: PartyAccount;
}

/**
 * Checks whether a supplier payload duplicates an existing supplier on Company Name,
 * Mobile Number, GSTIN, PAN, or Supplier ID.
 */
export function checkDuplicateSupplier(
  candidate: Partial<PartyAccount>,
  existingParties: PartyAccount[]
): DuplicateSupplierCheckResult {
  const suppliers = existingParties.filter(
    (p) => p.partyType === 'SUPPLIER' && p.id !== candidate.id
  );

  const candName = normalizeNameKey(candidate.name);
  const candPhone = normalizePhoneDigits(candidate.phone);
  const candGstin = String(candidate.gstin || '').trim().toUpperCase();
  const candPan = String(candidate.pan || '').trim().toUpperCase();
  const candCode = String(candidate.supplierCode || '').trim().toUpperCase();

  for (const sup of suppliers) {
    if (candCode && sup.supplierCode && sup.supplierCode.trim().toUpperCase() === candCode) {
      return {
        isDuplicate: true,
        field: 'supplierCode',
        message: `Supplier ID "${candCode}" is already assigned to "${sup.name}".`,
        matchedSupplier: sup,
      };
    }

    if (candName && normalizeNameKey(sup.name) === candName) {
      return {
        isDuplicate: true,
        field: 'name',
        message: `A supplier named "${sup.name}" (${sup.supplierCode || sup.id}) already exists.`,
        matchedSupplier: sup,
      };
    }

    const supPhone = normalizePhoneDigits(sup.phone);
    if (candPhone && candPhone.length >= 10 && supPhone && supPhone === candPhone) {
      return {
        isDuplicate: true,
        field: 'phone',
        message: `Mobile number "${candidate.phone}" is already registered with "${sup.name}" (${sup.supplierCode || sup.id}).`,
        matchedSupplier: sup,
      };
    }

    const supGstin = String(sup.gstin || '').trim().toUpperCase();
    if (candGstin && supGstin && supGstin === candGstin) {
      return {
        isDuplicate: true,
        field: 'gstin',
        message: `GSTIN "${candGstin}" is already registered with "${sup.name}" (${sup.supplierCode || sup.id}).`,
        matchedSupplier: sup,
      };
    }

    const supPan = String(sup.pan || '').trim().toUpperCase();
    if (candPan && supPan && supPan === candPan) {
      return {
        isDuplicate: true,
        field: 'pan',
        message: `PAN "${candPan}" is already registered with "${sup.name}" (${sup.supplierCode || sup.id}).`,
        matchedSupplier: sup,
      };
    }
  }

  return { isDuplicate: false };
}

export type SupplierLedgerEntryType = 'OPENING' | 'PURCHASE' | 'PAYMENT' | 'DEBIT_NOTE';

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  refNo: string;
  invoiceNo?: string;
  type: SupplierLedgerEntryType;
  particulars: string;
  paymentMode: string;
  /** Payable increase (credit to supplier account: purchase bills, opening payable) */
  billCredit: number;
  /** Payable reduction / advance increase (debit to supplier account: payments, returns, opening advance) */
  paidDebit: number;
  /** Positive = Payable to supplier; Negative = Available Advance with supplier */
  runningNetBalance: number;
}

export interface SupplierLedgerSummary {
  supplier: PartyAccount;
  openingBalance: number;
  openingBalanceType: 'PAYABLE' | 'ADVANCE';
  openingPayable: number;
  openingAdvance: number;
  totalPurchases: number;
  totalCommission: number;
  creditPurchases: number;
  immediatePaidPurchases: number;
  voucherPayments: number;
  purchaseReturnsLedger: number;
  totalPayments: number;
  /** Net Payable (> 0) or Net Advance (< 0) */
  netPosition: number;
  outstandingBalance: number;
  availableAdvance: number;
  purchaseCount: number;
  paymentCount: number;
  returnCount: number;
  transactionCount: number;
  purchases: PurchaseTransaction[];
  payments: AccountLedgerVoucher[];
  returns: ReturnNote[];
  history: SupplierLedgerEntry[];
}

function matchesSupplierIdOrName(
  supplier: PartyAccount,
  txPartyId?: string,
  txPartyName?: string
): boolean {
  if (txPartyId && String(txPartyId).trim() === supplier.id) return true;
  if (!txPartyId && txPartyName && normalizeNameKey(txPartyName) === normalizeNameKey(supplier.name)) {
    return true;
  }
  return false;
}

function getPurchaseTotal(tx: PurchaseTransaction): number {
  const txGst = Number(tx.totalGstAmount || 0);
  const txBase =
    Number(tx.baseAmount || 0) > 0
      ? Number(tx.baseAmount || 0)
      : Math.max(0, Number(tx.totalAmount || 0) - txGst);
  return r2(txBase + txGst);
}

/**
 * Computes complete financial metrics and chronological purchase/payment ledger
 * for a single supplier.
 */
export function computeSupplierLedger(
  supplier: PartyAccount,
  purchaseTransactions: PurchaseTransaction[],
  accountVouchers: AccountLedgerVoucher[],
  returnNotes: ReturnNote[]
): SupplierLedgerSummary {
  const openingAmount = r2(Math.max(0, Number(supplier.openingBalance || 0)));
  const openingType: 'PAYABLE' | 'ADVANCE' =
    supplier.openingBalanceType === 'ADVANCE' ? 'ADVANCE' : 'PAYABLE';
  const openingPayable = openingType === 'PAYABLE' ? openingAmount : 0;
  const openingAdvance = openingType === 'ADVANCE' ? openingAmount : 0;

  const purchases = purchaseTransactions.filter((tx) =>
    matchesSupplierIdOrName(supplier, tx.supplierId, tx.supplierName)
  );

  const payments = accountVouchers.filter(
    (v) =>
      v.voucherType === 'SUPPLIER_PAYMENT' &&
      matchesSupplierIdOrName(supplier, v.partyId, v.payeeOrPayer)
  );

  const returns = returnNotes.filter(
    (n) =>
      n.noteType === 'DEBIT_NOTE' &&
      matchesSupplierIdOrName(supplier, n.partyId, n.partyName)
  );

  let totalPurchases = 0;
  let totalCommission = 0;
  let totalBillDeductedCommission = 0;
  let creditPurchases = 0;
  let immediatePaidPurchases = 0;

  const rawEntries: Omit<SupplierLedgerEntry, 'runningNetBalance'>[] = [];

  if (openingAmount > 0) {
    rawEntries.push({
      id: `opening-${supplier.id}`,
      date: supplier.createdAt ? String(supplier.createdAt).slice(0, 10) : '0000-01-01',
      refNo: 'OPENING',
      type: 'OPENING',
      particulars:
        openingType === 'ADVANCE'
          ? 'Opening Advance Balance (Paid to Supplier)'
          : 'Opening Payable Balance (Brought Forward)',
      paymentMode: openingType === 'ADVANCE' ? 'Advance B/F' : 'Payable B/F',
      billCredit: openingPayable,
      paidDebit: openingAdvance,
    });
  }

  for (const tx of purchases) {
    const grossTot = getPurchaseTotal(tx);
    if (grossTot <= 0) continue;
    const commAmt = r2(Math.max(0, Number(tx.commissionAmount || 0)));
    const isBillDeducted =
      commAmt > 0 && (tx.commissionMode || 'DEDUCT_BILL') === 'DEDUCT_BILL';
    const netBillPayable = isBillDeducted ? r2(Math.max(0, grossTot - commAmt)) : grossTot;

    totalPurchases = r2(totalPurchases + grossTot);
    totalCommission = r2(totalCommission + commAmt);
    if (isBillDeducted) {
      totalBillDeductedCommission = r2(totalBillDeductedCommission + commAmt);
    }

    const isPaidImmediately = tx.paymentStatus === 'CASH' || tx.paymentStatus === 'BANK_UPI';
    if (isPaidImmediately) {
      immediatePaidPurchases = r2(immediatePaidPurchases + netBillPayable);
    } else {
      creditPurchases = r2(creditPurchases + netBillPayable);
    }

    const modeLabel =
      tx.paymentStatus === 'CASH'
        ? 'Paid Cash'
        : tx.paymentStatus === 'BANK_UPI'
        ? 'Paid Bank/UPI'
        : 'On Credit';

    const commTag =
      commAmt > 0
        ? ` · Comm: ₹${commAmt.toFixed(2)} (${
            isBillDeducted
              ? 'Deducted in Bill'
              : tx.commissionMode === 'SEPARATE_CASH'
              ? 'Recd. Cash'
              : 'Recd. Bank/UPI'
          })`
        : '';

    rawEntries.push({
      id: `pur-${tx.id}`,
      date: String(tx.purchaseDate || ''),
      refNo: tx.purchaseRef || tx.id,
      invoiceNo: tx.supplierInvoiceNo || undefined,
      type: 'PURCHASE',
      particulars: `${tx.productName} (+${tx.addedQuantity} ${tx.unit} @ ₹${Number(tx.purchasePrice || 0).toFixed(2)} + ${tx.gstPercent || 0}% GST)${commTag}${tx.supplierNote ? ` · ${tx.supplierNote}` : ''}`,
      paymentMode: modeLabel,
      billCredit: netBillPayable,
      paidDebit: isPaidImmediately ? netBillPayable : 0,
    });
  }

  let voucherPayments = 0;
  for (const v of payments) {
    const amt = r2(Number(v.amount || 0));
    if (amt <= 0) continue;
    voucherPayments = r2(voucherPayments + amt);
    rawEntries.push({
      id: `pay-${v.id}`,
      date: String(v.voucherDate || ''),
      refNo: v.voucherNo || v.id,
      type: 'PAYMENT',
      particulars: v.narration || v.ledgerHead || 'Supplier Payment / Advance',
      paymentMode: v.paymentMode === 'CASH' ? 'Cash' : 'Bank / UPI',
      billCredit: 0,
      paidDebit: amt,
    });
  }

  let purchaseReturnsLedger = 0;
  for (const n of returns) {
    const tot = r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0));
    if (tot <= 0) continue;
    const retMode = n.settlementMode || n.refundMode || 'CASH';
    const isLedgerAdjust = retMode !== 'CASH' && retMode !== 'BANK_UPI';
    if (isLedgerAdjust) {
      purchaseReturnsLedger = r2(purchaseReturnsLedger + tot);
    }
    rawEntries.push({
      id: `ret-${n.id}`,
      date: String(n.noteDate || n.returnDate || ''),
      refNo: n.noteNo || n.id,
      invoiceNo: n.referenceNo || n.refNo || undefined,
      type: 'DEBIT_NOTE',
      particulars: `Purchase Return: ${n.productName} (-${n.quantity} ${n.unit})${n.reason ? ` · ${n.reason}` : ''}`,
      paymentMode: isLedgerAdjust ? 'Adjusted on Ledger' : `Refunded via ${retMode}`,
      billCredit: 0,
      paidDebit: isLedgerAdjust ? tot : 0,
    });
  }

  // Sort chronologically (Opening always first)
  rawEntries.sort((a, b) => {
    if (a.type === 'OPENING' && b.type !== 'OPENING') return -1;
    if (b.type === 'OPENING' && a.type !== 'OPENING') return 1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

  let running = 0;
  const history: SupplierLedgerEntry[] = rawEntries.map((entry) => {
    running = r2(running + entry.billCredit - entry.paidDebit);
    return {
      ...entry,
      runningNetBalance: running,
    };
  });

  const totalPayments = r2(immediatePaidPurchases + voucherPayments);
  const netPurchasesPayable = r2(Math.max(0, totalPurchases - totalBillDeductedCommission));
  const netPosition = r2(
    openingPayable + netPurchasesPayable - openingAdvance - totalPayments - purchaseReturnsLedger
  );
  const outstandingBalance = netPosition > 0 ? netPosition : 0;
  const availableAdvance = netPosition < 0 ? r2(Math.abs(netPosition)) : 0;

  return {
    supplier,
    openingBalance: openingAmount,
    openingBalanceType: openingType,
    openingPayable,
    openingAdvance,
    totalPurchases,
    totalCommission,
    creditPurchases,
    immediatePaidPurchases,
    voucherPayments,
    purchaseReturnsLedger,
    totalPayments,
    netPosition,
    outstandingBalance,
    availableAdvance,
    purchaseCount: purchases.length,
    paymentCount: payments.length,
    returnCount: returns.length,
    transactionCount: purchases.length + payments.length + returns.length,
    purchases,
    payments,
    returns,
    history,
  };
}
