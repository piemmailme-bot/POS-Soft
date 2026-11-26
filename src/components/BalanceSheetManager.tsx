import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Scale,
  Calendar,
  Download,
  Printer,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  BookOpen,
  TrendingUp,
  Wallet,
  Landmark,
  FileSpreadsheet,
  Plus,
  Receipt,
  Trash2,
  X,
  AlertTriangle,
  Search,
  ArrowLeftRight,
  Users,
  Undo2,
  Building2,
} from 'lucide-react';
import {
  Product,
  SaleTransactionItem,
  PurchaseTransaction,
  SocietyProfile,
  GstGovtPayment,
  AccountLedgerVoucher,
  AccountVoucherType,
  AdminStoreSettings,
  PartyAccount,
  ReturnNote,
  FixedAsset,
} from '../types';
import { exportBalanceSheetToCsv, BalanceSheetDayRow } from '../utils/csvExporter';
import { getIstDateStr, getIstDateOffsetStr, getIstMonthRange } from '../utils/dateUtils';
import { FixedAssetRegisterManager } from './FixedAssetRegisterManager';

interface BalanceSheetManagerProps {
  products: Product[];
  ledger: SaleTransactionItem[];
  purchaseTransactions: PurchaseTransaction[];
  gstPayments?: GstGovtPayment[];
  accountVouchers?: AccountLedgerVoucher[];
  partyAccounts?: PartyAccount[];
  returnNotes?: ReturnNote[];
  fixedAssets?: FixedAsset[];
  adminSettings?: AdminStoreSettings;
  onUpdateAdminSettings?: (next: AdminStoreSettings) => Promise<void> | void;
  society: SocietyProfile;
  onRefreshData?: () => Promise<void> | void;
  onAddAccountVoucher?: (
    voucher: Omit<AccountLedgerVoucher, 'id' | 'performedBy'>
  ) => Promise<boolean>;
  onDeleteAccountVoucher?: (id: string) => Promise<boolean>;
  onSavePartyAccount?: (party: PartyAccount) => Promise<boolean> | void;
  onDeletePartyAccount?: (id: string) => Promise<boolean> | void;
  onAddParty?: (party: Omit<PartyAccount, 'id'>) => Promise<boolean> | void;
  onDeleteParty?: (id: string) => Promise<boolean> | void;
  onAddReturnNote?: (note: Omit<ReturnNote, 'id' | 'performedBy'>) => Promise<boolean> | void;
  onDeleteReturnNote?: (id: string) => Promise<boolean> | void;
  onSaveFixedAsset?: (asset: Omit<FixedAsset, 'id'> & { id?: string }) => Promise<boolean>;
  onAddFixedAsset?: (asset: Omit<FixedAsset, 'id'> & { id?: string }) => Promise<boolean>;
  onDeleteFixedAsset?: (id: string) => Promise<boolean>;
}

type AccountViewTab =
  | 'ALL'
  | 'TRADING'
  | 'PL'
  | 'CASH_BOOK'
  | 'BALANCE_SHEET'
  | 'TRIAL_BALANCE'
  | 'VOUCHERS'
  | 'PARTIES'
  | 'RETURNS'
  | 'FIXED_ASSETS';
type PrintTarget = 'CURRENT' | AccountViewTab;
type PurchaseSettlementMode = 'CREDIT' | 'BANK_UPI' | 'CASH';

const EXPENSE_LEDGER_PRESETS = [
  'Staff Salary & Wages',
  'Shop Rent & Lease',
  'Electricity & Utilities',
  'Transport & Freight (Indirect)',
  'Stationery & Packing',
  'Repairs & Maintenance',
  'Bank Charges',
  'Miscellaneous Expense',
] as const;

const OTHER_INCOME_LEDGER_PRESETS = [
  'Interest Received',
  'Discount Received',
  'Scrap / Empty Bag Sales (Non-Inventory)',
  'Membership / Commission Income',
  'Miscellaneous Income',
] as const;

const r2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));
const fmt = (n: number): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const extractDatePart = (dateStr?: string): string => {
  if (!dateStr) return '';
  return String(dateStr).trim().slice(0, 10);
};

export const BalanceSheetManager: React.FC<BalanceSheetManagerProps> = ({
  products,
  ledger,
  purchaseTransactions,
  gstPayments = [],
  accountVouchers = [],
  partyAccounts = [],
  returnNotes = [],
  fixedAssets = [],
  adminSettings,
  onUpdateAdminSettings,
  society,
  onRefreshData,
  onAddAccountVoucher,
  onDeleteAccountVoucher,
  onSavePartyAccount,
  onDeletePartyAccount,
  onAddParty: propOnAddParty,
  onDeleteParty: propOnDeleteParty,
  onAddReturnNote,
  onDeleteReturnNote,
  onSaveFixedAsset,
  onAddFixedAsset: propOnAddFixedAsset,
  onDeleteFixedAsset,
}) => {
  const onAddParty = propOnAddParty || (onSavePartyAccount ? (p: Omit<PartyAccount, 'id'>) => onSavePartyAccount({ ...p, id: `PARTY-${Date.now()}` }) : undefined);
  const onDeleteParty = propOnDeleteParty || onDeletePartyAccount;
  const onAddFixedAsset = propOnAddFixedAsset || (onSaveFixedAsset ? (a: Omit<FixedAsset, 'id'>) => onSaveFixedAsset({ ...a, id: `FA-${Date.now()}` }) : undefined);

  const todayStr = getIstDateStr();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeAccountTab, setActiveAccountTab] = useState<AccountViewTab>('ALL');
  const [printTarget, setPrintTarget] = useState<PrintTarget>('CURRENT');
  const [voucherSearch, setVoucherSearch] = useState('');
  const [confirmDeleteVoucherId, setConfirmDeleteVoucherId] = useState<string | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => setPrintTarget('CURRENT');
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Record Non-Inventory Ledger Voucher Modal State (closes ONLY via Close/Cancel/Save)
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherType, setVoucherType] = useState<AccountVoucherType>('EXPENSE');
  const [voucherDate, setVoucherDate] = useState(todayStr);
  const [voucherNo, setVoucherNo] = useState('');
  const [selectedPresetHead, setSelectedPresetHead] = useState<string>(EXPENSE_LEDGER_PRESETS[0]);
  const [customLedgerHead, setCustomLedgerHead] = useState('');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherPayMode, setVoucherPayMode] = useState<'CASH' | 'BANK_UPI'>('CASH');
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const [payeeOrPayer, setPayeeOrPayer] = useState('');
  const [narration, setNarration] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);

  // Party Account Form State
  const [newPartyType, setNewPartyType] = useState<'SUPPLIER' | 'MEMBER'>('MEMBER');
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [newPartyGstin, setNewPartyGstin] = useState('');
  const [newPartyCode, setNewPartyCode] = useState('');
  const [newPartyOpening, setNewPartyOpening] = useState('');

  // Return Note (Credit Note / Debit Note) Form State
  const [retType, setRetType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE'>('CREDIT_NOTE');
  const [retProductId, setRetProductId] = useState<number>(products[0]?.id || 0);
  const [retQty, setRetQty] = useState('1');
  const [retRefNo, setRetRefNo] = useState('');
  const [retSettle, setRetSettle] = useState<'CASH' | 'BANK_UPI' | 'CREDIT_LEDGER'>('CASH');

  // Fixed Asset Form State
  const [faName, setFaName] = useState('');
  const [faCategory, setFaCategory] = useState<string>('Equipment');
  const [faCost, setFaCost] = useState('');
  const [faDepRate, setFaDepRate] = useState('15');

  const yesterdayStr = useMemo(() => getIstDateOffsetStr(-1), []);

  const sevenDaysAgoStr = useMemo(() => getIstDateOffsetStr(-6), []);

  const thisMonthStartStr = `${todayStr.slice(0, 7)}-01`;

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

  const activeDates = useMemo(() => {
    const set = new Set<string>([todayStr]);
    activeLedger.forEach((item) => {
      const d = extractDatePart(item.saleDate);
      if (d) set.add(d);
    });
    activePurchases.forEach((tx) => {
      const d = extractDatePart(tx.purchaseDate);
      if (d) set.add(d);
    });
    gstPayments.forEach((gp) => {
      const d = extractDatePart(gp.paymentDate);
      if (d) set.add(d);
    });
    accountVouchers.forEach((v) => {
      const d = extractDatePart(v.voucherDate);
      if (d) set.add(d);
    });
    return Array.from(set).sort().reverse();
  }, [activeLedger, activePurchases, gstPayments, accountVouchers, todayStr]);

  const [periodMode, setPeriodMode] = useState<'DAY' | 'RANGE'>('DAY');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [rangeStart, setRangeStart] = useState<string>(thisMonthStartStr);
  const [rangeEnd, setRangeEnd] = useState<string>(todayStr);

  const [openingCashFloat, setOpeningCashFloat] = useState<number>(() => {
    if (adminSettings?.openingCashBalance !== undefined) {
      return Math.max(0, Number(adminSettings.openingCashBalance) || 0);
    }
    return 0;
  });

  const [openingBankBalance, setOpeningBankBalance] = useState<number>(() => {
    if (adminSettings?.openingBankBalance !== undefined) {
      return Math.max(0, Number(adminSettings.openingBankBalance) || 0);
    }
    return 0;
  });

  const [purchaseSettlementMode, setPurchaseSettlementMode] = useState<PurchaseSettlementMode>(() => {
    if (
      adminSettings?.purchaseSettlementMode === 'BANK_UPI' ||
      adminSettings?.purchaseSettlementMode === 'CASH' ||
      adminSettings?.purchaseSettlementMode === 'CREDIT'
    ) {
      return adminSettings.purchaseSettlementMode;
    }
    return 'CREDIT';
  });

  // Sync when adminSettings load from server
  useEffect(() => {
    if (!adminSettings) return;
    if (adminSettings.openingCashBalance !== undefined) {
      setOpeningCashFloat(Math.max(0, Number(adminSettings.openingCashBalance) || 0));
    }
    if (adminSettings.openingBankBalance !== undefined) {
      setOpeningBankBalance(Math.max(0, Number(adminSettings.openingBankBalance) || 0));
    }
    if (
      adminSettings.purchaseSettlementMode === 'BANK_UPI' ||
      adminSettings.purchaseSettlementMode === 'CASH' ||
      adminSettings.purchaseSettlementMode === 'CREDIT'
    ) {
      setPurchaseSettlementMode(adminSettings.purchaseSettlementMode);
    }
  }, [
    adminSettings?.openingCashBalance,
    adminSettings?.openingBankBalance,
    adminSettings?.purchaseSettlementMode,
  ]);

  const persistAccountingConfigToDb = (patch: Partial<AdminStoreSettings>) => {
    if (adminSettings && onUpdateAdminSettings) {
      onUpdateAdminSettings({
        ...adminSettings,
        ...patch,
      });
    }
  };

  const handleOpeningCashChange = (val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setOpeningCashFloat(num);
    persistAccountingConfigToDb({ openingCashBalance: num });
  };

  const handleOpeningBankChange = (val: string) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setOpeningBankBalance(num);
    persistAccountingConfigToDb({ openingBankBalance: num });
  };

  const handlePurchaseSettlementChange = (mode: PurchaseSettlementMode) => {
    setPurchaseSettlementMode(mode);
    persistAccountingConfigToDb({ purchaseSettlementMode: mode });
  };

  const handleResetOpeningBalances = () => {
    setOpeningCashFloat(0);
    setOpeningBankBalance(0);
    setPurchaseSettlementMode('CREDIT');
    persistAccountingConfigToDb({
      openingCashBalance: 0,
      openingBankBalance: 0,
      purchaseSettlementMode: 'CREDIT',
    });
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

  const getVoucherPrefix = (type: AccountVoucherType) => {
    if (type === 'OTHER_INCOME') return 'INC';
    if (type === 'CONTRA_CASH_TO_BANK' || type === 'CONTRA_BANK_TO_CASH') return 'CNT';
    if (type === 'SUPPLIER_PAYMENT') return 'SUP';
    if (type === 'MEMBER_RECEIPT') return 'MEM';
    return 'EXP';
  };

  const getDefaultLedgerHeadForType = (type: AccountVoucherType) => {
    if (type === 'OTHER_INCOME') return OTHER_INCOME_LEDGER_PRESETS[0];
    if (type === 'CONTRA_CASH_TO_BANK') return 'Contra: Cash Deposited to Bank A/c';
    if (type === 'CONTRA_BANK_TO_CASH') return 'Contra: Cash Withdrawn from Bank A/c';
    if (type === 'SUPPLIER_PAYMENT') return 'Sundry Creditors (Supplier Payment)';
    if (type === 'MEMBER_RECEIPT') return 'Sundry Debtors (Member Credit Receipt)';
    return EXPENSE_LEDGER_PRESETS[0];
  };

  const openVoucherModal = (
    type: AccountVoucherType,
    preset?: { partyId?: string; payeeName?: string; amount?: number; narration?: string }
  ) => {
    const prefix = getVoucherPrefix(type);
    const datePart = (periodMode === 'DAY' ? selectedDay : todayStr) || todayStr;
    setVoucherType(type);
    setVoucherDate(datePart);
    setVoucherNo(`${prefix}-${datePart.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`);
    setSelectedPresetHead(getDefaultLedgerHeadForType(type));
    setCustomLedgerHead('');
    setVoucherAmount(
      preset?.amount !== undefined && preset.amount > 0 ? String(r2(preset.amount)) : ''
    );
    setVoucherPayMode(type === 'CONTRA_BANK_TO_CASH' ? 'BANK_UPI' : 'CASH');
    setSelectedPartyId(preset?.partyId || '');
    setPayeeOrPayer(preset?.payeeName || '');
    setNarration(preset?.narration || '');
    setVoucherError('');
    setIsVoucherModalOpen(true);
  };

  const handleSwitchModalType = (nextType: AccountVoucherType) => {
    const prefix = getVoucherPrefix(nextType);
    setVoucherType(nextType);
    setSelectedPresetHead(getDefaultLedgerHeadForType(nextType));
    setCustomLedgerHead('');
    setSelectedPartyId('');
    setPayeeOrPayer('');
    if (nextType === 'CONTRA_CASH_TO_BANK') setVoucherPayMode('CASH');
    if (nextType === 'CONTRA_BANK_TO_CASH') setVoucherPayMode('BANK_UPI');
    setVoucherNo(`${prefix}-${voucherDate.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`);
  };

  const resolvedLedgerHead =
    voucherType === 'CONTRA_CASH_TO_BANK' ||
    voucherType === 'CONTRA_BANK_TO_CASH' ||
    voucherType === 'SUPPLIER_PAYMENT' ||
    voucherType === 'MEMBER_RECEIPT'
      ? getDefaultLedgerHeadForType(voucherType)
      : selectedPresetHead === '__CUSTOM__'
      ? customLedgerHead.trim()
      : selectedPresetHead;

  const handleSaveVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddAccountVoucher) return;
    setVoucherError('');

    const amt = r2(Number(voucherAmount || 0));
    if (!resolvedLedgerHead) {
      setVoucherError('Please select or enter a Ledger Head name.');
      return;
    }
    if (amt <= 0) {
      setVoucherError('Enter a valid amount greater than ₹0.');
      return;
    }

    const matchedParty = partyAccounts.find((p) => p.id === selectedPartyId);
    const finalPayee = matchedParty ? matchedParty.name : payeeOrPayer.trim();

    setIsSavingVoucher(true);
    try {
      const ok = await onAddAccountVoucher({
        voucherNo:
          voucherNo.trim() ||
          `${getVoucherPrefix(voucherType)}-${voucherDate.replace(/-/g, '')}`,
        voucherDate: voucherDate || todayStr,
        voucherType,
        ledgerHead: resolvedLedgerHead,
        amount: amt,
        paymentMode:
          voucherType === 'CONTRA_CASH_TO_BANK'
            ? 'CASH'
            : voucherType === 'CONTRA_BANK_TO_CASH'
            ? 'BANK_UPI'
            : voucherPayMode,
        partyId: selectedPartyId || undefined,
        payeeOrPayer: finalPayee,
        narration: narration.trim(),
      });
      if (!ok) {
        setVoucherError('Failed to save ledger voucher to database.');
        return;
      }
      setIsVoucherModalOpen(false);
    } finally {
      setIsSavingVoucher(false);
    }
  };

  const handleAddPartySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddParty || !newPartyName.trim()) return;
    await onAddParty({
      partyType: newPartyType,
      name: newPartyName.trim(),
      phone: newPartyPhone.trim(),
      gstin: newPartyType === 'SUPPLIER' ? newPartyGstin.trim().toUpperCase() : '',
      memberCode: newPartyType === 'MEMBER' ? newPartyCode.trim().toUpperCase() : '',
      openingBalance: r2(Number(newPartyOpening || 0)),
      isActive: true,
    });
    setNewPartyName('');
    setNewPartyPhone('');
    setNewPartyGstin('');
    setNewPartyCode('');
    setNewPartyOpening('');
  };

  const handleAddReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddReturnNote) return;
    const prod = productMap.get(Number(retProductId)) || products[0];
    if (!prod) return;
    const qty = Math.max(0.001, Number(retQty || 1));
    const gstPct = Number(prod.gstPercent || 0);
    const unitBase =
      retType === 'CREDIT_NOTE'
        ? Number(prod.sellingPriceWD || (gstPct > 0 ? prod.sellingPrice / (1 + gstPct / 100) : prod.sellingPrice))
        : Number(prod.costPrice || 0);
    const baseAmt = r2(unitBase * qty);
    const cgst = r2((baseAmt * (gstPct / 2)) / 100);
    const sgst = cgst;
    const totalGst = r2(cgst + sgst);
    const totalAmt = r2(baseAmt + totalGst);
    const datePart = (periodMode === 'DAY' ? selectedDay : todayStr) || todayStr;

    await onAddReturnNote({
      noteNo: `${retType === 'CREDIT_NOTE' ? 'CN' : 'DN'}-${datePart.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
      noteDate: datePart,
      returnDate: datePart,
      noteType: retType,
      refNo: retRefNo.trim(),
      referenceNo: retRefNo.trim(),
      partyName: retType === 'CREDIT_NOTE' ? 'Customer Return' : 'Supplier Return',
      productId: prod.id,
      productName: prod.name,
      hsnCode: prod.hsnCode || '',
      unit: prod.unit,
      quantity: qty,
      unitRateExclGst: r2(unitBase),
      unitPriceWD: r2(unitBase),
      gstPercent: gstPct,
      baseAmount: baseAmt,
      cgstAmount: cgst,
      sgstAmount: sgst,
      totalGstAmount: totalGst,
      totalAmount: totalAmt,
      settlementMode: retSettle,
      refundMode: retSettle,
    });
    setRetQty('1');
    setRetRefNo('');
  };

  const handleAddAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddFixedAsset || !faName.trim()) return;
    const cost = r2(Number(faCost || 0));
    if (cost <= 0) return;
    const rate = Math.max(0, Math.min(100, Number(faDepRate || 15)));
    const datePart = (periodMode === 'DAY' ? selectedDay : todayStr) || todayStr;
    await onAddFixedAsset({
      assetName: faName.trim(),
      category: faCategory,
      purchaseDate: datePart,
      costValue: cost,
      purchaseCost: cost,
      depreciationRate: rate,
      depreciationRatePercent: rate,
      depreciationRatePct: rate,
      accumulatedDep: 0,
      accumulatedDepreciation: 0,
      fundingSource: 'CAPITAL_OPENING',
    });
    setFaName('');
    setFaCost('');
  };

  const effectiveStart = periodMode === 'DAY' ? selectedDay : rangeStart;
  const effectiveEnd = periodMode === 'DAY' ? selectedDay : rangeEnd;

  // Group active ledger rows into rounded invoices
  const allInvoices = useMemo(() => {
    const map = new Map<string, SaleTransactionItem[]>();
    activeLedger.forEach((item) => {
      if (!item.invoiceNo) return;
      const list = map.get(item.invoiceNo) || [];
      list.push(item);
      map.set(item.invoiceNo, list);
    });

    return Array.from(map.values()).map((items) => {
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

      let cogsBase = 0;
      let cogsInclGst = 0;
      items.forEach((it) => {
        const prod = productMap.get(it.productId);
        const unitCostBase =
          it.costPrice && Number(it.costPrice) > 0
            ? Number(it.costPrice)
            : Number(prod?.costPrice || 0);
        const gstRate =
          it.gstPercent !== undefined && it.gstPercent !== null && Number.isFinite(Number(it.gstPercent))
            ? Number(it.gstPercent)
            : prod?.gstPercent !== undefined && prod?.gstPercent !== null && Number.isFinite(Number(prod.gstPercent))
            ? Number(prod.gstPercent)
            : 0;
        const unitCostIncl = unitCostBase * (1 + gstRate / 100);
        const qty = Number(it.quantity || 0);
        cogsBase += qty * unitCostBase;
        cogsInclGst += qty * unitCostIncl;
      });

      const payMode = (first.paymentMode || 'CASH').toUpperCase();
      let cashPortion = 0;
      let bankPortion = 0;
      let creditPortion = 0;
      if (payMode === 'CASH') {
        cashPortion = grandTotal;
      } else if (payMode === 'UPI') {
        bankPortion = grandTotal;
      } else if (payMode === 'SPLIT') {
        const c = first.cashPaid !== undefined ? r2(Number(first.cashPaid)) : Math.round(grandTotal / 2);
        const u = r2(Math.max(0, grandTotal - c));
        cashPortion = c;
        bankPortion = u;
      } else if (payMode === 'CREDIT') {
        const c = first.cashPaid !== undefined ? r2(Number(first.cashPaid)) : 0;
        const cr = r2(Math.max(0, grandTotal - c));
        cashPortion = c;
        creditPortion = cr;
      } else {
        bankPortion = grandTotal;
      }

      const discountAmt = r2(items.reduce((sum, i) => sum + (Number(i.memberDiscount) || 0), 0));

      return {
        invoiceNo: first.invoiceNo,
        dateOnly,
        saleDate: first.saleDate,
        customerName: first.customerName || 'Walk-in Customer',
        customerId: first.customerId,
        paymentMode: payMode,
        cashPortion,
        bankPortion,
        creditPortion,
        discountAmt,
        baseTotal,
        totalGst,
        totalCgst,
        totalSgst,
        roundOff,
        grandTotal,
        cogsBase: r2(cogsBase),
        cogsInclGst: r2(cogsInclGst),
      };
    });
  }, [activeLedger, productMap]);

  const periodInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (!inv.dateOnly) return false;
      if (effectiveStart && inv.dateOnly < effectiveStart) return false;
      if (effectiveEnd && inv.dateOnly > effectiveEnd) return false;
      return true;
    });
  }, [allInvoices, effectiveStart, effectiveEnd]);

  const periodPurchases = useMemo(() => {
    return activePurchases.filter((tx) => {
      const d = extractDatePart(tx.purchaseDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [activePurchases, effectiveStart, effectiveEnd]);

  const periodGstPayments = useMemo(() => {
    return gstPayments.filter((gp) => {
      const d = extractDatePart(gp.paymentDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [gstPayments, effectiveStart, effectiveEnd]);

  const periodVouchers = useMemo(() => {
    return accountVouchers.filter((v) => {
      const d = extractDatePart(v.voucherDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [accountVouchers, effectiveStart, effectiveEnd]);

  const filteredVouchers = useMemo(() => {
    const q = voucherSearch.trim().toLowerCase();
    if (!q) return periodVouchers;
    return periodVouchers.filter(
      (v) =>
        v.ledgerHead.toLowerCase().includes(q) ||
        v.voucherNo.toLowerCase().includes(q) ||
        (v.payeeOrPayer || '').toLowerCase().includes(q) ||
        (v.narration || '').toLowerCase().includes(q)
    );
  }, [periodVouchers, voucherSearch]);

  const periodReturns = useMemo(() => {
    return returnNotes.filter((n) => {
      const d = extractDatePart(n.noteDate || n.returnDate);
      if (!d) return false;
      if (effectiveStart && d < effectiveStart) return false;
      if (effectiveEnd && d > effectiveEnd) return false;
      return true;
    });
  }, [returnNotes, effectiveStart, effectiveEnd]);

  // Period-Matched Party Ledger Breakdown (reconciles 1-to-1 with Sundry Creditors / Debtors on the active Balance Sheet)
  // Plus all-time cumulative reference when viewing a single day or custom date range.
  const partyLedgerSummary = useMemo(() => {
    const computeLedger = (
      purchasesSrc: PurchaseTransaction[],
      invoicesSrc: typeof periodInvoices,
      vouchersSrc: AccountLedgerVoucher[],
      returnsSrc: ReturnNote[]
    ) => {
      const byId = new Map<
        string,
        { opening: number; creditBills: number; settled: number; returns: number; netDue: number }
      >();

      const supplierList = partyAccounts.filter((p) => p.partyType === 'SUPPLIER');
      const memberList = partyAccounts.filter((p) => p.partyType === 'MEMBER');

      const supplierIdSet = new Set(supplierList.map((s) => s.id));
      const supplierNameMap = new Map<string, string>();
      supplierList.forEach((s) => supplierNameMap.set(s.name.trim().toLowerCase(), s.id));

      const memberIdSet = new Set(memberList.map((m) => m.id));
      const memberNameMap = new Map<string, string>();
      memberList.forEach((m) => memberNameMap.set(m.name.trim().toLowerCase(), m.id));

      partyAccounts.forEach((p) => {
        byId.set(p.id, {
          opening: r2(Math.max(0, Number(p.openingBalance || 0))),
          creditBills: 0,
          settled: 0,
          returns: 0,
          netDue: r2(Math.max(0, Number(p.openingBalance || 0))),
        });
      });

      let generalSupplierCreditBills = 0;
      let generalSupplierPaid = 0;
      let generalSupplierReturns = 0;

      // 1. Credit Purchases (respects purchaseSettlementMode just like Balance Sheet accounts)
      if (purchaseSettlementMode === 'CREDIT') {
        purchasesSrc.forEach((tx) => {
          if (tx.paymentStatus === 'CASH' || tx.paymentStatus === 'BANK_UPI') return;
          const txGst = Number(tx.totalGstAmount || 0);
          const txBase =
            Number(tx.baseAmount || 0) > 0
              ? Number(tx.baseAmount || 0)
              : Math.max(0, Number(tx.totalAmount || 0) - txGst);
          const txTot = r2(txBase + txGst);
          if (txTot <= 0) return;

          const matchedId =
            (tx.supplierId && supplierIdSet.has(tx.supplierId) ? tx.supplierId : undefined) ||
            (tx.supplierName ? supplierNameMap.get(tx.supplierName.trim().toLowerCase()) : undefined);

          if (matchedId && byId.has(matchedId)) {
            const entry = byId.get(matchedId)!;
            entry.creditBills = r2(entry.creditBills + txTot);
          } else {
            generalSupplierCreditBills = r2(generalSupplierCreditBills + txTot);
          }
        });
      }

      // 2. Credit Sales to Members
      invoicesSrc.forEach((inv) => {
        if (inv.creditPortion <= 0) return;
        const matchedId =
          (inv.customerId && memberIdSet.has(inv.customerId) ? inv.customerId : undefined) ||
          (inv.customerName ? memberNameMap.get(inv.customerName.trim().toLowerCase()) : undefined);
        if (matchedId && byId.has(matchedId)) {
          const entry = byId.get(matchedId)!;
          entry.creditBills = r2(entry.creditBills + inv.creditPortion);
        }
      });

      // 3. Supplier Payments & Member Receipts
      vouchersSrc.forEach((v) => {
        const amt = r2(Number(v.amount || 0));
        if (amt <= 0) return;
        if (v.voucherType === 'SUPPLIER_PAYMENT') {
          const matchedId =
            (v.partyId && supplierIdSet.has(v.partyId) ? v.partyId : undefined) ||
            (v.payeeOrPayer ? supplierNameMap.get(v.payeeOrPayer.trim().toLowerCase()) : undefined);
          if (matchedId && byId.has(matchedId)) {
            const entry = byId.get(matchedId)!;
            entry.settled = r2(entry.settled + amt);
          } else {
            generalSupplierPaid = r2(generalSupplierPaid + amt);
          }
        } else if (v.voucherType === 'MEMBER_RECEIPT') {
          const matchedId =
            (v.partyId && memberIdSet.has(v.partyId) ? v.partyId : undefined) ||
            (v.payeeOrPayer ? memberNameMap.get(v.payeeOrPayer.trim().toLowerCase()) : undefined);
          if (matchedId && byId.has(matchedId)) {
            const entry = byId.get(matchedId)!;
            entry.settled = r2(entry.settled + amt);
          }
        }
      });

      // 4. Credit-Ledger Returns
      returnsSrc.forEach((n) => {
        const retMode = n.settlementMode || n.refundMode || 'CASH';
        if (retMode === 'CASH' || retMode === 'BANK_UPI') return;
        const tot = r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0));
        if (tot <= 0) return;
        if (n.noteType === 'DEBIT_NOTE') {
          const matchedId =
            (n.partyId && supplierIdSet.has(n.partyId) ? n.partyId : undefined) ||
            (n.partyName ? supplierNameMap.get(n.partyName.trim().toLowerCase()) : undefined);
          if (matchedId && byId.has(matchedId)) {
            const entry = byId.get(matchedId)!;
            entry.returns = r2(entry.returns + tot);
          } else {
            generalSupplierReturns = r2(generalSupplierReturns + tot);
          }
        } else if (n.noteType === 'CREDIT_NOTE') {
          const matchedId =
            (n.partyId && memberIdSet.has(n.partyId) ? n.partyId : undefined) ||
            (n.partyName ? memberNameMap.get(n.partyName.trim().toLowerCase()) : undefined);
          if (matchedId && byId.has(matchedId)) {
            const entry = byId.get(matchedId)!;
            entry.returns = r2(entry.returns + tot);
          }
        }
      });

      let totalSupplierDue = 0;
      let totalMemberDue = 0;

      partyAccounts.forEach((p) => {
        const entry = byId.get(p.id)!;
        entry.netDue = r2(entry.opening + entry.creditBills - entry.settled - entry.returns);
        if (p.partyType === 'SUPPLIER') totalSupplierDue = r2(totalSupplierDue + Math.max(0, entry.netDue));
        else totalMemberDue = r2(totalMemberDue + Math.max(0, entry.netDue));
      });

      const generalSupplierNetDue = r2(
        generalSupplierCreditBills - generalSupplierPaid - generalSupplierReturns
      );
      if (generalSupplierNetDue > 0) {
        totalSupplierDue = r2(totalSupplierDue + generalSupplierNetDue);
      }

      return {
        byId,
        supplierList,
        memberList,
        generalSupplierCreditBills,
        generalSupplierPaid,
        generalSupplierReturns,
        generalSupplierNetDue,
        totalSupplierDue,
        totalMemberDue,
      };
    };

    const periodResult = computeLedger(periodPurchases, periodInvoices, periodVouchers, periodReturns);
    const allTimeResult = computeLedger(activePurchases, allInvoices, accountVouchers, returnNotes);

    return {
      ...periodResult,
      allTimeById: allTimeResult.byId,
      allTimeGeneralSupplierNetDue: allTimeResult.generalSupplierNetDue,
      allTimeTotalSupplierDue: allTimeResult.totalSupplierDue,
    };
  }, [
    partyAccounts,
    periodPurchases,
    periodInvoices,
    periodVouchers,
    periodReturns,
    activePurchases,
    allInvoices,
    accountVouchers,
    returnNotes,
    purchaseSettlementMode,
  ]);

  // Standard Indian Double-Entry Final Accounts Calculation
  // (Trading A/c -> Profit & Loss A/c -> Cash & Bank Book -> Pure Balance Sheet -> Trial Balance)
  const accounts = useMemo(() => {
    // 1. Period Sales & Collections (Cash, UPI, Split, Credit)
    const cashSales = r2(periodInvoices.reduce((sum, i) => sum + i.cashPortion, 0));
    const upiSales = r2(periodInvoices.reduce((sum, i) => sum + i.bankPortion, 0));
    const creditSales = r2(periodInvoices.reduce((sum, i) => sum + i.creditPortion, 0));
    const totalSalesRounded = r2(cashSales + upiSales + creditSales);
    const totalSalesDiscount = r2(periodInvoices.reduce((sum, i) => sum + i.discountAmt, 0));
    const grossSalesBase = r2(periodInvoices.reduce((sum, i) => sum + i.baseTotal, 0));
    const grossSalesBeforeDiscount = r2(grossSalesBase + totalSalesDiscount);
    const grossOutputGst = r2(periodInvoices.reduce((sum, i) => sum + i.totalGst, 0));
    const grossOutputCgst = r2(periodInvoices.reduce((sum, i) => sum + i.totalCgst, 0));
    const grossOutputSgst = r2(periodInvoices.reduce((sum, i) => sum + i.totalSgst, 0));
    const grossCogsBase = r2(periodInvoices.reduce((sum, i) => sum + i.cogsBase, 0));
    const salesRoundOff = r2(totalSalesRounded - grossOutputGst - grossSalesBase);

    // 1b. Sales Returns (Credit Notes) & Purchase Returns (Debit Notes)
    const creditNotes = periodReturns.filter((n) => n.noteType === 'CREDIT_NOTE');
    const debitNotes = periodReturns.filter((n) => n.noteType === 'DEBIT_NOTE');

    const salesReturnBase = r2(creditNotes.reduce((s, n) => s + Number(n.baseAmount || 0), 0));
    const salesReturnGst = r2(creditNotes.reduce((s, n) => s + Number(n.totalGstAmount || 0), 0));
    const salesReturnHalfGst = r2(
      creditNotes.reduce((s, n) => s + r2(Number(n.totalGstAmount || 0) / 2), 0)
    );
    const salesReturnCgst = salesReturnHalfGst;
    const salesReturnSgst = salesReturnHalfGst;
    const salesReturnTotal = r2(salesReturnBase + salesReturnGst);
    const salesReturnCash = r2(
      creditNotes
        .filter((n) => (n.settlementMode || n.refundMode) === 'CASH')
        .reduce((s, n) => s + r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0)), 0)
    );
    const salesReturnBank = r2(
      creditNotes
        .filter((n) => (n.settlementMode || n.refundMode) === 'BANK_UPI')
        .reduce((s, n) => s + r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0)), 0)
    );
    const salesReturnCreditLedger = r2(salesReturnTotal - salesReturnCash - salesReturnBank);
    const salesReturnCostBase = r2(
      creditNotes.reduce((s, n) => {
        const prod = productMap.get(n.productId);
        const unitCost = Number(prod?.costPrice || n.unitPriceWD || n.unitRateExclGst || 0);
        return s + Number(n.quantity || 0) * unitCost;
      }, 0)
    );

    const purchaseReturnBase = r2(debitNotes.reduce((s, n) => s + Number(n.baseAmount || 0), 0));
    const purchaseReturnGst = r2(debitNotes.reduce((s, n) => s + Number(n.totalGstAmount || 0), 0));
    const purchaseReturnHalfGst = r2(
      debitNotes.reduce((s, n) => s + r2(Number(n.totalGstAmount || 0) / 2), 0)
    );
    const purchaseReturnCgst = purchaseReturnHalfGst;
    const purchaseReturnSgst = purchaseReturnHalfGst;
    const purchaseReturnTotal = r2(purchaseReturnBase + purchaseReturnGst);
    const purchaseReturnCash = r2(
      debitNotes
        .filter((n) => (n.settlementMode || n.refundMode) === 'CASH')
        .reduce((s, n) => s + r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0)), 0)
    );
    const purchaseReturnBank = r2(
      debitNotes
        .filter((n) => (n.settlementMode || n.refundMode) === 'BANK_UPI')
        .reduce((s, n) => s + r2(Number(n.baseAmount || 0) + Number(n.totalGstAmount || 0)), 0)
    );
    const purchaseReturnCreditLedger = r2(
      purchaseReturnTotal - purchaseReturnCash - purchaseReturnBank
    );

    const salesBase = r2(grossSalesBase - salesReturnBase);
    const salesBaseBeforeDiscount = r2(grossSalesBeforeDiscount - salesReturnBase);
    const outputGst = r2(grossOutputGst - salesReturnGst);
    const outputCgst = r2(grossOutputCgst - salesReturnCgst);
    const outputSgst = r2(grossOutputSgst - salesReturnSgst);
    const cogsBase = r2(grossCogsBase - salesReturnCostBase);

    // 2. Period Purchases (Base Excl. GST + Symmetric Input CGST & Input SGST Credit)
    const grossPurchaseBase = r2(
      periodPurchases.reduce((sum, tx) => {
        const txGst = Number(tx.totalGstAmount || 0);
        const txBase =
          Number(tx.baseAmount || 0) > 0
            ? Number(tx.baseAmount || 0)
            : Math.max(0, Number(tx.totalAmount || 0) - txGst);
        return sum + txBase;
      }, 0)
    );
    const grossInputGst = r2(
      periodPurchases.reduce((sum, tx) => sum + Number(tx.totalGstAmount || 0), 0)
    );
    const grossInputHalfGst = r2(
      periodPurchases.reduce((sum, tx) => sum + r2(Number(tx.totalGstAmount || 0) / 2), 0)
    );
    const grossInputCgst = grossInputHalfGst;
    const grossInputSgst = grossInputHalfGst;
    const purchaseTotalInclGst = r2(grossPurchaseBase + grossInputGst);

    const purchaseBase = r2(grossPurchaseBase - purchaseReturnBase);
    const inputGst = r2(grossInputGst - purchaseReturnGst);
    const inputCgst = r2(grossInputCgst - purchaseReturnCgst);
    const inputSgst = r2(grossInputSgst - purchaseReturnSgst);

    // Absorb any ₹0.01 legacy odd-paise GST split difference into Round-Off Adjustment A/c
    // so CGST === SGST on intra-state supplies while Double-Entry Balance Sheet & Trial Balance tally to ₹0.00
    const gstSplitRoundOff = r2(
      outputGst - (outputCgst + outputSgst) + (inputCgst + inputSgst - inputGst)
    );
    const roundOffIncome = r2(salesRoundOff + gstSplitRoundOff);

    // 3. Closing Stock Valuation as on effectiveEnd (Valued at Cost Excl. GST per AS-2)
    const soldAfterEndMap = new Map<number, number>();
    const purchasedAfterEndMap = new Map<number, number>();

    if (effectiveEnd) {
      activeLedger.forEach((item) => {
        const d = extractDatePart(item.saleDate);
        if (d && d > effectiveEnd) {
          soldAfterEndMap.set(
            item.productId,
            (soldAfterEndMap.get(item.productId) || 0) + Number(item.quantity || 0)
          );
        }
      });
      activePurchases.forEach((tx) => {
        const d = extractDatePart(tx.purchaseDate);
        if (d && d > effectiveEnd) {
          purchasedAfterEndMap.set(
            tx.productId,
            (purchasedAfterEndMap.get(tx.productId) || 0) + Number(tx.addedQuantity || 0)
          );
        }
      });
    }

    let closingStockBase = 0;
    let closingStockInclGst = 0;
    let totalClosingUnits = 0;

    products.forEach((p) => {
      const soldAfter = soldAfterEndMap.get(p.id) || 0;
      const purchAfter = purchasedAfterEndMap.get(p.id) || 0;
      const qtyAsOfEnd = Math.max(0, Number(p.stock || 0) + soldAfter - purchAfter);
      const gstRate =
        p.gstPercent !== undefined && p.gstPercent !== null && Number.isFinite(Number(p.gstPercent))
          ? Number(p.gstPercent)
          : 0;
      const costBase = Number(p.costPrice || 0);
      const costIncl = costBase * (1 + gstRate / 100);

      totalClosingUnits += qtyAsOfEnd;
      closingStockBase += qtyAsOfEnd * costBase;
      closingStockInclGst += qtyAsOfEnd * costIncl;
    });

    closingStockBase = r2(closingStockBase);
    closingStockInclGst = r2(closingStockInclGst);

    // 4. STATEMENT 1: TRADING ACCOUNT (Excl. GST)
    const openingStockBase = r2(closingStockBase + cogsBase - purchaseBase);
    const grossProfit = r2(
      salesBaseBeforeDiscount + closingStockBase - (openingStockBase + purchaseBase)
    );
    const tradingDrTotal = r2(openingStockBase + purchaseBase + Math.max(0, grossProfit));
    const tradingCrTotal = r2(salesBaseBeforeDiscount + closingStockBase + Math.max(0, -grossProfit));

    // 5. Govt GST Challan Payments (PMT-06)
    const govtPaidCash = r2(
      periodGstPayments
        .filter((gp) => gp.paymentSource === 'CASH')
        .reduce((sum, gp) => sum + Number(gp.totalPaid || 0), 0)
    );
    const govtPaidBank = r2(
      periodGstPayments
        .filter((gp) => gp.paymentSource !== 'CASH')
        .reduce((sum, gp) => sum + Number(gp.totalPaid || 0), 0)
    );
    const govtCgstPaidTotal = r2(
      periodGstPayments.reduce((sum, gp) => sum + Number(gp.cgstPaid || 0), 0)
    );
    const govtSgstPaidTotal = r2(
      periodGstPayments.reduce((sum, gp) => sum + Number(gp.sgstPaid || 0), 0)
    );
    const govtTaxPaidTotal = r2(govtCgstPaidTotal + govtSgstPaidTotal);
    const govtFeePaidTotal = r2(
      periodGstPayments.reduce((sum, gp) => sum + Number(gp.interestOrFee || 0), 0)
    );

    // 6. Non-Inventory Account Ledger Vouchers (Expenses, Other Income, Contra, Supplier Payments, Member Receipts)
    const expenseByHeadMap = new Map<string, number>();
    const incomeByHeadMap = new Map<string, number>();
    let totalOperatingExpenses = 0;
    let totalOtherIncome = 0;
    let expenseCash = 0;
    let expenseBank = 0;
    let otherIncomeCash = 0;
    let otherIncomeBank = 0;
    let contraCashToBank = 0;
    let contraBankToCash = 0;
    let supplierPaidCash = 0;
    let supplierPaidBank = 0;
    let memberReceivedCash = 0;
    let memberReceivedBank = 0;
    let expenseCount = 0;
    let otherIncomeCount = 0;

    periodVouchers.forEach((v) => {
      const amt = r2(Number(v.amount || 0));
      if (amt <= 0) return;
      const head =
        v.ledgerHead ||
        (v.voucherType === 'OTHER_INCOME' ? 'Miscellaneous Income' : 'Miscellaneous Expense');

      if (v.voucherType === 'OTHER_INCOME') {
        otherIncomeCount += 1;
        totalOtherIncome = r2(totalOtherIncome + amt);
        incomeByHeadMap.set(head, r2((incomeByHeadMap.get(head) || 0) + amt));
        if (v.paymentMode === 'BANK_UPI') otherIncomeBank = r2(otherIncomeBank + amt);
        else otherIncomeCash = r2(otherIncomeCash + amt);
      } else if (v.voucherType === 'CONTRA_CASH_TO_BANK') {
        contraCashToBank = r2(contraCashToBank + amt);
      } else if (v.voucherType === 'CONTRA_BANK_TO_CASH') {
        contraBankToCash = r2(contraBankToCash + amt);
      } else if (v.voucherType === 'SUPPLIER_PAYMENT') {
        if (v.paymentMode === 'BANK_UPI') supplierPaidBank = r2(supplierPaidBank + amt);
        else supplierPaidCash = r2(supplierPaidCash + amt);
      } else if (v.voucherType === 'MEMBER_RECEIPT') {
        if (v.paymentMode === 'BANK_UPI') memberReceivedBank = r2(memberReceivedBank + amt);
        else memberReceivedCash = r2(memberReceivedCash + amt);
      } else {
        expenseCount += 1;
        totalOperatingExpenses = r2(totalOperatingExpenses + amt);
        expenseByHeadMap.set(head, r2((expenseByHeadMap.get(head) || 0) + amt));
        if (v.paymentMode === 'BANK_UPI') expenseBank = r2(expenseBank + amt);
        else expenseCash = r2(expenseCash + amt);
      }
    });

    // 6b. Fixed Assets & Period Depreciation
    let openingFixedAssetsNet = 0;
    let totalDepreciation = 0;
    fixedAssets.forEach((fa) => {
      const grossCost = Number(fa.purchaseCost ?? fa.costValue ?? 0);
      const accumDep = Number(fa.accumulatedDepreciation ?? fa.accumulatedDep ?? 0);
      const depRate = Number(fa.depreciationRatePercent ?? fa.depreciationRatePct ?? fa.depreciationRate ?? 0);
      const openNet = r2(Math.max(0, grossCost - accumDep));
      const dep = r2((openNet * depRate) / 100);
      openingFixedAssetsNet = r2(openingFixedAssetsNet + openNet);
      totalDepreciation = r2(totalDepreciation + dep);
    });
    const closingFixedAssetsNet = r2(Math.max(0, openingFixedAssetsNet - totalDepreciation));

    const expenseLedgers = Array.from(expenseByHeadMap.entries())
      .map(([ledgerHead, amount]) => ({ ledgerHead, amount }))
      .sort((a, b) => b.amount - a.amount);

    const otherIncomeLedgers = Array.from(incomeByHeadMap.entries())
      .map(([ledgerHead, amount]) => ({ ledgerHead, amount }))
      .sort((a, b) => b.amount - a.amount);

    // 7. STATEMENT 2: PROFIT & LOSS ACCOUNT
    const netProfit = r2(
      grossProfit +
        roundOffIncome +
        totalOtherIncome -
        totalSalesDiscount -
        totalOperatingExpenses -
        govtFeePaidTotal -
        totalDepreciation
    );
    const plDrTotal = r2(
      Math.max(0, -grossProfit) +
        Math.max(0, -roundOffIncome) +
        totalSalesDiscount +
        govtFeePaidTotal +
        totalOperatingExpenses +
        totalDepreciation +
        Math.max(0, netProfit)
    );
    const plCrTotal = r2(
      Math.max(0, grossProfit) +
        Math.max(0, roundOffIncome) +
        totalOtherIncome +
        Math.max(0, -netProfit)
    );

    // 8. STATEMENT 3: CASH & BANK ACCOUNT (2-Column Cash Book)
    let purchasePaidCash = 0;
    let purchasePaidBank = 0;
    let creditPurchasesInclGst = 0;

    if (purchaseSettlementMode === 'CASH') {
      purchasePaidCash = purchaseTotalInclGst;
    } else if (purchaseSettlementMode === 'BANK_UPI') {
      purchasePaidBank = purchaseTotalInclGst;
    } else {
      periodPurchases.forEach((tx) => {
        const txGst = Number(tx.totalGstAmount || 0);
        const txBase =
          Number(tx.baseAmount || 0) > 0
            ? Number(tx.baseAmount || 0)
            : Math.max(0, Number(tx.totalAmount || 0) - txGst);
        const txTot = r2(txBase + txGst);
        if (tx.paymentStatus === 'CASH') purchasePaidCash = r2(purchasePaidCash + txTot);
        else if (tx.paymentStatus === 'BANK_UPI') purchasePaidBank = r2(purchasePaidBank + txTot);
        else creditPurchasesInclGst = r2(creditPurchasesInclGst + txTot);
      });
    }

    const cashReceiptsTotal = r2(
      openingCashFloat +
        cashSales +
        otherIncomeCash +
        memberReceivedCash +
        contraBankToCash +
        purchaseReturnCash
    );
    const bankReceiptsTotal = r2(
      openingBankBalance +
        upiSales +
        otherIncomeBank +
        memberReceivedBank +
        contraCashToBank +
        purchaseReturnBank
    );
    const cashPaymentsOut = r2(
      purchasePaidCash +
        govtPaidCash +
        expenseCash +
        supplierPaidCash +
        contraCashToBank +
        salesReturnCash
    );
    const bankPaymentsOut = r2(
      purchasePaidBank +
        govtPaidBank +
        expenseBank +
        supplierPaidBank +
        contraBankToCash +
        salesReturnBank
    );

    const cashInHand = r2(cashReceiptsTotal - cashPaymentsOut);
    const bankUpiBalance = r2(bankReceiptsTotal - bankPaymentsOut);
    const totalLiquidFunds = r2(cashInHand + bankUpiBalance);

    // 9. STATEMENT 4: PURE BALANCE SHEET (Standard Indian Format)
    const openingCreditors = r2(
      partyAccounts
        .filter((p) => p.partyType === 'SUPPLIER')
        .reduce((s, p) => s + Math.max(0, Number(p.openingBalance || 0)), 0)
    );
    const openingDebtors = r2(
      partyAccounts
        .filter((p) => p.partyType === 'MEMBER')
        .reduce((s, p) => s + Math.max(0, Number(p.openingBalance || 0)), 0)
    );

    const supplierPaymentsTotal = r2(supplierPaidCash + supplierPaidBank);
    const memberReceiptsTotal = r2(memberReceivedCash + memberReceivedBank);

    const rawCreditors = r2(
      openingCreditors + creditPurchasesInclGst - supplierPaymentsTotal - purchaseReturnCreditLedger
    );
    const sundryCreditors = rawCreditors > 0 ? rawCreditors : 0;
    const supplierAdvancesAsset = rawCreditors < 0 ? r2(Math.abs(rawCreditors)) : 0;

    const rawDebtors = r2(
      openingDebtors + creditSales - memberReceiptsTotal - salesReturnCreditLedger
    );
    const sundryDebtors = rawDebtors > 0 ? rawDebtors : 0;
    const memberAdvancesLiability = rawDebtors < 0 ? r2(Math.abs(rawDebtors)) : 0;

    // Separate Statutory CGST & SGST Ledgers (Section 49(5) CGST Act 2017 — no cross-utilization between CGST & SGST)
    const openingCgstItc = r2(Math.max(0, Number(adminSettings?.openingCgstItc || 0)));
    const openingSgstItc = r2(Math.max(0, Number(adminSettings?.openingSgstItc || 0)));
    const availableInputCgst = r2(openingCgstItc + inputCgst);
    const availableInputSgst = r2(openingSgstItc + inputSgst);

    const netCgstDiff = r2(outputCgst - availableInputCgst - govtCgstPaidTotal);
    const netCgstPayable = netCgstDiff > 0 ? netCgstDiff : 0;
    const cgstItcReceivable = netCgstDiff < 0 ? r2(Math.abs(netCgstDiff)) : 0;

    const netSgstDiff = r2(outputSgst - availableInputSgst - govtSgstPaidTotal);
    const netSgstPayable = netSgstDiff > 0 ? netSgstDiff : 0;
    const sgstItcReceivable = netSgstDiff < 0 ? r2(Math.abs(netSgstDiff)) : 0;

    const netGstPayable = r2(netCgstPayable + netSgstPayable);
    const itcReceivable = r2(cgstItcReceivable + sgstItcReceivable);

    const openingCashAndBankCapital = r2(openingCashFloat + openingBankBalance);
    const openingCapitalFund = r2(
      openingCashAndBankCapital +
        openingStockBase +
        openingFixedAssetsNet +
        openingDebtors +
        openingCgstItc +
        openingSgstItc -
        openingCreditors
    );
    const closingCapitalFund = r2(openingCapitalFund + netProfit);

    const totalCurrentLiabilities = r2(
      sundryCreditors + memberAdvancesLiability + netCgstPayable + netSgstPayable
    );
    const totalLiabilitiesAndCapital = r2(closingCapitalFund + totalCurrentLiabilities);

    const totalAssets = r2(
      closingFixedAssetsNet +
        closingStockBase +
        sundryDebtors +
        supplierAdvancesAsset +
        cashInHand +
        bankUpiBalance +
        cgstItcReceivable +
        sgstItcReceivable
    );
    const balanceVariance = r2(totalAssets - totalLiabilitiesAndCapital);

    // 10. STATEMENT 5: TRIAL BALANCE (Total Dr = Total Cr before closing Stock adjustment)
    // In a standard Trial Balance:
    // Debit Balances: Opening Stock, Net Purchases, Operating Expenses, Govt Fees, Depreciation, Fixed Assets (Net), Sundry Debtors, Supplier Advances, Cash in Hand, Bank Balance, ITC Receivable
    // Credit Balances: Opening Capital Fund, Net Sales, Round-Off Income (if >0), Other Income, Sundry Creditors, Member Advances, Net GST Payable
    const trialBalanceRows: { head: string; category: string; debit: number; credit: number }[] = [
      {
        head: 'Society Capital & Reserves Fund (Opening)',
        category: 'Capital & Reserves',
        debit: openingCapitalFund < 0 ? r2(Math.abs(openingCapitalFund)) : 0,
        credit: openingCapitalFund >= 0 ? openingCapitalFund : 0,
      },
      {
        head: 'Opening Stock-in-Trade (Excl. GST)',
        category: 'Trading A/c',
        debit: openingStockBase >= 0 ? openingStockBase : 0,
        credit: openingStockBase < 0 ? r2(Math.abs(openingStockBase)) : 0,
      },
      {
        head: 'Net Purchases A/c (Less Purchase Returns)',
        category: 'Trading A/c',
        debit: purchaseBase >= 0 ? purchaseBase : 0,
        credit: purchaseBase < 0 ? r2(Math.abs(purchaseBase)) : 0,
      },
      {
        head: 'Gross Sales Revenue A/c (Less Sales Returns)',
        category: 'Trading A/c',
        debit: salesBaseBeforeDiscount < 0 ? r2(Math.abs(salesBaseBeforeDiscount)) : 0,
        credit: salesBaseBeforeDiscount >= 0 ? salesBaseBeforeDiscount : 0,
      },
      ...(totalSalesDiscount > 0
        ? [
            {
              head: 'Discount Allowed A/c (POS Sales Rebates)',
              category: 'Profit & Loss A/c',
              debit: totalSalesDiscount,
              credit: 0,
            },
          ]
        : []),
      {
        head: 'Operating Expenses (Salary, Rent, Utilities)',
        category: 'Profit & Loss A/c',
        debit: totalOperatingExpenses,
        credit: 0,
      },
      {
        head: 'Other Non-Trading Income A/c',
        category: 'Profit & Loss A/c',
        debit: 0,
        credit: totalOtherIncome,
      },
      {
        head: 'Invoice Round-Off Adjustment A/c',
        category: 'Profit & Loss A/c',
        debit: roundOffIncome < 0 ? r2(Math.abs(roundOffIncome)) : 0,
        credit: roundOffIncome >= 0 ? roundOffIncome : 0,
      },
      {
        head: 'GST Late Fee / Interest Expense',
        category: 'Profit & Loss A/c',
        debit: govtFeePaidTotal,
        credit: 0,
      },
      {
        head: 'Depreciation on Fixed Assets',
        category: 'Profit & Loss A/c',
        debit: totalDepreciation,
        credit: 0,
      },
      {
        head: 'Fixed Assets (Net Block)',
        category: 'Fixed Assets',
        debit: closingFixedAssetsNet,
        credit: 0,
      },
      {
        head: 'Sundry Debtors (Member Credit Receivable)',
        category: 'Current Assets',
        debit: sundryDebtors,
        credit: memberAdvancesLiability,
      },
      {
        head: 'Sundry Creditors (Supplier Trade Payable)',
        category: 'Current Liabilities',
        debit: supplierAdvancesAsset,
        credit: sundryCreditors,
      },
      {
        head: 'CGST Duties & Taxes A/c (Central Tax: Output vs Input ITC)',
        category: 'Statutory Taxes (CGST)',
        debit: cgstItcReceivable,
        credit: netCgstPayable,
      },
      {
        head: 'SGST Duties & Taxes A/c (State Tax: Output vs Input ITC)',
        category: 'Statutory Taxes (SGST)',
        debit: sgstItcReceivable,
        credit: netSgstPayable,
      },
      {
        head: 'Cash in Hand (Closing per Cash Book)',
        category: 'Current Assets',
        debit: cashInHand >= 0 ? cashInHand : 0,
        credit: cashInHand < 0 ? r2(Math.abs(cashInHand)) : 0,
      },
      {
        head: 'Bank / UPI Account (Closing per Cash Book)',
        category: 'Current Assets',
        debit: bankUpiBalance >= 0 ? bankUpiBalance : 0,
        credit: bankUpiBalance < 0 ? r2(Math.abs(bankUpiBalance)) : 0,
      },
    ];

    const trialDebitTotal = r2(trialBalanceRows.reduce((s, r) => s + r.debit, 0));
    const trialCreditTotal = r2(trialBalanceRows.reduce((s, r) => s + r.credit, 0));

    return {
      cashSales,
      upiSales,
      creditSales,
      totalSalesRounded,
      totalSalesDiscount,
      grossSalesBase,
      grossSalesBeforeDiscount,
      salesReturnBase,
      salesReturnGst,
      salesReturnTotal,
      salesBase,
      salesBaseBeforeDiscount,
      outputGst,
      outputCgst,
      outputSgst,
      cogsBase,
      grossPurchaseBase,
      purchaseReturnBase,
      purchaseReturnGst,
      purchaseReturnTotal,
      purchaseBase,
      inputGst,
      inputCgst,
      inputSgst,
      purchaseTotalInclGst,
      // Trading A/c
      openingStockBase,
      closingStockBase,
      closingStockInclGst,
      totalClosingUnits: Number(totalClosingUnits.toFixed(2)),
      grossProfit,
      tradingDrTotal,
      tradingCrTotal,
      // P&L A/c & Ledgers
      roundOffIncome,
      govtFeePaidTotal,
      totalDepreciation,
      expenseLedgers,
      otherIncomeLedgers,
      totalOperatingExpenses,
      totalOtherIncome,
      expenseCount,
      otherIncomeCount,
      netProfit,
      plDrTotal,
      plCrTotal,
      // Cash Book
      purchasePaidCash,
      purchasePaidBank,
      govtPaidCash,
      govtPaidBank,
      govtCgstPaidTotal,
      govtSgstPaidTotal,
      govtTaxPaidTotal,
      otherIncomeCash,
      otherIncomeBank,
      expenseCash,
      expenseBank,
      contraCashToBank,
      contraBankToCash,
      supplierPaidCash,
      supplierPaidBank,
      memberReceivedCash,
      memberReceivedBank,
      salesReturnCash,
      salesReturnBank,
      purchaseReturnCash,
      purchaseReturnBank,
      cashReceiptsTotal,
      bankReceiptsTotal,
      cashPaymentsOut,
      bankPaymentsOut,
      cashInHand,
      bankUpiBalance,
      totalLiquidFunds,
      // Balance Sheet
      openingFixedAssetsNet,
      closingFixedAssetsNet,
      openingDebtors,
      openingCreditors,
      openingCgstItc,
      openingSgstItc,
      availableInputCgst,
      availableInputSgst,
      openingCashAndBankCapital,
      openingCapitalFund,
      closingCapitalFund,
      sundryCreditors,
      supplierAdvancesAsset,
      sundryDebtors,
      memberAdvancesLiability,
      netCgstPayable,
      netSgstPayable,
      netGstPayable,
      cgstItcReceivable,
      sgstItcReceivable,
      itcReceivable,
      totalCurrentLiabilities,
      totalLiabilitiesAndCapital,
      totalAssets,
      balanceVariance,
      // Trial Balance
      trialBalanceRows,
      trialDebitTotal,
      trialCreditTotal,
    };
  }, [
    periodInvoices,
    periodPurchases,
    periodGstPayments,
    periodVouchers,
    periodReturns,
    partyAccounts,
    fixedAssets,
    products,
    productMap,
    activeLedger,
    activePurchases,
    effectiveEnd,
    openingCashFloat,
    openingBankBalance,
    purchaseSettlementMode,
    adminSettings?.openingCgstItc,
    adminSettings?.openingSgstItc,
  ]);

  // Chronological Cash & Bank Book Ledger Entries (Sales + Other Income + Purchases + Expenses + Govt PMT-06)
  const cashBookEntries = useMemo(() => {
    type Entry = {
      id: string;
      date: string;
      particulars: string;
      ref: string;
      type: 'RECEIPT' | 'PAYMENT';
      cashAmt: number;
      bankAmt: number;
    };
    const entries: Entry[] = [];

    periodInvoices.forEach((inv) => {
      entries.push({
        id: `sale-${inv.invoiceNo}`,
        date: inv.saleDate || inv.dateOnly,
        particulars: `To Sales A/c (${inv.customerName})`,
        ref: inv.invoiceNo,
        type: 'RECEIPT',
        cashAmt: inv.paymentMode === 'CASH' ? inv.grandTotal : 0,
        bankAmt: inv.paymentMode !== 'CASH' ? inv.grandTotal : 0,
      });
    });

    periodVouchers.forEach((v) => {
      const amt = r2(Number(v.amount || 0));
      if (amt <= 0) return;
      const party = v.payeeOrPayer ? ` · ${v.payeeOrPayer}` : '';
      if (v.voucherType === 'OTHER_INCOME' || v.voucherType === 'MEMBER_RECEIPT') {
        entries.push({
          id: `vch-${v.id}`,
          date: v.voucherDate,
          particulars: `To ${v.ledgerHead}${party}`,
          ref: v.voucherNo,
          type: 'RECEIPT',
          cashAmt: v.paymentMode === 'CASH' ? amt : 0,
          bankAmt: v.paymentMode === 'BANK_UPI' ? amt : 0,
        });
      } else if (v.voucherType === 'CONTRA_CASH_TO_BANK') {
        entries.push({
          id: `vch-${v.id}-cr`,
          date: v.voucherDate,
          particulars: `By Bank A/c (Contra Cash Deposit)${party}`,
          ref: v.voucherNo,
          type: 'PAYMENT',
          cashAmt: amt,
          bankAmt: 0,
        });
        entries.push({
          id: `vch-${v.id}-dr`,
          date: v.voucherDate,
          particulars: `To Cash A/c (Contra Cash Deposit)${party}`,
          ref: v.voucherNo,
          type: 'RECEIPT',
          cashAmt: 0,
          bankAmt: amt,
        });
      } else if (v.voucherType === 'CONTRA_BANK_TO_CASH') {
        entries.push({
          id: `vch-${v.id}-cr`,
          date: v.voucherDate,
          particulars: `By Cash A/c (Contra Bank Withdrawal)${party}`,
          ref: v.voucherNo,
          type: 'PAYMENT',
          cashAmt: 0,
          bankAmt: amt,
        });
        entries.push({
          id: `vch-${v.id}-dr`,
          date: v.voucherDate,
          particulars: `To Bank A/c (Contra Bank Withdrawal)${party}`,
          ref: v.voucherNo,
          type: 'RECEIPT',
          cashAmt: amt,
          bankAmt: 0,
        });
      } else {
        entries.push({
          id: `vch-${v.id}`,
          date: v.voucherDate,
          particulars: `By ${v.ledgerHead}${party}`,
          ref: v.voucherNo,
          type: 'PAYMENT',
          cashAmt: v.paymentMode === 'CASH' ? amt : 0,
          bankAmt: v.paymentMode === 'BANK_UPI' ? amt : 0,
        });
      }
    });

    periodReturns.forEach((rn) => {
      const settle = rn.settlementMode || rn.refundMode || 'CASH';
      if (settle === 'CREDIT_LEDGER' || settle === 'ADJUST_LEDGER' || settle === 'ADJUST_CREDIT') return;
      const amt = r2(Number(rn.totalAmount || 0));
      if (amt <= 0) return;
      const rDate = rn.noteDate || rn.returnDate || todayStr;
      if (rn.noteType === 'CREDIT_NOTE') {
        entries.push({
          id: `ret-${rn.id}`,
          date: rDate,
          particulars: `By Sales Return Credit Note (${rn.productName})`,
          ref: rn.noteNo,
          type: 'PAYMENT',
          cashAmt: settle === 'CASH' ? amt : 0,
          bankAmt: settle === 'BANK_UPI' ? amt : 0,
        });
      } else {
        entries.push({
          id: `ret-${rn.id}`,
          date: rDate,
          particulars: `To Purchase Return Debit Note (${rn.productName})`,
          ref: rn.noteNo,
          type: 'RECEIPT',
          cashAmt: settle === 'CASH' ? amt : 0,
          bankAmt: settle === 'BANK_UPI' ? amt : 0,
        });
      }
    });

    if (purchaseSettlementMode !== 'CREDIT') {
      periodPurchases.forEach((tx) => {
        const amt = r2(Number(tx.totalAmount || 0));
        if (amt <= 0) return;
        entries.push({
          id: `pur-${tx.id}`,
          date: tx.purchaseDate,
          particulars: `By Purchases A/c (${tx.productName})`,
          ref: tx.purchaseRef,
          type: 'PAYMENT',
          cashAmt: purchaseSettlementMode === 'CASH' ? amt : 0,
          bankAmt: purchaseSettlementMode === 'BANK_UPI' ? amt : 0,
        });
      });
    }

    periodGstPayments.forEach((gp) => {
      const amt = r2(Number(gp.totalPaid || 0));
      const gpCgst = r2(Number(gp.cgstPaid || 0));
      const gpSgst = r2(Number(gp.sgstPaid || 0));
      const gpFee = r2(Number(gp.interestOrFee || 0));
      entries.push({
        id: `gst-${gp.id}`,
        date: gp.paymentDate,
        particulars: `By Govt GST Challan PMT-06 (${gp.returnPeriod} · CGST ₹${gpCgst.toFixed(2)}, SGST ₹${gpSgst.toFixed(2)}${gpFee > 0 ? `, Fee ₹${gpFee.toFixed(2)}` : ''})`,
        ref: gp.challanRef,
        type: 'PAYMENT',
        cashAmt: gp.paymentSource === 'CASH' ? amt : 0,
        bankAmt: gp.paymentSource !== 'CASH' ? amt : 0,
      });
    });

    return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [periodInvoices, periodVouchers, periodReturns, periodPurchases, periodGstPayments, purchaseSettlementMode]);

  // Day-by-Day Supporting Schedule
  const dayRows: BalanceSheetDayRow[] = useMemo(() => {
    const map = new Map<string, BalanceSheetDayRow>();

    const getOrCreate = (date: string): BalanceSheetDayRow => {
      const existing = map.get(date);
      if (existing) return existing;
      const fresh: BalanceSheetDayRow = {
        date,
        invoiceCount: 0,
        cashSales: 0,
        upiSales: 0,
        salesBase: 0,
        discountAllowed: 0,
        outputCgst: 0,
        outputSgst: 0,
        outputGst: 0,
        roundOff: 0,
        grossTurnover: 0,
        cogsBase: 0,
        tradingProfit: 0,
        purchasesBase: 0,
        purchasesCgst: 0,
        purchasesSgst: 0,
        purchasesGst: 0,
        purchaseCount: 0,
      };
      map.set(date, fresh);
      return fresh;
    };

    periodInvoices.forEach((inv) => {
      if (!inv.dateOnly) return;
      const row = getOrCreate(inv.dateOnly);
      row.invoiceCount += 1;
      if (inv.paymentMode === 'CASH') row.cashSales = r2(row.cashSales + inv.grandTotal);
      else row.upiSales = r2(row.upiSales + inv.grandTotal);
      row.salesBase = r2(row.salesBase + inv.baseTotal);
      row.discountAllowed = r2((row.discountAllowed || 0) + inv.discountAmt);
      row.outputCgst = r2(row.outputCgst + inv.totalCgst);
      row.outputSgst = r2(row.outputSgst + inv.totalSgst);
      row.outputGst = r2(row.outputGst + inv.totalGst);
      row.roundOff = r2(row.roundOff + inv.roundOff);
      row.grossTurnover = r2(row.grossTurnover + inv.grandTotal);
      row.cogsBase = r2(row.cogsBase + inv.cogsBase);
    });

    periodPurchases.forEach((tx) => {
      const d = extractDatePart(tx.purchaseDate);
      if (!d) return;
      const row = getOrCreate(d);
      const txGst = Number(tx.totalGstAmount || 0);
      const txHalfGst = r2(txGst / 2);
      const txBase =
        Number(tx.baseAmount || 0) > 0
          ? Number(tx.baseAmount || 0)
          : Math.max(0, Number(tx.totalAmount || 0) - txGst);
      row.purchasesBase = r2(row.purchasesBase + txBase);
      row.purchasesCgst = r2(row.purchasesCgst + txHalfGst);
      row.purchasesSgst = r2(row.purchasesSgst + txHalfGst);
      row.purchasesGst = r2(row.purchasesGst + txGst);
      row.purchaseCount += 1;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        tradingProfit: r2(row.salesBase - row.cogsBase + row.roundOff),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [periodInvoices, periodPurchases]);

  const periodLabel =
    periodMode === 'DAY'
      ? `Day Wise: ${selectedDay}`
      : `Date Range: ${rangeStart || 'Earliest'} to ${rangeEnd || 'Latest'}`;

  const purchaseSettlementLabel =
    purchaseSettlementMode === 'BANK_UPI'
      ? 'Paid via Bank / UPI'
      : purchaseSettlementMode === 'CASH'
      ? 'Paid via Cash Drawer'
      : 'Supplier Credit (Sundry Creditors)';

  const triggerPrint = (target: PrintTarget) => {
    flushSync(() => {
      setPrintTarget(target);
    });
    window.print();
    setTimeout(() => {
      setPrintTarget('CURRENT');
    }, 500);
  };

  const handleExportCsv = () => {
    exportBalanceSheetToCsv({
      societyName: society.name,
      periodLabel,
      openingStockBase: accounts.openingStockBase,
      purchaseBase: accounts.purchaseBase,
      salesBase: accounts.salesBase,
      closingStockBase: accounts.closingStockBase,
      closingStockInclGst: accounts.closingStockInclGst,
      cogsBase: accounts.cogsBase,
      grossProfit: accounts.grossProfit,
      outputCgst: accounts.outputCgst,
      outputSgst: accounts.outputSgst,
      inputCgst: accounts.inputCgst,
      inputSgst: accounts.inputSgst,
      openingCgstItc: accounts.openingCgstItc,
      openingSgstItc: accounts.openingSgstItc,
      govtCgstPaidTotal: accounts.govtCgstPaidTotal,
      govtSgstPaidTotal: accounts.govtSgstPaidTotal,
      roundOffIncome: accounts.roundOffIncome,
      govtFeePaidTotal: accounts.govtFeePaidTotal,
      expenseLedgers: accounts.expenseLedgers,
      otherIncomeLedgers: accounts.otherIncomeLedgers,
      totalOperatingExpenses: accounts.totalOperatingExpenses,
      totalOtherIncome: accounts.totalOtherIncome,
      netProfit: accounts.netProfit,
      openingCashFloat,
      openingBankBalance,
      cashSales: accounts.cashSales,
      upiSales: accounts.upiSales,
      otherIncomeCash: accounts.otherIncomeCash,
      otherIncomeBank: accounts.otherIncomeBank,
      expenseCash: accounts.expenseCash,
      expenseBank: accounts.expenseBank,
      purchasePaidCash: accounts.purchasePaidCash,
      purchasePaidBank: accounts.purchasePaidBank,
      govtPaidCash: accounts.govtPaidCash,
      govtPaidBank: accounts.govtPaidBank,
      cashInHand: accounts.cashInHand,
      bankUpiBalance: accounts.bankUpiBalance,
      openingCapitalFund: accounts.openingCapitalFund,
      closingCapitalFund: accounts.closingCapitalFund,
      sundryCreditors: accounts.sundryCreditors,
      netCgstPayable: accounts.netCgstPayable,
      netSgstPayable: accounts.netSgstPayable,
      netGstPayable: accounts.netGstPayable,
      cgstItcReceivable: accounts.cgstItcReceivable,
      sgstItcReceivable: accounts.sgstItcReceivable,
      itcReceivable: accounts.itcReceivable,
      totalAssets: accounts.totalAssets,
      totalLiabilitiesAndCapital: accounts.totalLiabilitiesAndCapital,
      purchaseSettlementLabel,
      dayRows,
    });
  };

  const applyRangePreset = (preset: 'LAST_7' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL_TIME') => {
    setPeriodMode('RANGE');
    if (preset === 'LAST_7') {
      setRangeStart(sevenDaysAgoStr);
      setRangeEnd(todayStr);
    } else if (preset === 'THIS_MONTH') {
      setRangeStart(thisMonthStartStr);
      setRangeEnd(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const { start, end } = getIstMonthRange(-1);
      setRangeStart(start);
      setRangeEnd(end);
    } else {
      const oldest = activeDates[activeDates.length - 1] || todayStr;
      setRangeStart(oldest);
      setRangeEnd(todayStr);
    }
  };

  const effectiveView: AccountViewTab = printTarget === 'CURRENT' ? activeAccountTab : printTarget;
  const isPrintingSpecificSingle = printTarget !== 'CURRENT' && printTarget !== 'ALL';

  const showTrading = effectiveView === 'ALL' || effectiveView === 'TRADING';
  const showPL = effectiveView === 'ALL' || effectiveView === 'PL';
  const showCashBook = effectiveView === 'ALL' || effectiveView === 'CASH_BOOK';
  const showBalanceSheet = effectiveView === 'ALL' || effectiveView === 'BALANCE_SHEET';
  const showTrialBalance = effectiveView === 'ALL' || effectiveView === 'TRIAL_BALANCE';
  const showVouchersRegister = printTarget === 'ALL' || effectiveView === 'VOUCHERS';
  const showPartiesTab = effectiveView === 'PARTIES';
  const showReturnsTab = effectiveView === 'RETURNS';
  const showFixedAssetsTab = effectiveView === 'FIXED_ASSETS';
  const showCashBookLedger = activeAccountTab === 'CASH_BOOK' || printTarget === 'ALL' || printTarget === 'CASH_BOOK';
  const showDailySchedule =
    !isPrintingSpecificSingle &&
    !showPartiesTab &&
    !showReturnsTab &&
    !showFixedAssetsTab;

  return (
    <div className="w-full px-4 sm:px-5 lg:px-6 py-5 space-y-5 min-w-0">
      {/* Header & Period Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 overflow-hidden print:hidden">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{society.name}</span>
              <span aria-hidden="true">·</span>
              <span>Indian Accounting Standard Final Accounts (GAAP)</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code tabular-nums text-emerald-700 font-semibold">
                {periodLabel}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 leading-snug">
              Trading A/c, Profit &amp; Loss A/c, Cash Book &amp; Balance Sheet
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {onAddAccountVoucher && (
              <>
                <button
                  type="button"
                  onClick={() => openVoucherModal('EXPENSE')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Record Expense (Salary / Rent)</span>
                </button>
                <button
                  type="button"
                  onClick={() => openVoucherModal('OTHER_INCOME')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Record Other Income</span>
                </button>
                <button
                  type="button"
                  onClick={() => openVoucherModal('SUPPLIER_PAYMENT')}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                  title="Pay back a supplier for credit purchases (reduces Sundry Creditors & deducts from Cash/Bank Book)"
                >
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>Pay Supplier (Credit Payback)</span>
                </button>
                <button
                  type="button"
                  onClick={() => openVoucherModal('CONTRA_CASH_TO_BANK')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                  title="Record Contra (Cash Deposit to Bank or Bank Withdrawal) or Member Credit Receipt"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                  <span>Contra / Member Receipt</span>
                </button>
              </>
            )}
            {onRefreshData && (
              <button
                type="button"
                onClick={handleRefreshLive}
                disabled={isRefreshing}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync Live Data'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => triggerPrint('CURRENT')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              title="Print the currently selected statement tab"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={() => triggerPrint('ALL')}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              title="Print all 4 Final Accounts, Salary & Other Income Vouchers, and Daily Schedule together"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Print All</span>
            </button>
          </div>
        </div>

        {/* Period Toolbar & Opening Balances */}
        <div className="pt-4 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => setPeriodMode('DAY')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  periodMode === 'DAY'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day Wise
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('RANGE')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  periodMode === 'RANGE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Date Range Wise
              </button>
            </div>

            {periodMode === 'DAY' ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="date"
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value || todayStr)}
                    className="bg-transparent font-mono-code font-bold text-slate-900 outline-none"
                  />
                </div>
                <select
                  value={activeDates.includes(selectedDay) ? selectedDay : ''}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDay(e.target.value);
                  }}
                  className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="">Jump to Business Date...</option>
                  {activeDates.map((d) => (
                    <option key={d} value={d}>
                      {d} {d === todayStr ? '(Today)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSelectedDay(todayStr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedDay === todayStr
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDay(yesterdayStr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedDay === yesterdayStr
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Yesterday
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-slate-500 font-bold">From</span>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="bg-transparent font-mono-code font-bold text-slate-900 outline-none"
                  />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500 font-bold">To</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="bg-transparent font-mono-code font-bold text-slate-900 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => applyRangePreset('LAST_7')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyRangePreset('THIS_MONTH')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => applyRangePreset('LAST_MONTH')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => applyRangePreset('ALL_TIME')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  All Time
                </button>
              </div>
            )}
          </div>

          {/* Opening Cash, Opening Bank & Purchase Settlement Mode */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="font-semibold text-slate-600 whitespace-nowrap">Opening Cash (₹):</span>
              <input
                type="number"
                min="0"
                step="100"
                value={openingCashFloat}
                onChange={(e) => handleOpeningCashChange(e.target.value)}
                className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-0.5 font-mono-code font-bold text-slate-900 text-right outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="font-semibold text-slate-600 whitespace-nowrap">Opening Bank (₹):</span>
              <input
                type="number"
                min="0"
                step="100"
                value={openingBankBalance}
                onChange={(e) => handleOpeningBankChange(e.target.value)}
                className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-0.5 font-mono-code font-bold text-slate-900 text-right outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label
              className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
              title="In Per-Purchase / Supplier Credit mode, each purchase automatically follows the payment status chosen during stock entry (On Credit, Cash, or Bank/UPI)."
            >
              <span className="font-semibold text-slate-600 whitespace-nowrap">Stock Purchases Paid Via:</span>
              <select
                value={purchaseSettlementMode}
                onChange={(e) =>
                  handlePurchaseSettlementChange(e.target.value as PurchaseSettlementMode)
                }
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CREDIT">Per-Purchase Mode / Supplier Credit (Sundry Creditors)</option>
                <option value="BANK_UPI">Force All Purchases as Bank / UPI</option>
                <option value="CASH">Force All Purchases as Cash Drawer</option>
              </select>
            </label>
            {(openingCashFloat > 0 || openingBankBalance > 0 || purchaseSettlementMode !== 'CREDIT') && (
              <button
                type="button"
                onClick={handleResetOpeningBalances}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Statement Selector Tabs */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'ALL', label: 'All Final Accounts', icon: FileSpreadsheet },
              { id: 'TRADING', label: '1. Trading Account', icon: BookOpen },
              { id: 'PL', label: '2. Profit & Loss A/c', icon: TrendingUp },
              { id: 'CASH_BOOK', label: '3. Cash & Bank Book', icon: Wallet },
              { id: 'BALANCE_SHEET', label: '4. Balance Sheet', icon: Landmark },
              { id: 'TRIAL_BALANCE', label: '5. Trial Balance', icon: Scale },
              {
                id: 'VOUCHERS',
                label: `6. Ledger Vouchers (${periodVouchers.length})`,
                icon: Receipt,
              },
              {
                id: 'PARTIES',
                label: `7. Suppliers & Members (${partyAccounts.length})`,
                icon: Users,
              },
              {
                id: 'RETURNS',
                label: `8. Credit/Debit Returns (${returnNotes.length})`,
                icon: Undo2,
              },
              {
                id: 'FIXED_ASSETS',
                label: `9. Fixed Assets & Depr. (${fixedAssets.length})`,
                icon: Building2,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveAccountTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeAccountTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Top 4 Final Accounts KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500">
            Gross {accounts.grossProfit >= 0 ? 'Profit' : 'Loss'} (Trading A/c)
          </div>
          <div
            className={`text-2xl font-extrabold font-mono-code tabular-nums mt-1 ${
              accounts.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {accounts.grossProfit >= 0 ? '' : '-'}₹{fmt(Math.abs(accounts.grossProfit))}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-code tabular-nums">
            Sales Excl. GST ₹{accounts.salesBase.toFixed(2)} − COGS ₹{accounts.cogsBase.toFixed(2)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500">
            Net {accounts.netProfit >= 0 ? 'Profit' : 'Loss'} (P&amp;L A/c → Balance Sheet)
          </div>
          <div
            className={`text-2xl font-extrabold font-mono-code tabular-nums mt-1 ${
              accounts.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {accounts.netProfit >= 0 ? '+' : '-'}₹{fmt(Math.abs(accounts.netProfit))}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-code tabular-nums">
            Other Inc: +₹{accounts.totalOtherIncome.toFixed(2)} · Exp{accounts.totalSalesDiscount > 0 ? '/Disc' : ''}: -₹
            {(accounts.totalOperatingExpenses + accounts.govtFeePaidTotal + accounts.totalSalesDiscount).toFixed(2)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500">
            Closing Cash &amp; Bank (Cash Book)
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono-code tabular-nums mt-1">
            ₹{fmt(accounts.totalLiquidFunds)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-code tabular-nums">
            Cash: ₹{accounts.cashInHand.toFixed(2)} · Bank/UPI: ₹{accounts.bankUpiBalance.toFixed(2)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500">Balance Sheet Footing</div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono-code tabular-nums mt-1">
            ₹{fmt(accounts.totalAssets)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {Math.abs(accounts.balanceVariance) < 0.02
                ? 'Assets = Liabilities + Capital (Exact)'
                : `Variance: ₹${accounts.balanceVariance.toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Printable Multi-Page Final Accounts Wrapper */}
      <div className="print-multipage space-y-6">
        {/* Printable Official Society Title Strip */}
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:border-slate-400 print:rounded-none">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">{society.name}</h3>
            <p className="text-xs text-slate-600">
              {society.address}
              {society.regNo && society.regNo.trim() ? ` · Reg No.: ${society.regNo}` : ''}
            </p>
            {(society.gstin || society.email) && (
              <p className="text-[11px] text-slate-600 font-mono-code mt-0.5">
                {society.gstin ? `GSTIN: ${society.gstin}` : ''}
                {society.gstin && society.email ? ' · ' : ''}
                {society.email ? `Email: ${society.email}` : ''}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">
              Final Accounts Prepared Under Standard Indian Accounting Principles
            </div>
            <div className="text-xs text-slate-600 font-mono-code tabular-nums mt-0.5">
              {periodMode === 'DAY'
                ? `For Business Date: ${selectedDay}`
                : `Period: ${rangeStart || 'Earliest'} to ${rangeEnd || 'Latest'} (As on ${effectiveEnd || todayStr})`}
            </div>
          </div>
        </div>

      {/* ===================================================================== */}
      {/* STATEMENT 1: TRADING ACCOUNT                                          */}
      {/* ===================================================================== */}
      {showTrading && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:break-inside-avoid print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                1. Trading Account{' '}
                <span className="text-xs font-semibold text-slate-500">
                  (Inventory Goods Only · Excl. GST &amp; Non-Inventory Expenses)
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                For the period {effectiveStart || 'Start'} to {effectiveEnd || todayStr} · Computes Gross Trading Profit transferred to P&amp;L A/c
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono-code">
                Gross {accounts.grossProfit >= 0 ? 'Profit' : 'Loss'}: ₹{fmt(Math.abs(accounts.grossProfit))}
              </span>
              <button
                type="button"
                onClick={() => triggerPrint('TRADING')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer print:hidden"
                title="Print Trading Account only"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* DEBIT SIDE */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Dr. (Opening Stock &amp; Direct Purchases)
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">To Opening Stock (Excl. GST)</div>
                      <div className="text-xs text-slate-500 font-mono-code">
                        Inventory carried into period at cost (without GST)
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.openingStockBase)}
                    </div>
                  </div>
                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">To Stock Purchases (Without GST)</div>
                      <div className="text-xs text-slate-500 font-mono-code">
                        {periodPurchases.length} purchase {periodPurchases.length === 1 ? 'entry' : 'entries'} · Input CGST ₹{accounts.inputCgst.toFixed(2)} + Input SGST ₹{accounts.inputSgst.toFixed(2)} (Total ITC ₹{accounts.inputGst.toFixed(2)})
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.purchaseBase)}
                    </div>
                  </div>
                  {accounts.grossProfit >= 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 bg-emerald-50/40">
                      <div>
                        <div className="font-bold text-emerald-900">
                          To Gross Profit c/d (Transferred to P&amp;L A/c)
                        </div>
                        <div className="text-xs text-emerald-700 font-mono-code">
                          Gross Sales Excl. GST (₹{accounts.salesBaseBeforeDiscount.toFixed(2)}) − COGS Excl. GST (₹{accounts.cogsBase.toFixed(2)})
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-extrabold text-emerald-700 shrink-0">
                        ₹{fmt(accounts.grossProfit)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-xs font-extrabold uppercase tracking-wider">Total Debit (Dr.)</span>
                <span className="text-base font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.tradingDrTotal)}
                </span>
              </div>
            </div>

            {/* CREDIT SIDE */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Cr. (Sales Revenue &amp; Closing Stock)
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        By Sales Revenue ({accounts.totalSalesDiscount > 0 ? 'Gross Excl. GST' : 'Without GST'})
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code">
                        {periodInvoices.length} invoices
                        {accounts.totalSalesDiscount > 0
                          ? ` · Net Taxable ₹${accounts.salesBase.toFixed(2)} + Discount Allowed ₹${accounts.totalSalesDiscount.toFixed(2)}`
                          : ''}
                        {' '}· Output CGST ₹{accounts.outputCgst.toFixed(2)} + Output SGST ₹{accounts.outputSgst.toFixed(2)} (Total ₹{accounts.outputGst.toFixed(2)})
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.salesBaseBeforeDiscount)}
                    </div>
                  </div>
                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">By Closing Stock (Without GST)</div>
                      <div className="text-xs text-slate-500 font-mono-code">
                        {accounts.totalClosingUnits} units as on {effectiveEnd || todayStr} (Incl. GST: ₹{accounts.closingStockInclGst.toFixed(2)})
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.closingStockBase)}
                    </div>
                  </div>
                  {accounts.grossProfit < 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 bg-rose-50/50">
                      <div>
                        <div className="font-bold text-rose-900">
                          By Gross Loss c/d (Transferred to P&amp;L A/c)
                        </div>
                        <div className="text-xs text-rose-700 font-mono-code">
                          Direct cost exceeds sales revenue
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-extrabold text-rose-700 shrink-0">
                        ₹{fmt(Math.abs(accounts.grossProfit))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-xs font-extrabold uppercase tracking-wider">Total Credit (Cr.)</span>
                <span className="text-base font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.tradingCrTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATEMENT 2: PROFIT & LOSS ACCOUNT                                    */}
      {/* ===================================================================== */}
      {showPL && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:break-inside-avoid print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                2. Profit &amp; Loss (P&amp;L) Account
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Includes Operating Expenses (Staff Salary, Rent, etc.) on Debit &amp; Other Income (Interest, Scrap, Misc.) on Credit → Net Profit to Balance Sheet
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono-code ${
                  accounts.netProfit >= 0
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border-rose-200'
                }`}
              >
                Net {accounts.netProfit >= 0 ? 'Profit' : 'Loss'}: ₹{fmt(Math.abs(accounts.netProfit))}
              </span>
              <button
                type="button"
                onClick={() => triggerPrint('PL')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer print:hidden"
                title="Print Profit & Loss Account only"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* DEBIT SIDE (OPERATING EXPENSES & NET PROFIT) */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Dr. (Indirect / Operating Expenses &amp; Net Profit)
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  {accounts.grossProfit < 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-rose-700">To Gross Loss b/d (from Trading A/c)</div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-rose-700 shrink-0">
                        ₹{fmt(Math.abs(accounts.grossProfit))}
                      </div>
                    </div>
                  )}
                  {accounts.roundOffIncome < 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">To Round-Off Adjustment Allowed</div>
                        <div className="text-xs text-slate-500">Invoice rounding difference</div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                        ₹{fmt(Math.abs(accounts.roundOffIncome))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`px-6 py-3 flex items-center justify-between gap-4 ${
                      accounts.totalSalesDiscount > 0 ? 'bg-amber-50/40' : 'text-slate-500'
                    }`}
                  >
                    <div>
                      <div
                        className={`font-semibold ${
                          accounts.totalSalesDiscount > 0 ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        To Discount Allowed (POS Bill Discounts)
                      </div>
                      <div className="text-xs text-slate-500">
                        {accounts.totalSalesDiscount > 0
                          ? `Total checkout discounts given to customers across ${periodInvoices.filter((i) => i.discountAmt > 0).length} of ${periodInvoices.length} invoices`
                          : 'Checkout rebates / discounts given to customers at POS'}
                      </div>
                    </div>
                    <div
                      className={`font-mono-code tabular-nums font-bold shrink-0 ${
                        accounts.totalSalesDiscount > 0 ? 'text-rose-700' : 'text-slate-500'
                      }`}
                    >
                      ₹{fmt(accounts.totalSalesDiscount)}
                    </div>
                  </div>

                  {/* Grouped Operating Expense Ledgers (Staff Salary, Rent, Electricity, etc.) */}
                  {accounts.expenseLedgers.map((exp) => (
                    <div key={exp.ledgerHead} className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">To {exp.ledgerHead}</div>
                        <div className="text-xs text-slate-500">
                          Operating Expense Ledger (Non-inventory)
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-rose-700 shrink-0">
                        ₹{fmt(exp.amount)}
                      </div>
                    </div>
                  ))}

                  {accounts.expenseLedgers.length === 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 text-slate-500">
                      <div>
                        <div className="font-semibold text-slate-700">
                          To Operating Expenses (Salary, Rent, Utilities)
                        </div>
                        <div className="text-xs text-slate-400">
                          Use &ldquo;Record Expense (Salary / Rent)&rdquo; above to pass ledger vouchers
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-slate-500 shrink-0">
                        ₹0.00
                      </div>
                    </div>
                  )}

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">To GST Interest &amp; Late Fee Expense</div>
                      <div className="text-xs text-slate-500 font-mono-code">
                        Non-creditable statutory fee paid via PMT-06 challan
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.govtFeePaidTotal)}
                    </div>
                  </div>

                  {accounts.totalDepreciation > 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">To Depreciation on Fixed Assets</div>
                        <div className="text-xs text-slate-500 font-mono-code">
                          Statutory depreciation across {fixedAssets.length} society assets
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-rose-700 shrink-0">
                        ₹{fmt(accounts.totalDepreciation)}
                      </div>
                    </div>
                  )}

                  {accounts.netProfit >= 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 bg-emerald-50/40">
                      <div>
                        <div className="font-bold text-emerald-900">
                          To Net Profit (Transferred to Balance Sheet Capital A/c)
                        </div>
                        <div className="text-xs text-emerald-700 font-mono-code">
                          Added to Opening Capital Fund in Balance Sheet
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-extrabold text-emerald-700 shrink-0">
                        ₹{fmt(accounts.netProfit)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-xs font-extrabold uppercase tracking-wider">Total P&amp;L Debit (Dr.)</span>
                <span className="text-base font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.plDrTotal)}
                </span>
              </div>
            </div>

            {/* CREDIT SIDE (GROSS PROFIT & OTHER INCOME LEDGERS) */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Cr. (Gross Profit &amp; Other Income)
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  {accounts.grossProfit >= 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">By Gross Profit b/d (from Trading A/c)</div>
                        <div className="text-xs text-slate-500">Brought down from Trading Account</div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-emerald-700 shrink-0">
                        ₹{fmt(accounts.grossProfit)}
                      </div>
                    </div>
                  )}
                  {accounts.roundOffIncome >= 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">By Round-Off Adjustment Income</div>
                        <div className="text-xs text-slate-500 font-mono-code">
                          Whole-rupee billing rounding across {periodInvoices.length} invoices
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-amber-700 shrink-0">
                        ₹{fmt(accounts.roundOffIncome)}
                      </div>
                    </div>
                  )}

                  {/* Grouped Other Income Ledgers (Interest, Discount Received, Scrap Sales, Misc Income) */}
                  {accounts.otherIncomeLedgers.map((inc) => (
                    <div key={inc.ledgerHead} className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">By {inc.ledgerHead}</div>
                        <div className="text-xs text-slate-500">
                          Other Income Ledger (Non-inventory)
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-emerald-700 shrink-0">
                        ₹{fmt(inc.amount)}
                      </div>
                    </div>
                  ))}

                  {accounts.otherIncomeLedgers.length === 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 text-slate-500">
                      <div>
                        <div className="font-semibold text-slate-700">
                          By Other Income (Interest, Scrap Sales, Misc.)
                        </div>
                        <div className="text-xs text-slate-400">
                          Use &ldquo;Record Other Income&rdquo; above to add non-sales income
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-slate-500 shrink-0">
                        ₹0.00
                      </div>
                    </div>
                  )}

                  {accounts.netProfit < 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4 bg-rose-50/50">
                      <div>
                        <div className="font-bold text-rose-900">
                          By Net Loss (Transferred to Balance Sheet Capital A/c)
                        </div>
                        <div className="text-xs text-rose-700 font-mono-code">
                          Deducted from Capital Fund in Balance Sheet
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-extrabold text-rose-700 shrink-0">
                        ₹{fmt(Math.abs(accounts.netProfit))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-xs font-extrabold uppercase tracking-wider">Total P&amp;L Credit (Cr.)</span>
                <span className="text-base font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.plCrTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATEMENT 3: CASH & BANK ACCOUNT (2-COLUMN CASH BOOK)                 */}
      {/* ===================================================================== */}
      {showCashBook && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:break-inside-avoid print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                3. Cash &amp; Bank Account (Two-Column Cash Book)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Receipts (Dr.) vs Payments (Cr.) including Sales, Salary/Expenses, Other Income &amp; Govt PMT-06 · Purchase Settlement: {purchaseSettlementLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-emerald-300 font-mono-code">
                Closing Cash + Bank: ₹{fmt(accounts.totalLiquidFunds)}
              </span>
              <button
                type="button"
                onClick={() => triggerPrint('CASH_BOOK')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer print:hidden"
                title="Print Cash & Bank Book only"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* RECEIPTS SIDE (DR.) */}
            <div className="flex flex-col justify-between">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/80 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Dr. Receipts (Inflows)</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Cash (₹)</th>
                      <th className="px-4 py-2.5 text-right whitespace-nowrap">Bank / UPI (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono-code tabular-nums">
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">To Balance b/d (Opening Balances)</div>
                        <div className="text-[11px] text-slate-500">Opening counter cash &amp; bank float</div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">
                        ₹{fmt(openingCashFloat)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        ₹{fmt(openingBankBalance)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">To Cash Sales Collections</div>
                        <div className="text-[11px] text-slate-500">
                          {periodInvoices.filter((i) => i.paymentMode === 'CASH').length} cash bills (Incl. GST &amp; Round-off)
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        ₹{fmt(accounts.cashSales)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">₹0.00</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">To UPI / Online QR Collections</div>
                        <div className="text-[11px] text-slate-500">
                          {periodInvoices.filter((i) => i.paymentMode !== 'CASH').length} UPI bills (Incl. GST &amp; Round-off)
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-400">₹0.00</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        ₹{fmt(accounts.upiSales)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">To Other Income Receipts</div>
                        <div className="text-[11px] text-slate-500">
                          {accounts.otherIncomeCount} non-sales income {accounts.otherIncomeCount === 1 ? 'voucher' : 'vouchers'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        ₹{fmt(accounts.otherIncomeCash)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        ₹{fmt(accounts.otherIncomeBank)}
                      </td>
                    </tr>
                    {(accounts.memberReceivedCash > 0 || accounts.memberReceivedBank > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-slate-900">To Member Credit Receipts (Debtors)</div>
                          <div className="text-[11px] text-slate-500">Udhaar dues recovered from members</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-700">
                          ₹{fmt(accounts.memberReceivedCash)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          ₹{fmt(accounts.memberReceivedBank)}
                        </td>
                      </tr>
                    )}
                    {(accounts.contraCashToBank > 0 || accounts.contraBankToCash > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-blue-900">To Contra A/c (Cash ↔ Bank Transfers)</div>
                          <div className="text-[11px] text-slate-500">Internal cash deposit / bank withdrawal</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-blue-700">
                          ₹{fmt(accounts.contraBankToCash)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                          ₹{fmt(accounts.contraCashToBank)}
                        </td>
                      </tr>
                    )}
                    {(accounts.purchaseReturnCash > 0 || accounts.purchaseReturnBank > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-slate-900">To Purchase Return Refunds (Debit Notes)</div>
                          <div className="text-[11px] text-slate-500">Supplier refund against returned stock</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-700">
                          ₹{fmt(accounts.purchaseReturnCash)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          ₹{fmt(accounts.purchaseReturnBank)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-slate-900 text-white grid grid-cols-12 items-center border-t border-slate-800 text-xs font-mono-code tabular-nums">
                <span className="col-span-6 font-sans font-extrabold uppercase tracking-wider">
                  Total Receipts (Dr.)
                </span>
                <span className="col-span-3 text-right font-black text-emerald-300">
                  ₹{fmt(accounts.cashReceiptsTotal)}
                </span>
                <span className="col-span-3 text-right font-black text-emerald-300">
                  ₹{fmt(accounts.bankReceiptsTotal)}
                </span>
              </div>
            </div>

            {/* PAYMENTS SIDE (CR.) */}
            <div className="flex flex-col justify-between">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/80 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Cr. Payments &amp; Closing (Outflows)</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Cash (₹)</th>
                      <th className="px-4 py-2.5 text-right whitespace-nowrap">Bank / UPI (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono-code tabular-nums">
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">
                          By Stock Purchases Paid to Suppliers
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {purchaseSettlementMode === 'CREDIT'
                            ? `On Supplier Credit (Creditors ₹${accounts.sundryCreditors.toFixed(2)})`
                            : `Paid incl. GST (${periodPurchases.length} entries)`}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-rose-700">
                        ₹{fmt(accounts.purchasePaidCash)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700">
                        ₹{fmt(accounts.purchasePaidBank)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">
                          By Operating Expenses Paid (Salary / Rent / Misc)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {accounts.expenseCount} expense {accounts.expenseCount === 1 ? 'voucher' : 'vouchers'} paid from Cash/Bank
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-rose-700">
                        ₹{fmt(accounts.expenseCash)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700">
                        ₹{fmt(accounts.expenseBank)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900">
                          By Govt GST Challans Paid (PMT-06)
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-code">
                          {periodGstPayments.length} {periodGstPayments.length === 1 ? 'challan' : 'challans'} · CGST ₹{accounts.govtCgstPaidTotal.toFixed(2)} + SGST ₹{accounts.govtSgstPaidTotal.toFixed(2)}
                          {accounts.govtFeePaidTotal > 0 ? ` + Fee ₹${accounts.govtFeePaidTotal.toFixed(2)}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-amber-700">
                        ₹{fmt(accounts.govtPaidCash)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">
                        ₹{fmt(accounts.govtPaidBank)}
                      </td>
                    </tr>
                    {(accounts.supplierPaidCash > 0 || accounts.supplierPaidBank > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-slate-900">By Supplier Credit Settlements</div>
                          <div className="text-[11px] text-slate-500">Payments to Sundry Creditors</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-700">
                          ₹{fmt(accounts.supplierPaidCash)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-700">
                          ₹{fmt(accounts.supplierPaidBank)}
                        </td>
                      </tr>
                    )}
                    {(accounts.contraCashToBank > 0 || accounts.contraBankToCash > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-blue-900">By Contra A/c (Cash ↔ Bank Transfers)</div>
                          <div className="text-[11px] text-slate-500">Internal cash deposit / bank withdrawal</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-blue-700">
                          ₹{fmt(accounts.contraCashToBank)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                          ₹{fmt(accounts.contraBankToCash)}
                        </td>
                      </tr>
                    )}
                    {(accounts.salesReturnCash > 0 || accounts.salesReturnBank > 0) && (
                      <tr>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-slate-900">By Sales Return Refunds (Credit Notes)</div>
                          <div className="text-[11px] text-slate-500">Refunds issued to customers</div>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-700">
                          ₹{fmt(accounts.salesReturnCash)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-700">
                          ₹{fmt(accounts.salesReturnBank)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-emerald-50/40">
                      <td className="px-4 py-3 font-sans">
                        <div className="font-bold text-emerald-900">
                          By Balance c/d (Closing Cash &amp; Bank → Balance Sheet)
                        </div>
                        <div className="text-[11px] text-emerald-700">
                          Carried forward as Current Assets on Balance Sheet
                        </div>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-extrabold ${
                          accounts.cashInHand >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        ₹{fmt(accounts.cashInHand)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-extrabold ${
                          accounts.bankUpiBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        ₹{fmt(accounts.bankUpiBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-slate-900 text-white grid grid-cols-12 items-center border-t border-slate-800 text-xs font-mono-code tabular-nums">
                <span className="col-span-6 font-sans font-extrabold uppercase tracking-wider">
                  Total Payments &amp; Closing (Cr.)
                </span>
                <span className="col-span-3 text-right font-black text-emerald-300">
                  ₹{fmt(accounts.cashReceiptsTotal)}
                </span>
                <span className="col-span-3 text-right font-black text-emerald-300">
                  ₹{fmt(accounts.bankReceiptsTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Chronological Cash & Bank Register when focused on Cash Book or Print All */}
          {showCashBookLedger && (
            <div className="border-t border-slate-200">
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Chronological Cash &amp; Bank Voucher Register ({cashBookEntries.length} entries)
                </span>
              </div>
              {cashBookEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No cash or bank transactions recorded in this period.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto print:max-h-none print:overflow-visible">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Voucher / Ref</th>
                        <th className="px-4 py-2.5">Particulars</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5 text-right">Cash (₹)</th>
                        <th className="px-4 py-2.5 text-right">Bank / UPI (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono-code tabular-nums">
                      {cashBookEntries.map((en) => (
                        <tr key={en.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{en.date}</td>
                          <td className="px-4 py-2 font-bold text-slate-900 whitespace-nowrap">{en.ref}</td>
                          <td className="px-4 py-2 font-sans text-slate-800">{en.particulars}</td>
                          <td className="px-4 py-2 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                en.type === 'RECEIPT'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {en.type === 'RECEIPT' ? 'Dr. Receipt' : 'Cr. Payment'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {en.cashAmt > 0 ? `${en.type === 'RECEIPT' ? '+' : '-'}₹${en.cashAmt.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {en.bankAmt > 0 ? `${en.type === 'RECEIPT' ? '+' : '-'}₹${en.bankAmt.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATEMENT 4: PURE BALANCE SHEET (NO RAW PURCHASES OR SALES LINES)     */}
      {/* ===================================================================== */}
      {showBalanceSheet && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:break-inside-avoid print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                4. Balance Sheet{' '}
                <span className="text-xs font-semibold text-slate-500">
                  (As on {effectiveEnd || todayStr})
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pure Financial Position Statement — Includes ONLY Capital, Net Profit/(Loss) from P&amp;L A/c, Liabilities &amp; Assets
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                {Math.abs(accounts.balanceVariance) < 0.02
                  ? 'Balanced (Assets = Liabilities + Capital)'
                  : `Variance: ₹${accounts.balanceVariance.toFixed(2)}`}
              </span>
              <button
                type="button"
                onClick={() => triggerPrint('BALANCE_SHEET')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer print:hidden"
                title="Print Balance Sheet only"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* LEFT: LIABILITIES & CAPITAL */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Liabilities &amp; Capital
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>

                <div className="divide-y divide-slate-100 text-sm">
                  <div className="px-6 py-2.5 bg-slate-50/50 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Capital Account &amp; Reserves
                  </div>
                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">Opening Capital Fund</div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Cash Float ₹{openingCashFloat.toFixed(2)} + Bank ₹{openingBankBalance.toFixed(2)} + Opening Stock ₹{accounts.openingStockBase.toFixed(2)}
                        {(accounts.openingCgstItc > 0 || accounts.openingSgstItc > 0)
                          ? ` + Op. CGST ITC ₹${accounts.openingCgstItc.toFixed(2)} + Op. SGST ITC ₹${accounts.openingSgstItc.toFixed(2)}`
                          : ''}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.openingCapitalFund)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4 bg-emerald-50/30">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {accounts.netProfit >= 0
                          ? 'Add: Net Profit (Transferred from P&L A/c)'
                          : 'Less: Net Loss (Transferred from P&L A/c)'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Final P&amp;L Surplus (Trading Profit + Other Income − Operating Expenses
                        {accounts.totalSalesDiscount > 0
                          ? ` − Discount Allowed ₹${accounts.totalSalesDiscount.toFixed(2)}`
                          : ''}
                        {' '}&amp; Fees)
                      </div>
                      {accounts.totalSalesDiscount > 0 && (
                        <div className="text-[11px] font-bold text-amber-700 font-mono-code mt-0.5">
                          Includes Bill Discounts Allowed (-₹{fmt(accounts.totalSalesDiscount)}) deducted from P&amp;L Surplus
                        </div>
                      )}
                    </div>
                    <div
                      className={`font-mono-code tabular-nums font-bold shrink-0 ${
                        accounts.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {accounts.netProfit >= 0 ? '+' : '-'}₹{fmt(Math.abs(accounts.netProfit))}
                    </div>
                  </div>

                  <div className="px-6 py-2.5 bg-slate-50 flex items-center justify-between gap-4">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Closing Capital Fund (Subtotal)
                    </span>
                    <span className="font-mono-code tabular-nums font-extrabold text-slate-900">
                      ₹{fmt(accounts.closingCapitalFund)}
                    </span>
                  </div>

                  <div className="px-6 py-2.5 bg-slate-50/50 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Current Liabilities
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Sundry Creditors (Trade Payables)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        {purchaseSettlementMode === 'CREDIT'
                          ? `Unpaid stock supplier bills (Base ₹${accounts.purchaseBase.toFixed(2)} + CGST ₹${accounts.inputCgst.toFixed(2)} + SGST ₹${accounts.inputSgst.toFixed(2)})`
                          : `Settled in full via ${purchaseSettlementMode === 'CASH' ? 'Cash Drawer' : 'Bank / UPI'}`}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.sundryCreditors)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">CGST Payable to Govt (Central Tax)</div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Output CGST ₹{accounts.outputCgst.toFixed(2)} − Input CGST ITC ₹{accounts.availableInputCgst.toFixed(2)}
                        {accounts.govtCgstPaidTotal > 0 ? ` − Govt CGST Paid ₹${accounts.govtCgstPaidTotal.toFixed(2)}` : ''}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.netCgstPayable)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">SGST Payable to Govt (State Tax)</div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Output SGST ₹{accounts.outputSgst.toFixed(2)} − Input SGST ITC ₹{accounts.availableInputSgst.toFixed(2)}
                        {accounts.govtSgstPaidTotal > 0 ? ` − Govt SGST Paid ₹${accounts.govtSgstPaidTotal.toFixed(2)}` : ''}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.netSgstPayable)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-sm font-extrabold uppercase tracking-wider">
                  Total Liabilities &amp; Capital
                </span>
                <span className="text-lg font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.totalLiabilitiesAndCapital)}
                </span>
              </div>
            </div>

            {/* RIGHT: ASSETS */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="px-6 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    Assets
                  </span>
                  <span className="text-xs font-bold text-slate-600">Amount (₹)</span>
                </div>

                <div className="divide-y divide-slate-100 text-sm">
                  {accounts.closingFixedAssetsNet > 0 && (
                    <>
                      <div className="px-6 py-2.5 bg-slate-50/50 text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Fixed Assets (Net Block)
                      </div>
                      <div className="px-6 py-3 flex items-center justify-between gap-4">
                        <div>
                          <div className="font-semibold text-slate-900">
                            Society Fixed Assets (Less Depreciation)
                          </div>
                          <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                            Opening Net ₹{accounts.openingFixedAssetsNet.toFixed(2)} − Depr. ₹{accounts.totalDepreciation.toFixed(2)}
                          </div>
                        </div>
                        <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                          ₹{fmt(accounts.closingFixedAssetsNet)}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="px-6 py-2.5 bg-slate-50/50 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Current Assets
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Closing Stock-in-Trade (Cost Excl. GST)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        {accounts.totalClosingUnits} units in inventory · Incl. GST value: ₹{accounts.closingStockInclGst.toFixed(2)}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                      ₹{fmt(accounts.closingStockBase)}
                    </div>
                  </div>

                  {accounts.sundryDebtors > 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">
                          Sundry Debtors (Member Credit Receivables)
                        </div>
                        <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                          Co-op member Udhaar dues receivable
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-amber-700 shrink-0">
                        ₹{fmt(accounts.sundryDebtors)}
                      </div>
                    </div>
                  )}

                  {accounts.supplierAdvancesAsset > 0 && (
                    <div className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">
                          Advances to Suppliers
                        </div>
                        <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                          Net advance balance with stock suppliers
                        </div>
                      </div>
                      <div className="font-mono-code tabular-nums font-bold text-slate-900 shrink-0">
                        ₹{fmt(accounts.supplierAdvancesAsset)}
                      </div>
                    </div>
                  )}

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Cash in Hand (Closing Balance per Cash Book)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Receipts ₹{accounts.cashReceiptsTotal.toFixed(2)} − Payments ₹{accounts.cashPaymentsOut.toFixed(2)}
                      </div>
                    </div>
                    <div
                      className={`font-mono-code tabular-nums font-bold shrink-0 ${
                        accounts.cashInHand >= 0 ? 'text-slate-900' : 'text-rose-700'
                      }`}
                    >
                      ₹{fmt(accounts.cashInHand)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        Bank / UPI Balance (Closing Balance per Cash Book)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Receipts ₹{accounts.bankReceiptsTotal.toFixed(2)} − Payments ₹{accounts.bankPaymentsOut.toFixed(2)}
                      </div>
                    </div>
                    <div
                      className={`font-mono-code tabular-nums font-bold shrink-0 ${
                        accounts.bankUpiBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      ₹{fmt(accounts.bankUpiBalance)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        CGST Input Tax Credit (ITC) Receivable (Central Tax)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Available CGST ITC ₹{accounts.availableInputCgst.toFixed(2)}
                        {accounts.govtCgstPaidTotal > 0 ? ` + PMT-06 ₹${accounts.govtCgstPaidTotal.toFixed(2)}` : ''}
                        {' '}− Output CGST ₹{accounts.outputCgst.toFixed(2)}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-emerald-700 shrink-0">
                      ₹{fmt(accounts.cgstItcReceivable)}
                    </div>
                  </div>

                  <div className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">
                        SGST Input Tax Credit (ITC) Receivable (State Tax)
                      </div>
                      <div className="text-xs text-slate-500 font-mono-code tabular-nums">
                        Available SGST ITC ₹{accounts.availableInputSgst.toFixed(2)}
                        {accounts.govtSgstPaidTotal > 0 ? ` + PMT-06 ₹${accounts.govtSgstPaidTotal.toFixed(2)}` : ''}
                        {' '}− Output SGST ₹{accounts.outputSgst.toFixed(2)}
                      </div>
                    </div>
                    <div className="font-mono-code tabular-nums font-bold text-emerald-700 shrink-0">
                      ₹{fmt(accounts.sgstItcReceivable)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
                <span className="text-sm font-extrabold uppercase tracking-wider">Total Assets</span>
                <span className="text-lg font-black font-mono-code tabular-nums text-emerald-300">
                  ₹{fmt(accounts.totalAssets)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STATEMENT 5: TRIAL BALANCE (TOTAL DEBIT = TOTAL CREDIT)               */}
      {/* ===================================================================== */}
      {showTrialBalance && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:break-inside-avoid print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                5. Trial Balance Statement{' '}
                <span className="text-xs font-semibold text-slate-500">
                  (As on {effectiveEnd || todayStr} · Before Closing Stock Adjustment)
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Standard Double-Entry Arithmetical Proof — Total Debit Balances must equal Total Credit Balances
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono-code">
                {Math.abs(accounts.trialDebitTotal - accounts.trialCreditTotal) < 0.05
                  ? `Tallied: Dr ₹${fmt(accounts.trialDebitTotal)} = Cr ₹${fmt(accounts.trialCreditTotal)}`
                  : `Diff: ₹${(accounts.trialDebitTotal - accounts.trialCreditTotal).toFixed(2)}`}
              </span>
              <button
                type="button"
                onClick={() => triggerPrint('TRIAL_BALANCE')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer print:hidden"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Particulars / Ledger Account Head</th>
                  <th className="px-4 py-3">Statement Group</th>
                  <th className="px-6 py-3 text-right">Debit Balance (Dr. ₹)</th>
                  <th className="px-6 py-3 text-right">Credit Balance (Cr. ₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.trialBalanceRows.map((row, idx) => (
                  <tr key={`${row.head}-${idx}`} className="hover:bg-slate-50">
                    <td className="px-6 py-2.5 font-semibold text-slate-900">{row.head}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.category}</td>
                    <td className="px-6 py-2.5 text-right font-mono-code tabular-nums font-bold text-slate-900">
                      {row.debit > 0 ? `₹${fmt(row.debit)}` : '—'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono-code tabular-nums font-bold text-emerald-700">
                      {row.credit > 0 ? `₹${fmt(row.credit)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-mono-code tabular-nums font-extrabold">
                <tr>
                  <td colSpan={2} className="px-6 py-3.5 font-sans uppercase text-xs">
                    Grand Total of Trial Balance (Note: Closing Stock outside Trial Balance = ₹{fmt(accounts.closingStockBase)})
                  </td>
                  <td className="px-6 py-3.5 text-right text-emerald-300 text-sm">
                    ₹{fmt(accounts.trialDebitTotal)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-emerald-300 text-sm">
                    ₹{fmt(accounts.trialCreditTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: SALARY, OPERATING EXPENSES & OTHER INCOME VOUCHER REGISTER     */}
      {/* ===================================================================== */}
      {showVouchersRegister && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-400">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                5. Non-Inventory Ledger Vouchers (Staff Salary, Rent &amp; Other Income)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Posted directly to P&amp;L A/c and Cash &amp; Bank Book — stock quantities and Trading Gross Profit stay unaffected
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={voucherSearch}
                  onChange={(e) => setVoucherSearch(e.target.value)}
                  placeholder="Search salary, rent, party..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => triggerPrint('VOUCHERS')}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Print Ledger Vouchers Register only"
              >
                <Printer className="w-3 h-3" />
                <span>Print</span>
              </button>
            </div>
          </div>

          <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-6 text-xs font-mono-code">
            <div>
              <span className="font-sans text-slate-500 font-semibold">Operating Expenses: </span>
              <span className="font-extrabold text-rose-700">
                ₹{fmt(accounts.totalOperatingExpenses)} ({accounts.expenseCount})
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 font-semibold">Other Income: </span>
              <span className="font-extrabold text-emerald-700">
                ₹{fmt(accounts.totalOtherIncome)} ({accounts.otherIncomeCount})
              </span>
            </div>
            <div>
              <span className="font-sans text-slate-500 font-semibold">Net P&amp;L Impact: </span>
              <span
                className={`font-extrabold ${
                  accounts.totalOtherIncome - accounts.totalOperatingExpenses >= 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {accounts.totalOtherIncome - accounts.totalOperatingExpenses >= 0 ? '+' : '-'}₹
                {fmt(Math.abs(accounts.totalOtherIncome - accounts.totalOperatingExpenses))}
              </span>
            </div>
          </div>

          {filteredVouchers.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">
                  No Salary, Expense, or Other Income Vouchers for {periodLabel}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Record staff salary payments, shop rent, electricity bills, interest received, or scrap sales using the buttons in the header above.
                </p>
              </div>
              {onAddAccountVoucher && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openVoucherModal('EXPENSE')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    + Record Expense (Salary / Rent)
                  </button>
                  <button
                    type="button"
                    onClick={() => openVoucherModal('OTHER_INCOME')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    + Record Other Income
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Voucher No.</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Ledger Head</th>
                    <th className="px-4 py-3">Staff / Party</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                    <th className="px-4 py-3">Narration / By</th>
                    {onDeleteAccountVoucher && <th className="px-4 py-3 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono-code text-slate-600 whitespace-nowrap">
                        {v.voucherDate}
                      </td>
                      <td className="px-4 py-2.5 font-mono-code font-bold text-slate-900 whitespace-nowrap">
                        {v.voucherNo}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            v.voucherType === 'OTHER_INCOME'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {v.voucherType === 'OTHER_INCOME' ? 'Other Income (Cr.)' : 'Expense (Dr.)'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-900">{v.ledgerHead}</td>
                      <td className="px-4 py-2.5 text-slate-700">{v.payeeOrPayer || '—'}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        {v.paymentMode === 'BANK_UPI' ? 'Bank / UPI' : 'Cash Drawer'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono-code font-extrabold ${
                          v.voucherType === 'OTHER_INCOME' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {v.voucherType === 'OTHER_INCOME' ? '+' : '-'}₹{fmt(v.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        <div>{v.narration || '—'}</div>
                        <div className="text-[10px] text-slate-400">By: {v.performedBy}</div>
                      </td>
                      {onDeleteAccountVoucher && (
                        <td className="px-4 py-2.5 text-center">
                          {confirmDeleteVoucherId === v.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteAccountVoucher(v.id);
                                  setConfirmDeleteVoucherId(null);
                                }}
                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteVoucherId(null)}
                                className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVoucherId(v.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete Voucher"
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

      {/* ===================================================================== */}
      {/* TAB 7: SUPPLIERS (CREDITORS) & COOPERATIVE MEMBERS (DEBTORS) MASTER   */}
      {/* ===================================================================== */}
      {showPartiesTab && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-6 space-y-5 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                7. Suppliers (Sundry Creditors) &amp; Co-op Members (Sundry Debtors) Ledger Master
              </h3>
              <p className="text-xs text-slate-500">
                Register fertilizer/pesticide suppliers and cooperative farmer members with opening balances, GSTIN, and credit limits
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onAddAccountVoucher && (
                <>
                  <button
                    type="button"
                    onClick={() => openVoucherModal('SUPPLIER_PAYMENT')}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    + Pay Supplier Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => openVoucherModal('MEMBER_RECEIPT')}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    + Receive Member Dues
                  </button>
                </>
              )}
            </div>
          </div>

          {onAddParty && (
            <form onSubmit={handleAddPartySubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Party Type</label>
                <select
                  value={newPartyType}
                  onChange={(e) => setNewPartyType(e.target.value as 'SUPPLIER' | 'MEMBER')}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                >
                  <option value="MEMBER">Co-op Farmer Member</option>
                  <option value="SUPPLIER">Stock Supplier (Creditor)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name / Firm *</label>
                <input
                  type="text"
                  required
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  placeholder="e.g. IFFCO Kolkata / Ramesh Das"
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone / Mobile</label>
                <input
                  type="text"
                  value={newPartyPhone}
                  onChange={(e) => setNewPartyPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {newPartyType === 'SUPPLIER' ? 'Supplier GSTIN' : 'Member Passbook / Code'}
                </label>
                <input
                  type="text"
                  value={newPartyType === 'SUPPLIER' ? newPartyGstin : newPartyCode || newPartyGstin}
                  onChange={(e) => {
                    if (newPartyType === 'SUPPLIER') setNewPartyGstin(e.target.value.toUpperCase());
                    else setNewPartyCode(e.target.value.toUpperCase());
                  }}
                  placeholder={newPartyType === 'SUPPLIER' ? '19AAAAA0000A1Z5' : 'MEM-1042'}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code uppercase"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Opening Due (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPartyOpening}
                  onChange={(e) => setNewPartyOpening(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer"
                >
                  + Add {newPartyType === 'SUPPLIER' ? 'Supplier' : 'Member'}
                </button>
              </div>
            </form>
          )}

          {/* Live Credit Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Total Supplier Payables (Sundry Creditors)
                </div>
                <div className="text-lg font-black font-mono-code text-amber-950 mt-0.5">
                  ₹{fmt(partyLedgerSummary.totalSupplierDue)}
                </div>
                <div className="text-[11px] text-amber-800/80">
                  Opening + All Credit Stock Purchases − Supplier Payments
                </div>
              </div>
              {onAddAccountVoucher && (
                <button
                  type="button"
                  onClick={() => openVoucherModal('SUPPLIER_PAYMENT')}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  Pay Supplier Now
                </button>
              )}
            </div>
            <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                  Total Member Receivables (Sundry Debtors)
                </div>
                <div className="text-lg font-black font-mono-code text-teal-950 mt-0.5">
                  ₹{fmt(partyLedgerSummary.totalMemberDue)}
                </div>
                <div className="text-[11px] text-teal-800/80">
                  Opening + All POS Credit Sales − Member Receipts
                </div>
              </div>
              {onAddAccountVoucher && (
                <button
                  type="button"
                  onClick={() => openVoucherModal('MEMBER_RECEIPT')}
                  className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  Receive Member Due
                </button>
              )}
            </div>
          </div>

          {/* General / Unspecified Supplier Credit Banner (for purchases made without selecting a specific supplier) */}
          {(partyLedgerSummary.generalSupplierCreditBills > 0 ||
            partyLedgerSummary.generalSupplierPaid > 0) && (
            <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <span>General / Unassigned Supplier Credit Purchases</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono-code text-[10px]">
                    Net Due: ₹{fmt(Math.max(0, partyLedgerSummary.generalSupplierNetDue))}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono-code">
                  Credit Bills: ₹{fmt(partyLedgerSummary.generalSupplierCreditBills)} · Paid Back: ₹
                  {fmt(partyLedgerSummary.generalSupplierPaid)}
                  {partyLedgerSummary.generalSupplierReturns > 0
                    ? ` · Debit Notes: ₹${fmt(partyLedgerSummary.generalSupplierReturns)}`
                    : ''}
                </div>
              </div>
              {onAddAccountVoucher && partyLedgerSummary.generalSupplierNetDue > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    openVoucherModal('SUPPLIER_PAYMENT', {
                      payeeName: 'General Supplier',
                      amount: partyLedgerSummary.generalSupplierNetDue,
                      narration: 'Settlement of unassigned credit stock purchases',
                    })
                  }
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Pay General Supplier (₹{fmt(partyLedgerSummary.generalSupplierNetDue)})
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Party Name</th>
                  <th className="px-3 py-2.5">Phone / GSTIN</th>
                  <th className="px-3 py-2.5 text-right">Opening (₹)</th>
                  <th className="px-3 py-2.5 text-right">Credit Bills (₹)</th>
                  <th className="px-3 py-2.5 text-right">Paid / Settled (₹)</th>
                  <th className="px-3 py-2.5 text-right">Net Due (₹)</th>
                  <th className="px-3 py-2.5 text-center">Settle / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partyAccounts.map((p) => {
                  const ledgerRow = partyLedgerSummary.byId.get(p.id) || {
                    opening: r2(p.openingBalance || 0),
                    creditBills: 0,
                    settled: 0,
                    returns: 0,
                    netDue: r2(p.openingBalance || 0),
                  };
                  const isSupplier = p.partyType === 'SUPPLIER';
                  const hasDue = ledgerRow.netDue > 0.01;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                            isSupplier
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {isSupplier ? 'SUPPLIER (Cr.)' : 'MEMBER (Dr.)'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{p.name}</td>
                      <td className="px-3 py-2.5 font-mono-code text-slate-600">
                        <div>{p.phone || '—'}</div>
                        {(p.gstin || p.memberCode || p.memberNo) && (
                          <div className="text-[10px] text-slate-500">
                            {p.gstin || p.memberCode || p.memberNo}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-code text-slate-700">
                        ₹{fmt(ledgerRow.opening)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-code font-semibold text-slate-900">
                        ₹{fmt(ledgerRow.creditBills)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-code font-semibold text-emerald-700">
                        ₹{fmt(r2(ledgerRow.settled + ledgerRow.returns))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-code font-extrabold">
                        <span
                          className={
                            ledgerRow.netDue > 0.01
                              ? isSupplier
                                ? 'text-amber-700'
                                : 'text-teal-700'
                              : ledgerRow.netDue < -0.01
                              ? 'text-indigo-700'
                              : 'text-slate-400'
                          }
                        >
                          ₹{fmt(Math.abs(ledgerRow.netDue))}
                          {ledgerRow.netDue < -0.01 ? ' (Adv)' : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {onAddAccountVoucher && (
                            <button
                              type="button"
                              onClick={() =>
                                openVoucherModal(
                                  isSupplier ? 'SUPPLIER_PAYMENT' : 'MEMBER_RECEIPT',
                                  {
                                    partyId: p.id,
                                    payeeName: p.name,
                                    amount: hasDue ? ledgerRow.netDue : undefined,
                                    narration: isSupplier
                                      ? `Credit purchase settlement to ${p.name}`
                                      : `Credit due collection from ${p.name}`,
                                  }
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-white whitespace-nowrap cursor-pointer ${
                                isSupplier
                                  ? 'bg-amber-600 hover:bg-amber-500'
                                  : 'bg-teal-600 hover:bg-teal-500'
                              }`}
                            >
                              {isSupplier ? 'Pay Back' : 'Receive'}
                            </button>
                          )}
                          {onDeleteParty && (
                            <button
                              type="button"
                              onClick={() => onDeleteParty(p.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Delete party account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {partyAccounts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No suppliers or cooperative members added yet. Add them above to track individual credit &amp; POS Udhaar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 8: SALES RETURNS (CREDIT NOTES) & PURCHASE RETURNS (DEBIT NOTES)  */}
      {/* ===================================================================== */}
      {showReturnsTab && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-6 space-y-5 print:hidden">
          <div className="pb-4 border-b border-slate-200">
            <h3 className="text-base font-extrabold text-slate-900">
              8. Sales Returns (Credit Notes) &amp; Purchase Returns (Debit Notes)
            </h3>
            <p className="text-xs text-slate-500">
              Automatically reverses inventory stock, Output GST / Input ITC, Trading Account, and Cash/Bank/Party Ledger
            </p>
          </div>

          {onAddReturnNote && (
            <form onSubmit={handleAddReturnSubmit} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Note Type</label>
                <select
                  value={retType}
                  onChange={(e) => setRetType(e.target.value as 'CREDIT_NOTE' | 'DEBIT_NOTE')}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                >
                  <option value="CREDIT_NOTE">Sales Return (Credit Note)</option>
                  <option value="DEBIT_NOTE">Purchase Return (Debit Note)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Product *</label>
                <select
                  value={retProductId}
                  onChange={(e) => setRetProductId(Number(e.target.value))}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Return Qty *</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={retQty}
                  onChange={(e) => setRetQty(e.target.value)}
                  placeholder="1"
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Orig. Inv / Ref</label>
                <input
                  type="text"
                  value={retRefNo}
                  onChange={(e) => setRetRefNo(e.target.value)}
                  placeholder="POS/26-27/0001"
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Refund Mode</label>
                <select
                  value={retSettle}
                  onChange={(e) => setRetSettle(e.target.value as 'CASH' | 'BANK_UPI' | 'CREDIT_LEDGER')}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-semibold"
                >
                  <option value="CASH">Cash Drawer</option>
                  <option value="BANK_UPI">Bank / UPI</option>
                  <option value="CREDIT_LEDGER">Adjust Party Credit Ledger</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer"
                >
                  + Issue {retType === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Note No.</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Product &amp; Qty</th>
                  <th className="px-4 py-2.5 text-right">Base (₹)</th>
                  <th className="px-4 py-2.5 text-right">CGST (₹)</th>
                  <th className="px-4 py-2.5 text-right">SGST (₹)</th>
                  <th className="px-4 py-2.5 text-right">Total (₹)</th>
                  <th className="px-4 py-2.5">Settlement</th>
                  {onDeleteReturnNote && <th className="px-4 py-2.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returnNotes.map((rn) => {
                  const rnHalf = r2(Number(rn.totalGstAmount || 0) / 2);
                  const rnCgst = rnHalf;
                  const rnSgst = rnHalf;
                  return (
                  <tr key={rn.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono-code text-slate-600">{rn.noteDate}</td>
                    <td className="px-4 py-2.5 font-mono-code font-bold text-slate-900">{rn.noteNo}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rn.noteType === 'CREDIT_NOTE'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {rn.noteType === 'CREDIT_NOTE' ? 'Credit Note (Sales Ret)' : 'Debit Note (Pur Ret)'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {rn.productName} ({rn.quantity} {rn.unit})
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-code">₹{fmt(rn.baseAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-code">₹{fmt(rnCgst)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-code">₹{fmt(rnSgst)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-code font-bold text-slate-900">
                      ₹{fmt(rn.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{rn.settlementMode}</td>
                    {onDeleteReturnNote && (
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteReturnNote(rn.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
                {returnNotes.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                      No Credit Notes or Debit Notes recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 9: FIXED ASSETS & DEPRECIATION SCHEDULE                           */}
      {/* ===================================================================== */}
      {showFixedAssetsTab && (
        <div className="print:hidden">
          <FixedAssetRegisterManager
            embedded
            fixedAssets={fixedAssets}
            society={society}
            onSaveFixedAsset={onAddFixedAsset}
            onAddFixedAsset={onAddFixedAsset}
            onDeleteFixedAsset={onDeleteFixedAsset}
            onRefreshData={onRefreshData}
          />
        </div>
      )}

      {/* Supporting Day-wise Breakdown Table */}
      {showDailySchedule && (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:shadow-none print:border-slate-400">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {periodMode === 'DAY'
                ? `Supporting Daily Trading Schedule (${selectedDay})`
                : `Supporting Day-by-Day Trading Schedule (${rangeStart || 'Start'} to ${rangeEnd || 'End'})`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Supporting daily sales, GST, COGS, trading profit, and stock purchase figures feeding the Trading Account above
            </p>
          </div>
          <div className="text-xs font-mono-code tabular-nums text-slate-600 font-semibold">
            {dayRows.length} Active {dayRows.length === 1 ? 'Day' : 'Days'} · {periodInvoices.length} Invoices
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Date</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Invoices</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Cash Sales</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">UPI Sales</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Sales Base</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Discount Allowed</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Output CGST</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Output SGST</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Round Off</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Gross Turnover</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">COGS (Excl. GST)</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Trading Profit</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Purchases (Excl. GST)</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Input CGST</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Input SGST</th>
                {periodMode === 'RANGE' && (
                  <th className="py-3 px-4 text-center whitespace-nowrap">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono-code tabular-nums">
              {dayRows.map((row) => (
                <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{row.date}</td>
                  <td className="py-3 px-3 text-center text-slate-700">{row.invoiceCount}</td>
                  <td className="py-3 px-3 text-right text-slate-700">₹{row.cashSales.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">₹{row.upiSales.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-slate-700">₹{row.salesBase.toFixed(2)}</td>
                  <td className={`py-3 px-3 text-right font-semibold ${(row.discountAllowed || 0) > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    ₹{(row.discountAllowed || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700">₹{row.outputCgst.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-slate-700">₹{row.outputSgst.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-amber-700 font-semibold">
                    +₹{row.roundOff.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                    ₹{row.grossTurnover.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-600">₹{row.cogsBase.toFixed(2)}</td>
                  <td
                    className={`py-3 px-3 text-right font-bold ${
                      row.tradingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    ₹{row.tradingProfit.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700">
                    ₹{row.purchasesBase.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700">
                    ₹{row.purchasesCgst.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700">
                    ₹{row.purchasesSgst.toFixed(2)}
                  </td>
                  {periodMode === 'RANGE' && (
                    <td className="py-3 px-4 text-center font-sans">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(row.date);
                          setPeriodMode('DAY');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
                      >
                        Inspect Day
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {dayRows.length > 0 && (
              <tfoot className="bg-slate-100/80 border-t border-slate-200 font-mono-code tabular-nums font-extrabold text-slate-900">
                <tr>
                  <td className="py-3 px-4 font-sans uppercase text-[11px]">Period Total</td>
                  <td className="py-3 px-3 text-center">{periodInvoices.length}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.cashSales.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">₹{accounts.upiSales.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.salesBase.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-rose-700">₹{accounts.totalSalesDiscount.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.outputCgst.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.outputSgst.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-amber-700">+₹{accounts.roundOffIncome.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.totalSalesRounded.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.cogsBase.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">
                    ₹{r2(accounts.grossProfit + accounts.roundOffIncome).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right">₹{accounts.purchaseBase.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.inputCgst.toFixed(2)}</td>
                  <td className="py-3 px-3 text-right">₹{accounts.inputSgst.toFixed(2)}</td>
                  {periodMode === 'RANGE' && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {dayRows.length === 0 && (
          <div className="py-12 px-4 text-center space-y-3">
            <Scale className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800 text-sm">
                No Sales or Purchase Entries for {periodLabel}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Closing stock valuation, salary/expense vouchers, and opening balances are still reflected in the Final Accounts above. Switch to Date Range Wise or select another business date to view trading activity.
              </p>
            </div>
            <button
              type="button"
              onClick={() => applyRangePreset('ALL_TIME')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>View All Time Statements</span>
            </button>
          </div>
        )}
      </div>
      )}
      </div>

      {/* Modal: Record Non-Inventory Ledger Voucher (Closes ONLY via Close/Cancel/Save) */}
      {isVoucherModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {voucherType === 'SUPPLIER_PAYMENT'
                    ? 'Pay Supplier (Sundry Creditor Settlement)'
                    : voucherType === 'MEMBER_RECEIPT'
                    ? 'Receive Member Credit Due (Sundry Debtor)'
                    : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                    ? 'Record Bank / Cash Contra Transfer'
                    : voucherType === 'OTHER_INCOME'
                    ? 'Record Other Income Voucher'
                    : 'Record Operating Expense Voucher'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {voucherType === 'SUPPLIER_PAYMENT'
                    ? 'Reduces Sundry Creditors payable on Balance Sheet & deducts from Cash/Bank Book'
                    : voucherType === 'MEMBER_RECEIPT'
                    ? 'Reduces Sundry Debtors receivable on Balance Sheet & adds to Cash/Bank Book'
                    : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                    ? 'Internal fund transfer between Counter Cash Drawer and Society Bank Account'
                    : 'Posts directly to Profit & Loss A/c and Cash & Bank Book (keeps Stock & Trading Margin accurate)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVoucherModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVoucher} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {voucherError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{voucherError}</span>
                </div>
              )}

              {/* Voucher Type Switcher (6 Standard Double-Entry Modes) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
                {(
                  [
                    { id: 'EXPENSE', label: 'Operating Expense', color: 'bg-rose-600 text-white' },
                    { id: 'OTHER_INCOME', label: 'Other Income', color: 'bg-emerald-600 text-white' },
                    { id: 'CONTRA_CASH_TO_BANK', label: 'Contra: Cash → Bank', color: 'bg-blue-600 text-white' },
                    { id: 'CONTRA_BANK_TO_CASH', label: 'Contra: Bank → Cash', color: 'bg-indigo-600 text-white' },
                    { id: 'SUPPLIER_PAYMENT', label: 'Pay Supplier (Cr.)', color: 'bg-amber-600 text-white' },
                    { id: 'MEMBER_RECEIPT', label: 'Member Receipt (Dr.)', color: 'bg-teal-600 text-white' },
                  ] as const
                ).map((vt) => (
                  <button
                    key={vt.id}
                    type="button"
                    onClick={() => handleSwitchModalType(vt.id)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      voucherType === vt.id ? `${vt.color} shadow-xs` : 'text-slate-700 hover:bg-white/70'
                    }`}
                  >
                    {vt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Voucher No.</label>
                  <input
                    type="text"
                    value={voucherNo}
                    onChange={(e) => setVoucherNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Voucher Date *</label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Conditional Ledger Head OR Party Selector OR Contra Info */}
              {voucherType === 'SUPPLIER_PAYMENT' ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-extrabold text-amber-950">
                      Select Supplier to Pay Back (Sundry Creditor)
                    </label>
                    {(() => {
                      const activeDue = selectedPartyId
                        ? partyLedgerSummary.byId.get(selectedPartyId)?.netDue || 0
                        : partyLedgerSummary.generalSupplierNetDue;
                      return activeDue > 0 ? (
                        <button
                          type="button"
                          onClick={() => setVoucherAmount(String(r2(activeDue)))}
                          className="text-[11px] font-bold text-amber-900 bg-white hover:bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300 cursor-pointer"
                        >
                          Fill Full Due: ₹{fmt(activeDue)}
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPartyId(id);
                      const sup = partyLedgerSummary.supplierList.find((s) => s.id === id);
                      if (sup) {
                        setPayeeOrPayer(sup.name);
                        const due = partyLedgerSummary.byId.get(id)?.netDue || 0;
                        if (due > 0 && !voucherAmount) {
                          setVoucherAmount(String(r2(due)));
                        }
                      } else {
                        setPayeeOrPayer('General Supplier');
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="">
                      General / Unassigned Supplier Credit ({periodLabel} Due: ₹
                      {fmt(Math.max(0, partyLedgerSummary.generalSupplierNetDue))})
                    </option>
                    {partyLedgerSummary.supplierList.map((s) => {
                      const due = partyLedgerSummary.byId.get(s.id)?.netDue || 0;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.gstin ? `(${s.gstin})` : ''} — Due: ₹{fmt(Math.max(0, due))}
                        </option>
                      );
                    })}
                  </select>
                  {(() => {
                    const periodDue = selectedPartyId
                      ? partyLedgerSummary.byId.get(selectedPartyId)?.netDue || 0
                      : partyLedgerSummary.generalSupplierNetDue;
                    const allTimeDue = selectedPartyId
                      ? partyLedgerSummary.allTimeById.get(selectedPartyId)?.netDue || 0
                      : partyLedgerSummary.allTimeGeneralSupplierNetDue;
                    const diff = r2(allTimeDue - periodDue);
                    return (
                      <div className="space-y-1 text-[11px] text-amber-800">
                        <div>
                          Matches <strong>Sundry Creditors</strong> for <strong>{periodLabel}</strong> (₹
                          {fmt(Math.max(0, periodDue))}). Deducts from Cash/Bank &amp; reduces Payable.
                        </div>
                        {diff > 0.01 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/80 text-amber-900">
                            <span>
                              Earlier dates unpaid credit: <strong>₹{fmt(diff)}</strong> · All-Time Total:{' '}
                              <strong>₹{fmt(Math.max(0, allTimeDue))}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setVoucherAmount(String(r2(allTimeDue)))}
                              className="text-[10px] font-bold underline hover:text-amber-950 cursor-pointer"
                            >
                              Fill All-Time (₹{fmt(allTimeDue)})
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : voucherType === 'MEMBER_RECEIPT' ? (
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-extrabold text-teal-950">
                      Select Co-op Member (Sundry Debtor)
                    </label>
                    {selectedPartyId && (partyLedgerSummary.byId.get(selectedPartyId)?.netDue || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVoucherAmount(
                            String(r2(partyLedgerSummary.byId.get(selectedPartyId)?.netDue || 0))
                          )
                        }
                        className="text-[11px] font-bold text-teal-900 bg-white hover:bg-teal-100 px-2.5 py-0.5 rounded-lg border border-teal-300 cursor-pointer"
                      >
                        Fill Full Due: ₹{fmt(partyLedgerSummary.byId.get(selectedPartyId)?.netDue || 0)}
                      </button>
                    )}
                  </div>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPartyId(id);
                      const mem = partyLedgerSummary.memberList.find((m) => m.id === id);
                      if (mem) {
                        setPayeeOrPayer(mem.name);
                        const due = partyLedgerSummary.byId.get(id)?.netDue || 0;
                        if (due > 0 && !voucherAmount) {
                          setVoucherAmount(String(r2(due)));
                        }
                      } else {
                        setPayeeOrPayer('');
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="">General / Unlisted Credit Customer</option>
                    {partyLedgerSummary.memberList.map((m) => {
                      const due = partyLedgerSummary.byId.get(m.id)?.netDue || 0;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.memberCode ? `(${m.memberCode})` : ''} — Net Due: ₹
                          {fmt(Math.max(0, due))}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH' ? (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 font-semibold">
                  {voucherType === 'CONTRA_CASH_TO_BANK'
                    ? 'Contra Transfer: Deposit cash from Counter Cash Drawer into Society Bank Account.'
                    : 'Contra Transfer: Withdraw cash from Society Bank Account into Counter Cash Drawer.'}
                </div>
              ) : (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    {voucherType === 'OTHER_INCOME'
                      ? 'Other Income Ledger Head *'
                      : 'Expense Ledger Head *'}
                  </label>
                  <select
                    value={selectedPresetHead}
                    onChange={(e) => setSelectedPresetHead(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {(voucherType === 'OTHER_INCOME'
                      ? OTHER_INCOME_LEDGER_PRESETS
                      : EXPENSE_LEDGER_PRESETS
                    ).map((head) => (
                      <option key={head} value={head}>
                        {head}
                      </option>
                    ))}
                    <option value="__CUSTOM__">+ Custom Ledger Head...</option>
                  </select>
                  {selectedPresetHead === '__CUSTOM__' && (
                    <input
                      type="text"
                      value={customLedgerHead}
                      onChange={(e) => setCustomLedgerHead(e.target.value)}
                      placeholder={
                        voucherType === 'OTHER_INCOME'
                          ? 'e.g. Empty Urea Bag Sale / Subsidy Received'
                          : 'e.g. Godown Security / Tea & Refreshment'
                      }
                      className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      required
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    {voucherType === 'SUPPLIER_PAYMENT'
                      ? 'Payback Amount (₹) *'
                      : voucherType === 'MEMBER_RECEIPT'
                      ? 'Received Amount (₹) *'
                      : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={voucherAmount}
                    onChange={(e) => setVoucherAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-code font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
                {voucherType !== 'CONTRA_CASH_TO_BANK' && voucherType !== 'CONTRA_BANK_TO_CASH' ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      {voucherType === 'OTHER_INCOME' || voucherType === 'MEMBER_RECEIPT'
                        ? 'Received Into Account'
                        : 'Paid From Account'}
                    </label>
                    <select
                      value={voucherPayMode}
                      onChange={(e) =>
                        setVoucherPayMode(e.target.value === 'BANK_UPI' ? 'BANK_UPI' : 'CASH')
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="CASH">Counter Cash Drawer</option>
                      <option value="BANK_UPI">Bank / Online UPI / NEFT Account</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Transfer Direction</label>
                    <div className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-800">
                      {voucherType === 'CONTRA_CASH_TO_BANK'
                        ? 'Cash Drawer → Bank A/c'
                        : 'Bank A/c → Cash Drawer'}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    {voucherType === 'SUPPLIER_PAYMENT'
                      ? 'Supplier Name / Receiver'
                      : voucherType === 'MEMBER_RECEIPT'
                      ? 'Member / Payer Name'
                      : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                      ? 'Bank Name / Slip Ref'
                      : voucherType === 'OTHER_INCOME'
                      ? 'Received From (Party / Source)'
                      : 'Paid To (Staff / Payee)'}
                  </label>
                  <input
                    type="text"
                    value={payeeOrPayer}
                    onChange={(e) => setPayeeOrPayer(e.target.value)}
                    placeholder={
                      voucherType === 'SUPPLIER_PAYMENT'
                        ? 'e.g. IFFCO Kolkata / Supplier Name'
                        : voucherType === 'MEMBER_RECEIPT'
                        ? 'e.g. Ramesh Das (Member)'
                        : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                        ? 'e.g. SBI Deganga Branch / Slip #204'
                        : voucherType === 'OTHER_INCOME'
                        ? 'e.g. Bank Interest / Scrap Buyer'
                        : 'e.g. Bimalendu Sarkar (Staff)'
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    {voucherType === 'SUPPLIER_PAYMENT'
                      ? 'Bill No. / UTR / Cheque Remarks'
                      : 'Narration / Remarks'}
                  </label>
                  <input
                    type="text"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder={
                      voucherType === 'SUPPLIER_PAYMENT'
                        ? 'e.g. Against Bill #1042 via NEFT UTR...'
                        : voucherType === 'MEMBER_RECEIPT'
                        ? 'e.g. Partial/Full Udhaar clearance'
                        : voucherType === 'CONTRA_CASH_TO_BANK'
                        ? 'e.g. Daily cash deposit to society bank'
                        : voucherType === 'CONTRA_BANK_TO_CASH'
                        ? 'e.g. Cash withdrawn for counter float'
                        : voucherType === 'OTHER_INCOME'
                        ? 'e.g. Quarterly bank savings interest'
                        : 'e.g. Monthly staff salary'
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Live Double-Entry Preview */}
              <div
                className={`p-3 rounded-xl border text-[11px] font-mono-code ${
                  voucherType === 'OTHER_INCOME'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : voucherType === 'SUPPLIER_PAYMENT'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : voucherType === 'MEMBER_RECEIPT'
                    ? 'bg-teal-50 border-teal-200 text-teal-950'
                    : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                    ? 'bg-blue-50 border-blue-200 text-blue-950'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="font-sans font-bold mb-0.5">Double-Entry Ledger Posting Preview:</div>
                {voucherType === 'SUPPLIER_PAYMENT' ? (
                  <div>
                    Dr. Sundry Creditors{payeeOrPayer ? ` (${payeeOrPayer})` : ''} (Reduces Payable) · Cr.{' '}
                    {voucherPayMode === 'BANK_UPI' ? 'Bank / UPI A/c' : 'Cash Drawer A/c'} (Cash Book Payment)
                  </div>
                ) : voucherType === 'MEMBER_RECEIPT' ? (
                  <div>
                    Dr. {voucherPayMode === 'BANK_UPI' ? 'Bank / UPI A/c' : 'Cash Drawer A/c'} (Cash Book Receipt) · Cr.{' '}
                    Sundry Debtors{payeeOrPayer ? ` (${payeeOrPayer})` : ''} (Reduces Receivable)
                  </div>
                ) : voucherType === 'CONTRA_CASH_TO_BANK' ? (
                  <div>
                    Dr. Bank / UPI A/c (Increases Bank) · Cr. Cash Drawer A/c (Reduces Cash) — No P&amp;L impact
                  </div>
                ) : voucherType === 'CONTRA_BANK_TO_CASH' ? (
                  <div>
                    Dr. Cash Drawer A/c (Increases Cash) · Cr. Bank / UPI A/c (Reduces Bank) — No P&amp;L impact
                  </div>
                ) : voucherType === 'OTHER_INCOME' ? (
                  <div>
                    Dr. {voucherPayMode === 'BANK_UPI' ? 'Bank / UPI A/c' : 'Cash Drawer A/c'} (Cash Book Receipt) · Cr.{' '}
                    {resolvedLedgerHead || 'Other Income A/c'} (P&amp;L Credit)
                  </div>
                ) : (
                  <div>
                    Dr. {resolvedLedgerHead || 'Expense A/c'} (P&amp;L Debit) · Cr.{' '}
                    {voucherPayMode === 'BANK_UPI' ? 'Bank / UPI A/c' : 'Cash Drawer A/c'} (Cash Book Payment)
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsVoucherModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVoucher}
                  className={`px-5 py-2 rounded-lg text-white font-bold shadow cursor-pointer disabled:opacity-50 ${
                    voucherType === 'OTHER_INCOME'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : voucherType === 'SUPPLIER_PAYMENT'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : voucherType === 'MEMBER_RECEIPT'
                      ? 'bg-teal-600 hover:bg-teal-500'
                      : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {isSavingVoucher
                    ? 'Saving...'
                    : voucherType === 'SUPPLIER_PAYMENT'
                    ? 'Record Supplier Payback'
                    : voucherType === 'MEMBER_RECEIPT'
                    ? 'Record Member Receipt'
                    : voucherType === 'CONTRA_CASH_TO_BANK' || voucherType === 'CONTRA_BANK_TO_CASH'
                    ? 'Save Contra Transfer'
                    : voucherType === 'OTHER_INCOME'
                    ? 'Save Other Income Voucher'
                    : 'Save Expense Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
