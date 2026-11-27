export type PaymentMode = 'UPI' | 'CASH' | 'CREDIT' | 'SPLIT';

export type UnitType = '0' | 'KG' | 'GM' | 'LTR' | 'ML' | 'PKT' | 'PCS' | 'JAR' | 'BASTA';

export interface Product {
  id: number;
  name: string;
  category: string;
  barcode: string;
  hsnCode?: string; // HSN / SAC code for GST compliance & GSTR-1 Table 12
  unit: UnitType;
  sellingPrice: number; // Final selling price (Selling Price-WT GST)
  costPrice: number; // Purchase Price (Excl. GST)
  sellingPriceWD?: number; // Selling Price-WD GST (Base Price without GST)
  gstPercent?: number; // GST Charge (%)
  sellingPriceWithGst?: number; // Selling Price-WT GST (Calculated)
  stock: number;
  minStockLevel: number;
  batchNo: string;
  expiryDate?: string;
  image: string;
  description?: string;
  featured?: boolean;
}

export interface LoosePacket {
  id: string; // e.g. "pack-1710000000"
  productId: number;
  productName: string;
  baseBarcode: string;
  uniqueBarcode: string; // Guaranteed unique barcode e.g. "890100100101-250G-1001"
  measuredGramsOrMl: number;
  weightText: string; // e.g. "250 GM" or "500 ML"
  quantityInBaseUnit: number; // e.g. 0.25
  unitPrice: number; // rate e.g. 100
  calculatedPrice: number; // e.g. 25.00
  unit: UnitType;
  createdAt: string;
  status: 'UNSOLD' | 'SOLD';
  soldAtInvoiceNo?: string;
  soldDate?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  sellingPrice: number; // Base unit selling rate Excl. GST (or inclusive when 0% GST)
  lineTotal: number; // Base line amount (quantity * baseRate)
  packetBarcode?: string; // If this cart item is from a measured loose packet with printed barcode
  barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE'; // WITH_BARCODE = scanned/barcoded; WITHOUT_BARCODE = measured loose directly
  saleType?: 'BARCODE' | 'DIRECT_LOOSE'; // Sale method
  measuredWeightText?: string; // e.g. "350 GM" or "1.25 KG"
}

export interface HeldCartBill {
  id: string;
  heldAt: string;
  customerName: string;
  customerId?: string;
  buyerGstin?: string;
  applyMemberDiscount?: boolean;
  items: CartItem[];
  totalEstimate?: number;
}

export interface SaleTransactionItem {
  id?: number;
  date?: string;
  saleItemId: number;
  saleId: number;
  invoiceNo: string;
  saleDate: string;
  customerName: string; // e.g. "Ramesh Sharma" or "Walk-in Customer"
  customerId?: string; // Linked Member / Farmer ID if credit or member sale
  buyerGstin?: string; // Optional B2B buyer GSTIN
  paymentMode: PaymentMode;
  cashPaid?: number; // Cash portion when SPLIT or CASH
  upiPaid?: number; // UPI portion when SPLIT or UPI
  creditDue?: number; // Credit portion when CREDIT (Udhaar)
  memberDiscount?: number; // Member rebate applied on invoice
  productId: number;
  productName: string;
  barcode: string;
  hsnCode?: string;
  quantity: number;
  unitType: UnitType;
  sellingPrice: number; // Selling Price-WT GST per unit
  lineTotal: number;
  costPrice?: number; // Purchase Price
  sellingPriceWD?: number; // Base Selling Price without GST
  gstPercent?: number; // GST Charge (%)
  cgstPercent?: number; // CGST % (half of GST%)
  sgstPercent?: number; // SGST % (half of GST%)
  cgstAmount?: number; // CGST amount in ₹
  sgstAmount?: number; // SGST amount in ₹
  totalGstAmount?: number; // Total GST in ₹
  baseAmount?: number; // Total Base amount in ₹
  cashierName?: string;
  tenderedCash?: number;
  changeDue?: number;
  upiTxnRef?: string;
  barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE';
  saleType?: 'BARCODE' | 'DIRECT_LOOSE';
  measuredWeightText?: string;
  packetBarcode?: string;
}

export interface InvoiceAnalyticsRecord {
  id?: number;
  saleId: number;
  invoiceNo: string;
  saleDate: string;
  customerName: string;
  customerId?: string;
  buyerGstin?: string;
  paymentMode: PaymentMode;
  cashPaid?: number;
  upiPaid?: number;
  creditDue?: number;
  memberDiscount?: number;
  cashierName: string;
  totalAmount: number; // Selling Price-WT GST Grand Total
  baseAmount?: number; // Subtotal Base Amount without GST
  totalGst?: number; // Total GST Charge amount
  cgstAmount?: number; // CGST Charge amount (half of GST)
  sgstAmount?: number; // SGST Charge amount (half of GST)
  gstSummary?: string; // Summary description e.g. "CGST: 2.5%, SGST: 2.5%"
  totalProducts: number;
  productsSummary: string;
  itemsDetail: {
    productId: number;
    productName: string;
    barcode: string;
    hsnCode?: string;
    quantity: number;
    unitType: UnitType;
    purchasePrice?: number;
    sellingPriceWD?: number;
    gstPercent?: number;
    cgstPercent?: number;
    sgstPercent?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    totalGstAmount?: number;
    baseAmount?: number;
    sellingPrice: number; // Selling Price-WT GST
    lineTotal: number;
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE';
    saleType?: 'BARCODE' | 'DIRECT_LOOSE';
    measuredWeightText?: string;
    packetBarcode?: string;
  }[];
  tenderedCash?: number;
  changeDue?: number;
  upiTxnRef?: string;
  createdAt?: string;
}

export interface CompleteInvoice {
  saleId: number;
  invoiceNo: string;
  saleDate: string;
  customerName: string;
  customerId?: string;
  buyerGstin?: string;
  customerPhone?: string;
  paymentMode: PaymentMode;
  cashPaid?: number;
  upiPaid?: number;
  creditDue?: number;
  memberDiscount?: number;
  items: {
    productId: number;
    productName: string;
    barcode: string;
    hsnCode?: string;
    quantity: number;
    unitType: UnitType;
    purchasePrice?: number;
    sellingPriceWD?: number;
    gstPercent?: number;
    cgstPercent?: number;
    sgstPercent?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    totalGstAmount?: number;
    baseAmount?: number;
    sellingPrice: number;
    lineTotal: number;
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE';
    saleType?: 'BARCODE' | 'DIRECT_LOOSE';
    measuredWeightText?: string;
    packetBarcode?: string;
  }[];
  baseAmount?: number;
  totalGst?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  roundOff?: number;
  subtotal: number;
  discount: number;
  grandTotal: number;
  tenderedCash?: number;
  changeDue?: number;
  upiTxnRef?: string;
  cashier: string;
}

export interface SocietyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  regNo: string;
  gstin?: string;
  stateCode?: string;
  upiId: string;
  merchantName?: string;
  qrImage?: string;
  counterId: string;
  cashierName: string;
}

export interface CashierUser {
  id: string;
  loginId: string;
  passwordHash: string; // login password / hashed credential
  name: string;
  staffCode: string;
  role: 'Senior Cashier' | 'POS Cashier' | 'Society Manager' | 'System Admin' | 'Developer';
  assignedCounter: string;
  email?: string;
  isDeveloper?: boolean;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export type TransactionControlMode = 'STOP_ALL' | 'ONLY_SELL' | 'ONLY_PURCHASE' | 'BOTH';

export interface AdminStoreSettings {
  transactionsEnabled: boolean; // Legacy master toggle (true when sales are allowed / mode !== STOP_ALL)
  transactionMode?: TransactionControlMode; // Stop Transaction, Only Sell, Only Purchase, or Both
  upiPaymentsEnabled: boolean; // Enable/disable UPI payments
  cashPaymentsEnabled: boolean; // Enable/disable cash payments
  creditSalesEnabled?: boolean; // Enable/disable Cooperative Member Credit (Udhaar) sales
  allowCreditSales?: boolean; // Alias for creditSalesEnabled
  memberDiscountPercent?: number; // Co-op member rebate %
  emergencyNotice: string;
  haltReason?: string;
  // Database-persisted Accounting & Compliance Config
  societyGstin?: string;
  stateCode?: string;
  gstStateCode?: string; // Alias for stateCode
  financialYear?: string; // e.g. "2026-27"
  openingCashBalance?: number;
  openingBankBalance?: number;
  openingCgstItc?: number;
  openingSgstItc?: number;
  shareCapital?: number;
  cooperativeReserveFund?: number;
  purchaseSettlementMode?: 'CREDIT' | 'BANK_UPI' | 'CASH';
  requireStrictUpiUtr?: boolean;
  strictUpiValidation?: boolean; // Alias for requireStrictUpiUtr
}

export interface AdminAuditLog {
  id: string;
  timestamp: string;
  action: string;
  performedBy: string;
  details: string;
}

export type PurchaseEntryType = 'NEW_PRODUCT' | 'FILL_EXISTING' | 'QUICK_RESTOCK';

export type PurchaseCommissionType = 'NONE' | 'PERCENT' | 'FIXED';
export type PurchaseCommissionMode = 'DEDUCT_BILL' | 'SEPARATE_BANK' | 'SEPARATE_CASH';

export interface PurchaseTransaction {
  id: string;
  purchaseRef: string;
  purchaseDate: string;
  entryType: PurchaseEntryType;
  productId: number;
  productName: string;
  category: string;
  barcode: string;
  hsnCode?: string;
  unit: UnitType;
  previousStock: number;
  addedQuantity: number;
  newStock: number;
  purchasePrice: number;
  gstPercent: number;
  baseAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalGstAmount: number;
  totalAmount: number;
  commissionType?: PurchaseCommissionType;
  commissionPercent?: number;
  commissionAmount?: number;
  commissionMode?: PurchaseCommissionMode;
  commissionNote?: string;
  netPayableAmount?: number;
  supplierId?: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
  supplierNote?: string;
  batchNo?: string;
  expiryDate?: string;
  performedBy: string;
}

export interface GstGovtPayment {
  id: string;
  challanRef: string;
  paymentDate: string;
  returnPeriod: string;
  cgstPaid: number;
  sgstPaid: number;
  interestOrFee: number;
  totalPaid: number;
  paymentSource: 'BANK_UPI' | 'CASH';
  paymentMode?: 'BANK_UPI' | 'CASH';
  notes?: string;
  performedBy: string;
}

export type GstTaxPaymentRecord = GstGovtPayment;

export type AccountVoucherType =
  | 'EXPENSE'
  | 'OTHER_INCOME'
  | 'CONTRA_CASH_TO_BANK'
  | 'CONTRA_BANK_TO_CASH'
  | 'SUPPLIER_PAYMENT'
  | 'MEMBER_RECEIPT';

export interface AccountLedgerVoucher {
  id: string;
  voucherNo: string;
  voucherDate: string;
  voucherType: AccountVoucherType;
  ledgerHead: string;
  amount: number;
  paymentMode: 'CASH' | 'BANK_UPI';
  partyId?: string;
  payeeOrPayer?: string;
  narration?: string;
  performedBy: string;
}

export type PartyType = 'SUPPLIER' | 'MEMBER';

export type SupplierCategory =
  | 'Manufacturer'
  | 'Distributor'
  | 'Wholesaler'
  | 'Retailer'
  | 'Other';

export type OpeningBalanceType = 'PAYABLE' | 'ADVANCE';

export interface PartyAccount {
  id: string;
  partyType: PartyType;
  supplierCode?: string; // Auto-generated unique Supplier ID (e.g. SUP-0001)
  supplierCategory?: SupplierCategory;
  name: string;
  contactPerson?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  villageOrAddress?: string;
  address?: string;
  state?: string;
  pinCode?: string;
  gstin?: string;
  pan?: string;
  memberNo?: string;
  memberCode?: string;
  discountPercent?: number;
  openingBalance: number; // Non-negative amount; direction determined by openingBalanceType for SUPPLIER
  openingBalanceType?: OpeningBalanceType; // PAYABLE (society owes supplier) | ADVANCE (supplier holds society advance)
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankAccountDetails?: string;
  creditLimit?: number;
  isActive?: boolean;
  remarks?: string;
  notes?: string;
  createdAt?: string;
}

export type ReturnNoteType = 'CREDIT_NOTE' | 'DEBIT_NOTE'; // CREDIT_NOTE = Sales Return, DEBIT_NOTE = Purchase Return

export interface ReturnNote {
  id: string;
  noteNo: string;
  noteDate?: string;
  returnDate?: string;
  noteType: ReturnNoteType;
  refNo?: string; // Original Invoice No or Purchase Ref
  referenceNo?: string;
  partyId?: string;
  partyName: string;
  productId: number;
  productName: string;
  hsnCode?: string;
  unit: UnitType | string;
  quantity: number;
  unitRateExclGst?: number;
  unitPriceWD?: number;
  gstPercent: number;
  baseAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalGstAmount: number;
  totalAmount: number;
  settlementMode?: 'CASH' | 'BANK_UPI' | 'ADJUST_CREDIT' | 'CREDIT_LEDGER' | 'ADJUST_LEDGER';
  refundMode?: 'CASH' | 'BANK_UPI' | 'ADJUST_CREDIT' | 'CREDIT_LEDGER' | 'ADJUST_LEDGER';
  reason?: string;
  performedBy: string;
}

export interface FixedAsset {
  id: string;
  assetCode?: string;
  assetName: string;
  category: string;
  purchaseDate: string;
  acquisitionDate?: string;
  costValue?: number;
  purchaseCost?: number;
  depreciationRate?: number; // % per annum
  depreciationRatePercent?: number;
  depreciationRatePct?: number;
  depreciationPercent?: number;
  accumulatedDep?: number;
  accumulatedDepreciation?: number;
  netBookValue?: number;
  fundingSource?: 'CASH' | 'BANK_UPI' | 'CAPITAL' | 'CAPITAL_OPENING';
  paymentMode?: string;
  quantity?: number;
  invoiceOrBillNo?: string;
  supplierName?: string;
  location?: string;
  serialNumber?: string;
  status?: 'ACTIVE' | 'UNDER_REPAIR' | 'DISPOSED';
  notes?: string;
}

export interface DailyDrawerClosing {
  id: string;
  closingDate: string;
  counterId?: string;
  cashierName?: string;
  closedBy?: string;
  openingFloat: number;
  cashSales?: number;
  cashSalesTotal?: number;
  upiSales?: number;
  upiSalesTotal?: number;
  creditSales?: number;
  cashInflows?: number;
  cashInflowsTotal?: number;
  cashOutflows?: number;
  cashOutflowsTotal?: number;
  expectedCash?: number;
  countedCash?: number;
  physicalCashCounted?: number;
  actualCountedCash?: number;
  variance: number;
  denominations?: Record<string, number>;
  denominationBreakdown?: Record<string, number>;
  notes?: string;
  remarks?: string;
  closedAt?: string;
  createdAt?: string;
}


