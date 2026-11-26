-- ==============================================================================
-- Nabkul Cooperative Society - SUPABASE DATABASE SCHEMA
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR
-- ==============================================================================

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    barcode TEXT UNIQUE,
    unit TEXT NOT NULL,
    "sellingPrice" NUMERIC NOT NULL DEFAULT 0,
    "costPrice" NUMERIC NOT NULL DEFAULT 0,
    stock NUMERIC NOT NULL DEFAULT 0,
    "minStockLevel" NUMERIC NOT NULL DEFAULT 0,
    "batchNo" TEXT,
    "expiryDate" TEXT,
    image TEXT,
    description TEXT,
    featured BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "sellingPriceWD" NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "gstPercent" NUMERIC DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS "sellingPriceWithGst" NUMERIC DEFAULT 0;

-- Set default 5% GST (CGST 2.5%, SGST 2.5%) for all older products where GST is currently 0 or null:
UPDATE products 
SET "gstPercent" = 5 
WHERE "gstPercent" IS NULL OR "gstPercent" = 0;

-- Recalculate Selling Price-WT GST for older products:
UPDATE products 
SET 
  "sellingPriceWD" = CASE WHEN "sellingPriceWD" IS NULL OR "sellingPriceWD" = 0 THEN "sellingPrice" ELSE "sellingPriceWD" END,
  "sellingPriceWithGst" = (CASE WHEN "sellingPriceWD" IS NULL OR "sellingPriceWD" = 0 THEN "sellingPrice" ELSE "sellingPriceWD" END) + (("costPrice" * "gstPercent") / 100),
  "sellingPrice" = (CASE WHEN "sellingPriceWD" IS NULL OR "sellingPriceWD" = 0 THEN "sellingPrice" ELSE "sellingPriceWD" END) + (("costPrice" * "gstPercent") / 100)
WHERE "gstPercent" IS NOT NULL AND "gstPercent" > 0;

-- 2. INVOICE ANALYTICS TABLE (EXACTLY 1 ROW PER INVOICE / TRANSACTION)
-- If the table already exists, this safe block adds any missing columns without dropping data:
CREATE TABLE IF NOT EXISTS "Invoice Analytics" (
    id BIGSERIAL PRIMARY KEY,
    "saleId" BIGINT NOT NULL,
    "invoiceNo" TEXT UNIQUE NOT NULL,
    "saleDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL DEFAULT 'Walk-in Customer',
    "paymentMode" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL DEFAULT 'Society Administrator',
    "totalAmount" NUMERIC NOT NULL DEFAULT 0,
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
    "upiTxnRef" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE "Invoice Analytics" DISABLE ROW LEVEL SECURITY;

-- Migration lines for existing table (run this to update schema instantly):
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
ALTER TABLE "Invoice Analytics" ADD COLUMN IF NOT EXISTS "upiTxnRef" TEXT;

-- Reload Supabase Schema Cache
NOTIFY pgrst, 'reload schema';

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
ALTER TABLE cashiers DISABLE ROW LEVEL SECURITY;

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
ALTER TABLE admin_settings DISABLE ROW LEVEL SECURITY;

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

-- 6. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    details TEXT
);
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

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
ALTER TABLE loose_packets DISABLE ROW LEVEL SECURITY;

-- 8. INITIAL SEED DATA
INSERT INTO admin_settings (id, "transactionsEnabled", "upiPaymentsEnabled", "cashPaymentsEnabled", "memberDiscountPercent")
VALUES (1, TRUE, TRUE, TRUE, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (name) VALUES 
('Grocery'), ('Beverages'), ('Snacks'), ('Dairy'), ('Personal Care'), ('Household')
ON CONFLICT (name) DO NOTHING;

INSERT INTO cashiers (id, "loginId", "passwordHash", name, "staffCode", role, "assignedCounter", "isActive", "createdAt")
VALUES ('1', 'admin', 'admin123', 'Super Admin', 'STAFF001', 'ADMIN', 'COUNTER-01', TRUE, '2024-01-01')
ON CONFLICT ("loginId") DO NOTHING;
