import type { Product, SaleTransactionItem, SocietyProfile, CashierUser, AdminStoreSettings, AdminAuditLog } from '../types.ts';

export const SOCIETY_INFO: SocietyProfile = {
  name: 'Deganga CADPFSCS Ltd',
  address: 'Village : Berachampa, Dist. North 24 Parganas',
  phone: '+91 33 2556 7890 / +91 98301 23456',
  email: 'cadpfscsltd@gmail.com',
  regNo: '18/24pgs(n)dt. 15/10/1976',
  gstin: '19AAAAD9763A1ZS',
  stateCode: '19 - West Bengal',
  upiId: '21785723893@indianbk',
  merchantName: 'DEGANGA CADP FSCS LTD',
  qrImage: '/assets/payment-qr.png',
  counterId: 'COUNTER-01 (KOL-NORTH)',
  cashierName: 'Subrata Roy (Staff #402)',
};

const RAW_PRODUCTS: Product[] = [];

export const INITIAL_PRODUCTS: Product[] = [];

// Initial ledger populated from sales history
const RAW_LEDGER: SaleTransactionItem[] = [];

export const INITIAL_LEDGER: SaleTransactionItem[] = RAW_LEDGER.map((it) => {
  const prod = INITIAL_PRODUCTS.find((p) => p.id === it.productId);
  const purchaseCost = prod ? prod.costPrice : (it.costPrice || it.sellingPrice * 0.8);
  const gstPct = prod ? (prod.gstPercent || 5) : 5;
  const halfGst = gstPct / 2;
  const unitGst = (purchaseCost * gstPct) / 100;
  const basePrice = prod ? (prod.sellingPriceWD || (it.sellingPrice - unitGst)) : Math.max(0, it.sellingPrice - unitGst);
  const totalGst = unitGst * it.quantity;
  const baseTotal = basePrice * it.quantity;

  return {
    ...it,
    costPrice: purchaseCost,
    sellingPriceWD: basePrice,
    gstPercent: gstPct,
    cgstPercent: halfGst,
    sgstPercent: halfGst,
    cgstAmount: Number((totalGst / 2).toFixed(2)),
    sgstAmount: Number((totalGst / 2).toFixed(2)),
    totalGstAmount: Number(totalGst.toFixed(2)),
    baseAmount: Number(baseTotal.toFixed(2)),
    sellingPrice: it.sellingPrice || (prod ? prod.sellingPrice : 0),
    lineTotal: it.lineTotal || (it.sellingPrice * it.quantity),
    barcodeMode: (it as any).barcodeMode || 'WITH_BARCODE',
    saleType: (it as any).saleType || 'BARCODE',
    measuredWeightText: (it as any).measuredWeightText,
  };
});

export const CATEGORIES = [
  'All Items',
  'Fertilizer',
  'Pestiside',
];

export const INITIAL_CASHIERS: CashierUser[] = [
  {
    id: 'admin-001',
    loginId: 'admin',
    passwordHash: 'admin123',
    name: 'Society Administrator',
    staffCode: 'ADMIN #01',
    role: 'System Admin',
    assignedCounter: 'ADMIN DESK (CENTRAL)',
    isActive: true,
    createdAt: '2026-10-25',
  },
  {
    id: 'cashier-402',
    loginId: 'subrata',
    passwordHash: 'nabkul@123',
    name: 'Subrata Roy',
    staffCode: 'Staff #402',
    role: 'Senior Cashier',
    assignedCounter: 'COUNTER-01 (KOL-NORTH)',
    isActive: true,
    createdAt: '2026-10-26',
  },
  {
    id: 'cashier-405',
    loginId: 'priya',
    passwordHash: 'nabkul@123',
    name: 'Priya Ghosh',
    staffCode: 'Staff #405',
    role: 'POS Cashier',
    assignedCounter: 'COUNTER-02 (KOL-NORTH)',
    isActive: true,
    createdAt: '2026-10-27',
  },
  {
    id: 'cashier-101',
    loginId: 'manager',
    passwordHash: 'admin@nabkul',
    name: 'Bimalendu Sarkar',
    staffCode: 'Staff #101',
    role: 'Society Manager',
    assignedCounter: 'CENTRAL DESK',
    isActive: true,
    createdAt: '2026-10-25',
  },
];

export const INITIAL_ADMIN_SETTINGS: AdminStoreSettings = {
  transactionsEnabled: true,
  transactionMode: 'BOTH',
  upiPaymentsEnabled: true,
  cashPaymentsEnabled: true,
  memberDiscountPercent: 0,
  emergencyNotice: '',
  haltReason: '',
  societyGstin: '19AAAAD9763A1ZS',
  gstStateCode: '19 - West Bengal',
  stateCode: '19',
};

export const INITIAL_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: 'audit-001',
    timestamp: '2026-10-30 08:30',
    action: 'SYSTEM_INITIALIZED',
    performedBy: 'ADMIN #01',
    details: 'Deganga CADPFSCS Ltd POS and QR Platform initialized.',
  },
  {
    id: 'audit-002',
    timestamp: '2026-10-30 08:35',
    action: 'STAFF_ENROLLED',
    performedBy: 'ADMIN #01',
    details: 'Registered Cashier Subrata Roy (Staff #402) on Counter-01.',
  },
];


