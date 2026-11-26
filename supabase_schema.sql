-- ==============================================================================
-- Deganga CADPFSCS Ltd - COMPLETE SUPABASE DATABASE SCHEMA (ALL 14 TABLES)
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR TO PROVISION ALL TABLES
-- ==============================================================================

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    barcode TEXT UNIQUE,
    "hsnCode" TEXT DEFAULT '',
    unit TEXT NOT NULL,
    "sellingPrice" NUMERIC NOT NULL DEFAULT 0,
    "costPrice" NUMERIC NOT NULL DEFAULT 0,
    "sellingPriceWD" NUMERIC DEFAULT 0,
    "gstPercent" NUMERIC DEFAULT 5,
    "sellingPriceWithGst" NUMERIC DEFAULT 0,
    stock NUMERIC(12,3) NOT NULL DEFAULT 0,
    "minStockLevel" NUMERIC NOT NULL DEFAULT 0,
    "batchNo" TEXT,
    "expiryDate" TEXT,
    image TEXT,
    description TEXT,
    featured BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS "sellingPriceWD" NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "gstPercent" NUMERIC DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "sellingPriceWithGst" NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "hsnCode" TEXT DEFAULT '';
ALTER TABLE products ALTER COLUMN stock TYPE NUMERIC(12,3);

-- 2. INVOICE ANALYTICS TABLE
CREATE TABLE IF NOT EXISTS "Invoice Analytics" (
    "saleItemId" BIGSERIAL PRIMARY KEY,
    "saleId" BIGINT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "saleDate" TEXT NOT NULL,
    "customerId" TEXT DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT 'Walk-in Customer',
    "buyerGstin" TEXT DEFAULT '',
    "paymentMode" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL DEFAULT 'Society Administrator',
    "productId" BIGINT DEFAULT 0,
    "productName" TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    "hsnCode" TEXT DEFAULT '',
    quantity NUMERIC(12,3) DEFAULT 1,
    "unitType" TEXT DEFAULT 'PCS',
    "sellingPrice" NUMERIC DEFAULT 0,
    "lineTotal" NUMERIC DEFAULT 0,
    "totalAmount" NUMERIC DEFAULT 0,
    "baseAmount" NUMERIC DEFAULT 0,
    "totalGst" NUMERIC DEFAULT 0,
    "cgstAmount" NUMERIC DEFAULT 0,
    "sgstAmount" NUMERIC DEFAULT 0,
    "gstSummary" TEXT DEFAULT '',
    "totalProducts" INTEGER NOT NULL DEFAULT 1,
    "productsSummary" TEXT NOT NULL DEFAULT '',
    "itemsDetail" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "tenderedCash" NUMERIC DEFAULT 0,
    "changeDue" NUMERIC DEFAULT 0,
    "upiTxnRef" TEXT DEFAULT '',
    "cashPaid" NUMERIC DEFAULT 0,
    "upiPaid" NUMERIC DEFAULT 0,
    "creditDue" NUMERIC DEFAULT 0,
    "memberDiscount" NUMERIC DEFAULT 0,
    "hasLooseItems" BOOLEAN DEFAULT FALSE,
    "saleModeSummary" TEXT DEFAULT 'WITH_BARCODE',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "customerId" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "buyerGstin" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "productsSummary" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "totalProducts" INTEGER DEFAULT 1;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "itemsDetail" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "baseAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "totalGst" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "cgstAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "sgstAmount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "gstSummary" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "tenderedCash" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "changeDue" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "upiTxnRef" TEXT DEFAULT '';
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "cashPaid" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "upiPaid" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "creditDue" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "memberDiscount" NUMERIC DEFAULT 0;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "hasLooseItems" BOOLEAN DEFAULT FALSE;
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "saleModeSummary" TEXT DEFAULT 'WITH_BARCODE';

-- 2B. SALE TRANSACTIONS TABLE (LINE-ITEM SALES LEDGER)
CREATE TABLE IF NOT EXISTS sale_transactions (
    "saleItemId" BIGSERIAL PRIMARY KEY,
    "saleId" BIGINT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "saleDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT 'Walk-in Customer',
    "paymentMode" TEXT NOT NULL,
    "productId" BIGINT NOT NULL DEFAULT 0,
    "productName" TEXT NOT NULL,
    barcode TEXT DEFAULT '',
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
    "unitType" TEXT NOT NULL DEFAULT 'PCS',
    "sellingPrice" NUMERIC NOT NULL DEFAULT 0,
    "lineTotal" NUMERIC NOT NULL DEFAULT 0,
    "cashierName" TEXT NOT NULL DEFAULT 'Society Administrator'
);

-- 3. CASHIERS TABLE
CREATE TABLE IF NOT EXISTS cashiers (
    id TEXT PRIMARY KEY,
    "loginId" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    name TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    role TEXT NOT NULL,
    "assignedCounter" TEXT,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TEXT NOT NULL,
    "lastLogin" TEXT
);

-- 4. ADMIN SETTINGS TABLE
CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    "transactionsEnabled" BOOLEAN DEFAULT TRUE,
    "upiPaymentsEnabled" BOOLEAN DEFAULT TRUE,
    "cashPaymentsEnabled" BOOLEAN DEFAULT TRUE,
    "memberDiscountPercent" NUMERIC DEFAULT 0,
    "emergencyNotice" TEXT,
    "haltReason" TEXT,
    CONSTRAINT single_row CHECK (id = 1)
);

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- 6. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    details TEXT
);

-- 7. LOOSE PACKETS TABLE
CREATE TABLE IF NOT EXISTS loose_packets (
    id TEXT PRIMARY KEY,
    "productId" BIGINT NOT NULL,
    "productName" TEXT NOT NULL,
    "baseBarcode" TEXT NOT NULL,
    "uniqueBarcode" TEXT UNIQUE NOT NULL,
    "measuredGramsOrMl" NUMERIC NOT NULL,
    "weightText" TEXT NOT NULL,
    "quantityInBaseUnit" NUMERIC NOT NULL,
    "unitPrice" NUMERIC NOT NULL,
    "calculatedPrice" NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNSOLD',
    "soldAtInvoiceNo" TEXT,
    "soldDate" TEXT
);

-- 8. PURCHASE TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS purchase_transactions (
    id TEXT PRIMARY KEY,
    "purchaseRef" TEXT NOT NULL,
    "purchaseDate" TEXT NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'FILL_EXISTING',
    "productId" BIGINT NOT NULL,
    "productName" TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    barcode TEXT NOT NULL DEFAULT '',
    "hsnCode" TEXT DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'KG',
    "previousStock" NUMERIC(12,3) NOT NULL DEFAULT 0,
    "addedQuantity" NUMERIC(12,3) NOT NULL DEFAULT 0,
    "newStock" NUMERIC(12,3) NOT NULL DEFAULT 0,
    "purchasePrice" NUMERIC NOT NULL DEFAULT 0,
    "gstPercent" NUMERIC NOT NULL DEFAULT 0,
    "baseAmount" NUMERIC NOT NULL DEFAULT 0,
    "cgstAmount" NUMERIC NOT NULL DEFAULT 0,
    "sgstAmount" NUMERIC NOT NULL DEFAULT 0,
    "totalGstAmount" NUMERIC NOT NULL DEFAULT 0,
    "totalAmount" NUMERIC NOT NULL DEFAULT 0,
    "supplierId" TEXT DEFAULT '',
    "supplierName" TEXT DEFAULT '',
    "supplierInvoiceNo" TEXT DEFAULT '',
    "paymentStatus" TEXT DEFAULT 'CREDIT',
    "supplierNote" TEXT DEFAULT '',
    "batchNo" TEXT DEFAULT '',
    "expiryDate" TEXT DEFAULT '',
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM ADMIN',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "hsnCode" TEXT DEFAULT '';
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "supplierId" TEXT DEFAULT '';
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "supplierName" TEXT DEFAULT '';
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "supplierInvoiceNo" TEXT DEFAULT '';
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT DEFAULT 'CREDIT';
ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS "expiryDate" TEXT DEFAULT '';

-- 9. GOVT GST PAYMENTS (CHALLAN PMT-06)
CREATE TABLE IF NOT EXISTS gst_payments (
    id TEXT PRIMARY KEY,
    "challanRef" TEXT NOT NULL,
    "paymentDate" TEXT NOT NULL,
    "returnPeriod" TEXT NOT NULL,
    "cgstPaid" NUMERIC NOT NULL DEFAULT 0,
    "sgstPaid" NUMERIC NOT NULL DEFAULT 0,
    "interestOrFee" NUMERIC NOT NULL DEFAULT 0,
    "totalPaid" NUMERIC NOT NULL DEFAULT 0,
    "paymentSource" TEXT NOT NULL DEFAULT 'BANK_UPI',
    notes TEXT DEFAULT '',
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM ADMIN',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. ACCOUNT LEDGER VOUCHERS (EXPENSE, OTHER INCOME, CONTRA, PARTY PAYMENTS)
CREATE TABLE IF NOT EXISTS account_vouchers (
    id TEXT PRIMARY KEY,
    "voucherNo" TEXT NOT NULL,
    "voucherDate" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL DEFAULT 'EXPENSE',
    "ledgerHead" TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "partyId" TEXT DEFAULT '',
    "payeeOrPayer" TEXT DEFAULT '',
    narration TEXT DEFAULT '',
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM ADMIN',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. PARTY ACCOUNTS (SUPPLIERS & COOPERATIVE MEMBERS)
CREATE TABLE IF NOT EXISTS party_accounts (
    id TEXT PRIMARY KEY,
    "partyType" TEXT NOT NULL DEFAULT 'MEMBER',
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    gstin TEXT DEFAULT '',
    address TEXT DEFAULT '',
    "memberNo" TEXT DEFAULT '',
    "memberCode" TEXT DEFAULT '',
    "discountPercent" NUMERIC DEFAULT 0,
    "openingBalance" NUMERIC NOT NULL DEFAULT 0,
    "creditLimit" NUMERIC DEFAULT 0,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TEXT NOT NULL
);
ALTER TABLE party_accounts ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE party_accounts ADD COLUMN IF NOT EXISTS "memberCode" TEXT DEFAULT '';
ALTER TABLE party_accounts ADD COLUMN IF NOT EXISTS "discountPercent" NUMERIC DEFAULT 0;
ALTER TABLE party_accounts ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

-- 12. CREDIT & DEBIT RETURN NOTES (SALES RETURN & PURCHASE RETURN)
CREATE TABLE IF NOT EXISTS return_notes (
    id TEXT PRIMARY KEY,
    "noteNo" TEXT NOT NULL,
    "noteDate" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'CREDIT_NOTE',
    "referenceNo" TEXT DEFAULT '',
    "partyId" TEXT DEFAULT '',
    "partyName" TEXT NOT NULL DEFAULT 'Walk-in Customer',
    "productId" BIGINT NOT NULL,
    "productName" TEXT NOT NULL,
    "hsnCode" TEXT DEFAULT '',
    quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'KG',
    "baseAmount" NUMERIC NOT NULL DEFAULT 0,
    "gstPercent" NUMERIC NOT NULL DEFAULT 0,
    "cgstAmount" NUMERIC NOT NULL DEFAULT 0,
    "sgstAmount" NUMERIC NOT NULL DEFAULT 0,
    "totalGstAmount" NUMERIC NOT NULL DEFAULT 0,
    "totalAmount" NUMERIC NOT NULL DEFAULT 0,
    "settlementMode" TEXT NOT NULL DEFAULT 'CASH',
    reason TEXT DEFAULT '',
    "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM ADMIN',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE return_notes ADD COLUMN IF NOT EXISTS "referenceNo" TEXT DEFAULT '';

-- 13. FIXED ASSETS REGISTER
CREATE TABLE IF NOT EXISTS fixed_assets (
    id TEXT PRIMARY KEY,
    "assetName" TEXT NOT NULL,
    category TEXT NOT NULL,
    "purchaseDate" TEXT NOT NULL,
    "costValue" NUMERIC NOT NULL DEFAULT 0,
    "depreciationRatePct" NUMERIC NOT NULL DEFAULT 10,
    "accumulatedDepreciation" NUMERIC NOT NULL DEFAULT 0,
    "fundingSource" TEXT DEFAULT 'CAPITAL_OPENING',
    notes TEXT DEFAULT ''
);
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "depreciationRatePct" NUMERIC DEFAULT 10;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "accumulatedDepreciation" NUMERIC DEFAULT 0;
ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS "fundingSource" TEXT DEFAULT 'CAPITAL_OPENING';

-- 14. DAILY CASH DRAWER Z-REPORT CLOSINGS
CREATE TABLE IF NOT EXISTS drawer_closings (
    id TEXT PRIMARY KEY,
    "closingDate" TEXT NOT NULL,
    "closedAt" TEXT NOT NULL,
    "closedBy" TEXT NOT NULL DEFAULT 'Cashier',
    "openingFloat" NUMERIC NOT NULL DEFAULT 0,
    "cashSalesTotal" NUMERIC NOT NULL DEFAULT 0,
    "upiSalesTotal" NUMERIC NOT NULL DEFAULT 0,
    "cashInflowsTotal" NUMERIC NOT NULL DEFAULT 0,
    "cashOutflowsTotal" NUMERIC NOT NULL DEFAULT 0,
    "expectedCash" NUMERIC NOT NULL DEFAULT 0,
    "physicalCashCounted" NUMERIC NOT NULL DEFAULT 0,
    variance NUMERIC NOT NULL DEFAULT 0,
    denominations JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT DEFAULT ''
);
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "closedBy" TEXT DEFAULT 'Cashier';
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "cashSalesTotal" NUMERIC DEFAULT 0;
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "upiSalesTotal" NUMERIC DEFAULT 0;
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "cashInflowsTotal" NUMERIC DEFAULT 0;
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "cashOutflowsTotal" NUMERIC DEFAULT 0;
ALTER TABLE drawer_closings ADD COLUMN IF NOT EXISTS "physicalCashCounted" NUMERIC DEFAULT 0;

-- Drop legacy authorized_email_members table if it exists
DROP TABLE IF EXISTS authorized_email_members CASCADE;

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS) & POLICIES FOR ALL 14 TABLES
-- ==============================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice Analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loose_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawer_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public products policy" ON products;
CREATE POLICY "Public products policy" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public invoice analytics policy" ON "Invoice Analytics";
CREATE POLICY "Public invoice analytics policy" ON "Invoice Analytics" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public sale transactions policy" ON sale_transactions;
CREATE POLICY "Public sale transactions policy" ON sale_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public cashiers policy" ON cashiers;
CREATE POLICY "Public cashiers policy" ON cashiers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public admin settings policy" ON admin_settings;
CREATE POLICY "Public admin settings policy" ON admin_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public categories policy" ON categories;
CREATE POLICY "Public categories policy" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public audit logs policy" ON audit_logs;
CREATE POLICY "Public audit logs policy" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public loose packets policy" ON loose_packets;
CREATE POLICY "Public loose packets policy" ON loose_packets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public purchase transactions policy" ON purchase_transactions;
CREATE POLICY "Public purchase transactions policy" ON purchase_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public gst payments policy" ON gst_payments;
CREATE POLICY "Public gst payments policy" ON gst_payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public account vouchers policy" ON account_vouchers;
CREATE POLICY "Public account vouchers policy" ON account_vouchers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public party accounts policy" ON party_accounts;
CREATE POLICY "Public party accounts policy" ON party_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public return notes policy" ON return_notes;
CREATE POLICY "Public return notes policy" ON return_notes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public fixed assets policy" ON fixed_assets;
CREATE POLICY "Public fixed assets policy" ON fixed_assets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public drawer closings policy" ON drawer_closings;
CREATE POLICY "Public drawer closings policy" ON drawer_closings FOR ALL USING (true) WITH CHECK (true);

-- Reload Supabase Schema Cache
NOTIFY pgrst, 'reload schema';
