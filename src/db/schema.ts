import { mysqlTable, serial, varchar, decimal, text, boolean, timestamp, int, datetime } from 'drizzle-orm/mysql-core';

export const products = mysqlTable('products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  barcode: varchar('barcode', { length: 50 }).notNull().unique(),
  unit: varchar('unit', { length: 20 }).notNull(),
  sellingPrice: decimal('selling_price', { precision: 12, scale: 2 }).notNull(),
  costPrice: decimal('cost_price', { precision: 12, scale: 2 }).notNull(),
  stock: decimal('stock', { precision: 12, scale: 3 }).notNull(),
  minStockLevel: decimal('min_stock_level', { precision: 12, scale: 3 }).notNull(),
  batchNo: varchar('batch_no', { length: 50 }),
  expiryDate: varchar('expiry_date', { length: 50 }),
  image: text('image'),
  description: text('description'),
  featured: boolean('featured').default(false),
});

export const ledger = mysqlTable('ledger', {
  saleItemId: serial('sale_item_id').primaryKey(),
  saleId: int('sale_id').notNull(),
  invoiceNo: varchar('invoice_no', { length: 50 }).notNull(),
  saleDate: varchar('sale_date', { length: 50 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  paymentMode: varchar('payment_mode', { length: 20 }).notNull(),
  productId: int('product_id').notNull(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  barcode: varchar('barcode', { length: 50 }).notNull(),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  unitType: varchar('unit_type', { length: 20 }).notNull(),
  sellingPrice: decimal('selling_price', { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
  cashierName: varchar('cashier_name', { length: 255 }).notNull(),
});

export const cashiers = mysqlTable('cashiers', {
  id: varchar('id', { length: 50 }).primaryKey(),
  loginId: varchar('login_id', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  staffCode: varchar('staff_code', { length: 50 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  assignedCounter: varchar('assigned_counter', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: varchar('created_at', { length: 50 }),
});

export const adminSettings = mysqlTable('admin_settings', {
  id: int('id').primaryKey().default(1),
  transactionsEnabled: boolean('transactions_enabled').default(true),
  upiPaymentsEnabled: boolean('upi_payments_enabled').default(true),
  cashPaymentsEnabled: boolean('cash_payments_enabled').default(true),
  memberDiscountPercent: int('member_discount_percent').default(0),
  emergencyNotice: text('emergency_notice'),
  haltReason: text('halt_reason'),
});

export const auditLogs = mysqlTable('audit_logs', {
  id: varchar('id', { length: 50 }).primaryKey(),
  timestamp: varchar('timestamp', { length: 50 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  performedBy: varchar('performed_by', { length: 255 }).notNull(),
  details: text('details'),
});
