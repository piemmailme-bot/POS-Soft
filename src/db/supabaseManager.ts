import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  INITIAL_PRODUCTS,
  INITIAL_LEDGER,
  INITIAL_CASHIERS,
  INITIAL_ADMIN_SETTINGS,
  INITIAL_AUDIT_LOGS,
  CATEGORIES,
} from '../data/initialData.ts';
import type {
  Product,
  SaleTransactionItem,
  CashierUser,
  AdminStoreSettings,
  AdminAuditLog,
  LoosePacket,
  TransactionControlMode,
  PurchaseTransaction,
  PurchaseEntryType,
  GstGovtPayment,
  AccountLedgerVoucher,
  PartyAccount,
  ReturnNote,
  FixedAsset,
  DailyDrawerClosing,
} from '../types.ts';

import { getIstDateStr, getIstTimeStr, getIstDateTimeStr } from '../utils/dateUtils.ts';

dotenv.config();

const TOKEN_SECRET =
  process.env.SESSION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'deganga-cadpfscs-supabase-direct-session-secret-v1';
const DEFAULT_DEVELOPER_EMAIL = (process.env.DEVELOPER_EMAIL || 'piemmailme@gmail.com')
  .trim()
  .toLowerCase();

export const STRICT_ALLOWED_VIEWER_EMAILS: readonly string[] = [
  'piemmailme@gmail.com',
  'cadpfscsltd@gmail.com',
];

export const UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE =
  'Sorry You are Not Authorised to open This, please connect with 7602496460.';

export function normalizeEmailAddress(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function isStrictlyAllowedViewerEmail(email?: string | null): boolean {
  const normalized = normalizeEmailAddress(email);
  if (!normalized) return false;
  return STRICT_ALLOWED_VIEWER_EMAILS.includes(normalized);
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(12).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    try {
      const derived = crypto.scryptSync(plain, salt, 32);
      const expected = Buffer.from(hashHex, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  return stored === plain;
}

export function sanitizeCashierForClient(c: CashierUser): CashierUser {
  return {
    ...c,
    passwordHash: '********',
  };
}

export function createSessionToken(
  c: CashierUser,
  extra?: { email?: string; isDeveloper?: boolean }
): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: c.id,
      loginId: c.loginId,
      role: c.role,
      name: c.name,
      staffCode: c.staffCode,
      email: normalizeEmailAddress(extra?.email || c.email),
      isDeveloper: Boolean(extra?.isDeveloper ?? c.isDeveloper ?? c.role === 'Developer'),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token?: string | null
): {
  id: string;
  loginId: string;
  role: CashierUser['role'];
  name: string;
  staffCode: string;
  email: string;
  isDeveloper: boolean;
} | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded || (decoded.exp && Date.now() > decoded.exp)) return null;
    return {
      ...decoded,
      email: normalizeEmailAddress(decoded.email),
      isDeveloper: Boolean(decoded.isDeveloper),
    };
  } catch {
    return null;
  }
}

// Core credentials from environment (strictly no local config files)
let activeUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
let activeKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

let supabase: SupabaseClient | null = null;

export const supabaseStatus = {
  configured: Boolean(activeUrl && activeKey),
  connected: false,
  message: 'Supabase initialization pending...',
};

// Direct Supabase state mirror (no temporary or local files written to disk)
const memoryStore = {
  products: [] as Product[],
  ledger: [] as SaleTransactionItem[],
  cashiers: [...INITIAL_CASHIERS],
  settings: { ...INITIAL_ADMIN_SETTINGS },
  categories: [...CATEGORIES],
  auditLogs: [] as AdminAuditLog[],
  loosePackets: [] as LoosePacket[],
  purchaseTransactions: [] as PurchaseTransaction[],
  gstPayments: [] as GstGovtPayment[],
  accountVouchers: [] as AccountLedgerVoucher[],
  partyAccounts: [] as PartyAccount[],
  returnNotes: [] as ReturnNote[],
  fixedAssets: [] as FixedAsset[],
  drawerClosings: [] as DailyDrawerClosing[],
};

export function saveStoreToDisk() {
  // Intentionally disabled: All data is saved exclusively to Supabase tables.
}

let initInFlight: Promise<boolean> | null = null;
let lastReconnectAttemptAt = 0;

async function runInitSupabase(): Promise<boolean> {
  if (!activeUrl) {
    activeUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  }
  if (!activeKey) {
    activeKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '';
  }
  supabaseStatus.configured = Boolean(activeUrl && activeKey);

  if (!activeUrl || !activeKey) {
    supabaseStatus.connected = false;
    supabaseStatus.message = 'Supabase not configured.';
    return false;
  }

  try {
    supabase = createClient(activeUrl, activeKey, {
      auth: { persistSession: false },
    });

    // Quick parallel health check
    const [{ error: prodError }, { error: invoiceError }] = await Promise.all([
      supabase.from('products').select('id').limit(1),
      supabase.from('Invoice Analytics').select('invoiceNo').limit(1),
    ]);

    if (prodError || invoiceError) {
      const err = prodError || invoiceError;
      if (err?.code === 'PGRST116' || err?.code === '42P01') {
        // Table doesn't exist, but connection is "alive"
        supabaseStatus.connected = true;
        supabaseStatus.message = 'Connected (Tables Missing)';
        return true;
      }
      supabaseStatus.connected = false;
      supabaseStatus.message = `Supabase Error: ${err?.message}`;
      return false;
    }

    supabaseStatus.connected = true;
    supabaseStatus.message = 'Cloud Sync Active';

    // Auto-sync on init
    await refreshLocalMemoryFromSupabase();
    return true;
  } catch (err: any) {
    supabaseStatus.connected = false;
    supabaseStatus.message = err?.message || 'Supabase connection failed';
    return false;
  }
}

export async function initSupabase(): Promise<boolean> {
  if (initInFlight) return initInFlight;
  lastReconnectAttemptAt = Date.now();
  initInFlight = runInitSupabase().finally(() => {
    initInFlight = null;
  });
  return initInFlight;
}

export async function ensureSupabaseReady(timeoutMs = 8000): Promise<boolean> {
  if (supabase && supabaseStatus.connected) return true;
  if (!supabaseStatus.configured) return false;

  const task =
    initInFlight ||
    (Date.now() - lastReconnectAttemptAt > 5000 ? initSupabase() : Promise.resolve(false));

  if (timeoutMs <= 0) return task;

  return Promise.race([
    task,
    new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(supabaseStatus.connected), timeoutMs);
      if (typeof (t as any).unref === 'function') (t as any).unref();
    }),
  ]);
}

export async function validateSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  try {
    const tempClient = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await tempClient.from('products').select('id').limit(1);
    
    if (error) {
      if (error.code === '42P01') { // Relation does not exist
        return { success: true, message: 'Valid credentials, but schema needs to be installed.' };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Connection successful!' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Invalid URL or Key' };
  }
}

export async function saveSupabaseConfig(url: string, key: string): Promise<boolean> {
  try {
    activeUrl = url;
    activeKey = key;
    supabaseStatus.configured = true;
    return await initSupabase();
  } catch (e) {
    console.error('Failed to save Supabase config:', e);
    return false;
  }
}

export async function disconnectSupabase(): Promise<boolean> {
  try {
    supabase = null;
    supabaseStatus.connected = false;
    supabaseStatus.configured = false;
    supabaseStatus.message = 'Cloud Storage disconnected by Administrator.';
    return true;
  } catch (e) {
    return false;
  }
}

let lastHealthPingAt = 0;

export async function verifyLiveSupabaseConnection(options?: {
  reconnect?: boolean;
}): Promise<typeof supabaseStatus> {
  if (options?.reconnect) {
    if (!activeUrl) {
      activeUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    }
    if (!activeKey) {
      activeKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        '';
    }
    supabaseStatus.configured = Boolean(activeUrl && activeKey);
    await initSupabase();
    lastHealthPingAt = Date.now();
    return supabaseStatus;
  }

  const now = Date.now();
  // Auto-heal when disconnected or still initializing after a cold start
  if (!supabaseStatus.connected && supabaseStatus.configured) {
    if (initInFlight) {
      await ensureSupabaseReady(6000);
    } else if (now - lastReconnectAttemptAt > 6000) {
      await initSupabase();
      lastHealthPingAt = Date.now();
    }
    return supabaseStatus;
  }

  if (supabase && supabaseStatus.connected && now - lastHealthPingAt > 12000) {
    lastHealthPingAt = now;
    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
        supabaseStatus.connected = false;
        supabaseStatus.message = `Cloud Storage Error: ${error.message}`;
      }
    } catch (e: any) {
      supabaseStatus.connected = false;
      supabaseStatus.message = e?.message || 'Cloud Storage connection lost.';
    }
  }
  return supabaseStatus;
}

let cachedInvoiceTableMode: 'LINE_ITEM' | 'INVOICE_ROW' | null = null;

async function detectInvoiceTableMode(): Promise<'LINE_ITEM' | 'INVOICE_ROW'> {
  if (cachedInvoiceTableMode) return cachedInvoiceTableMode;
  if (!supabase) return 'LINE_ITEM';

  try {
    const { error: saleItemErr } = await supabase
      .from('Invoice Analytics')
      .select('saleItemId')
      .limit(1);

    if (!saleItemErr) {
      cachedInvoiceTableMode = 'LINE_ITEM';
      return 'LINE_ITEM';
    }

    const { error: idErr } = await supabase
      .from('Invoice Analytics')
      .select('id')
      .limit(1);

    if (!idErr) {
      cachedInvoiceTableMode = 'INVOICE_ROW';
      return 'INVOICE_ROW';
    }
  } catch (e) {
    console.warn('[Supabase Detect Mode]', e);
  }
  return 'LINE_ITEM';
}

function unpackLedgerRows(
  invoiceAnalyticsRows: any[] | null | undefined,
  saleTransactionRows: any[] | null | undefined
): SaleTransactionItem[] {
  const expanded: SaleTransactionItem[] = [];
  const usedIds = new Set<number>();
  const seenInvoiceDates = new Set<string>();

  const allocateUniqueId = (preferred: number): number => {
    let candidate = Number.isFinite(preferred) && preferred > 0 ? preferred : 1;
    while (usedIds.has(candidate)) {
      candidate += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };

  if (Array.isArray(invoiceAnalyticsRows)) {
    invoiceAnalyticsRows.forEach((r: any) => {
      const invKey = `${r.invoiceNo || ''}|${r.saleDate || ''}`;
      if (r.invoiceNo) seenInvoiceDates.add(invKey);

      if (Array.isArray(r.itemsDetail) && r.itemsDetail.length > 0) {
        r.itemsDetail.forEach((it: any, idx: number) => {
          const parsedGst = it.gstPercent !== null && it.gstPercent !== undefined ? Number(it.gstPercent) : NaN;
          const gstPct = Number.isFinite(parsedGst) && parsedGst >= 0 ? parsedGst : 5;
          const purchaseCost = Number(it.purchasePrice || it.costPrice || 0);
          const unitGst = (purchaseCost * gstPct) / 100;
          const lineGst =
            it.totalGstAmount !== undefined
              ? Number(it.totalGstAmount)
              : unitGst * Number(it.quantity || 1);
          const lineCgst = it.cgstAmount !== undefined ? Number(it.cgstAmount) : lineGst / 2;
          const lineSgst = it.sgstAmount !== undefined ? Number(it.sgstAmount) : lineGst / 2;
          const basePrice =
            it.sellingPriceWD !== undefined
              ? Number(it.sellingPriceWD)
              : Math.max(0, Number(it.sellingPrice) - unitGst);
          const lineBase =
            it.baseAmount !== undefined ? Number(it.baseAmount) : basePrice * Number(it.quantity || 1);

          const rawId = Number((r.id || r.saleItemId || 1) * 1000 + idx);
          expanded.push({
            saleItemId: allocateUniqueId(rawId),
            saleId: Number(r.saleId || r.id || 1),
            invoiceNo: r.invoiceNo,
            saleDate: r.saleDate,
            customerId: r.customerId || undefined,
            customerName: r.customerName || 'Walk-in Customer',
            buyerGstin: r.buyerGstin || undefined,
            paymentMode: (r.paymentMode || 'CASH').toUpperCase() as any,
            cashierName: r.cashierName || 'Society Administrator',
            productId: Number(it.productId || 0),
            productName: String(it.productName || 'General Item'),
            barcode: String(it.barcode || ''),
            hsnCode: String(it.hsnCode || ''),
            quantity: Number(it.quantity || 1),
            unitType: it.unitType || 'PCS',
            sellingPrice: Number(it.sellingPrice || 0),
            lineTotal: Number(it.lineTotal || 0),
            costPrice: purchaseCost,
            sellingPriceWD: basePrice,
            gstPercent: gstPct,
            cgstPercent: gstPct / 2,
            sgstPercent: gstPct / 2,
            cgstAmount: Number(lineCgst.toFixed(2)),
            sgstAmount: Number(lineSgst.toFixed(2)),
            totalGstAmount: Number(lineGst.toFixed(2)),
            baseAmount: Number(lineBase.toFixed(2)),
            barcodeMode:
              it.barcodeMode ||
              (it.packetBarcode
                ? 'WITH_BARCODE'
                : it.saleType === 'DIRECT_LOOSE'
                ? 'WITHOUT_BARCODE'
                : 'WITH_BARCODE'),
            saleType:
              it.saleType ||
              (it.barcodeMode === 'WITHOUT_BARCODE' ? 'DIRECT_LOOSE' : 'BARCODE'),
            measuredWeightText: it.measuredWeightText || '',
            packetBarcode: it.packetBarcode || '',
            tenderedCash: r.tenderedCash !== undefined ? Number(r.tenderedCash) : undefined,
            changeDue: r.changeDue !== undefined ? Number(r.changeDue) : undefined,
            upiTxnRef: r.upiTxnRef || undefined,
            cashPaid: r.cashPaid !== undefined ? Number(r.cashPaid) : undefined,
            upiPaid: r.upiPaid !== undefined ? Number(r.upiPaid) : undefined,
            creditDue: r.creditDue !== undefined ? Number(r.creditDue) : undefined,
            memberDiscount:
              it.memberDiscount !== undefined
                ? Number(it.memberDiscount)
                : idx === 0 && r.memberDiscount !== undefined
                ? Number(r.memberDiscount)
                : undefined,
          });
        });
      } else {
        const totGst = r.totalGst !== undefined ? Number(r.totalGst) : 0;
        const rawId = Number(r.saleItemId || r.id || 1);
        expanded.push({
          saleItemId: allocateUniqueId(rawId),
          saleId: Number(r.saleId || r.id || 1),
          invoiceNo: r.invoiceNo,
          saleDate: r.saleDate,
          customerId: r.customerId || undefined,
          customerName: r.customerName || 'Walk-in Customer',
          buyerGstin: r.buyerGstin || undefined,
          paymentMode: (r.paymentMode || 'CASH').toUpperCase() as any,
          cashierName: r.cashierName || 'Society Administrator',
          productId: Number(r.productId || 0),
          productName: String(r.productName || r.productsSummary || 'Sale Transaction'),
          barcode: String(r.barcode || ''),
          hsnCode: String(r.hsnCode || ''),
          quantity: Number(r.quantity || r.totalProducts || 1),
          unitType: (r.unitType || 'PCS') as any,
          sellingPrice: Number(r.sellingPrice || r.totalAmount || 0),
          lineTotal: Number(r.lineTotal || r.totalAmount || 0),
          totalGstAmount: totGst,
          cgstAmount: r.cgstAmount !== undefined ? Number(r.cgstAmount) : totGst / 2,
          sgstAmount: r.sgstAmount !== undefined ? Number(r.sgstAmount) : totGst / 2,
          baseAmount:
            r.baseAmount !== undefined && Number(r.baseAmount) > 0
              ? Number(r.baseAmount)
              : Math.max(0, Number(r.lineTotal || r.totalAmount || 0) - totGst),
          tenderedCash: r.tenderedCash !== undefined ? Number(r.tenderedCash) : undefined,
          changeDue: r.changeDue !== undefined ? Number(r.changeDue) : undefined,
          upiTxnRef: r.upiTxnRef || undefined,
          cashPaid: r.cashPaid !== undefined ? Number(r.cashPaid) : undefined,
          upiPaid: r.upiPaid !== undefined ? Number(r.upiPaid) : undefined,
          creditDue: r.creditDue !== undefined ? Number(r.creditDue) : undefined,
          memberDiscount: r.memberDiscount !== undefined ? Number(r.memberDiscount) : undefined,
          barcodeMode:
            r.saleModeSummary === 'WITHOUT_BARCODE' || r.barcode === 'WITHOUT_BARCODE'
              ? 'WITHOUT_BARCODE'
              : 'WITH_BARCODE',
          saleType:
            r.saleModeSummary === 'WITHOUT_BARCODE' || r.barcode === 'WITHOUT_BARCODE'
              ? 'DIRECT_LOOSE'
              : 'BARCODE',
        });
      }
    });
  }

  if (Array.isArray(saleTransactionRows)) {
    saleTransactionRows.forEach((r: any) => {
      const invKey = `${r.invoiceNo || ''}|${r.saleDate || ''}`;
      if (r.invoiceNo && seenInvoiceDates.has(invKey)) return;
      const rawId = Number(r.saleItemId || r.id || 1);
      expanded.push({
        saleItemId: allocateUniqueId(usedIds.has(rawId) ? 100000 + rawId : rawId),
        saleId: Number(r.saleId || r.id || 1),
        invoiceNo: r.invoiceNo,
        saleDate: r.saleDate,
        customerId: r.customerId || undefined,
        customerName: r.customerName || 'Walk-in Customer',
        buyerGstin: r.buyerGstin || undefined,
        paymentMode: (r.paymentMode || 'CASH').toUpperCase() as any,
        cashierName: r.cashierName || 'Society Administrator',
        productId: Number(r.productId || 0),
        productName: String(r.productName || 'General Item'),
        barcode: String(r.barcode || ''),
        hsnCode: String(r.hsnCode || ''),
        quantity: Number(r.quantity || 1),
        unitType: (r.unitType || 'PCS') as any,
        sellingPrice: Number(r.sellingPrice || 0),
        lineTotal: Number(r.lineTotal || 0),
        cashPaid: r.cashPaid !== undefined ? Number(r.cashPaid) : undefined,
        upiPaid: r.upiPaid !== undefined ? Number(r.upiPaid) : undefined,
        creditDue: r.creditDue !== undefined ? Number(r.creditDue) : undefined,
        memberDiscount: r.memberDiscount !== undefined ? Number(r.memberDiscount) : undefined,
        barcodeMode: r.barcode === 'WITHOUT_BARCODE' ? 'WITHOUT_BARCODE' : 'WITH_BARCODE',
        saleType: r.barcode === 'WITHOUT_BARCODE' ? 'DIRECT_LOOSE' : 'BARCODE',
      });
    });
  }

  return expanded.sort((a, b) => {
    const dateCmp = String(b.saleDate || '').localeCompare(String(a.saleDate || ''));
    if (dateCmp !== 0) return dateCmp;
    return Number(b.saleItemId || 0) - Number(a.saleItemId || 0);
  });
}

async function fetchCloudLedgerRows(): Promise<{
  invoiceRows: any[];
  saleTxRows: any[];
  hadCloudSuccess: boolean;
}> {
  if (!supabase || !supabaseStatus.connected) {
    return { invoiceRows: [], saleTxRows: [], hadCloudSuccess: false };
  }

  const [invRes, txRes] = await Promise.all([
    supabase.from('Invoice Analytics').select('*'),
    supabase.from('sale_transactions').select('*'),
  ]);

  if (invRes.error) {
    console.error('[Supabase Error] Invoice Analytics select:', invRes.error.message);
  }
  if (txRes.error && txRes.error.code !== '42P01') {
    console.warn('[Supabase Notice] sale_transactions select:', txRes.error.message);
  }

  const invoiceRows = !invRes.error && Array.isArray(invRes.data) ? invRes.data : [];
  const saleTxRows = !txRes.error && Array.isArray(txRes.data) ? txRes.data : [];
  return {
    invoiceRows,
    saleTxRows,
    hadCloudSuccess: !invRes.error || !txRes.error,
  };
}

function parseInvoiceDiscountFromAuditDetails(
  details?: string
): { invoiceNo: string; saleDate?: string; discount: number } | null {
  if (!details) return null;
  const marker = '[INVOICE_DISCOUNT_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(details.slice(jsonStart, end + 1));
    const discount = Number(parsed?.discount || 0);
    if (!parsed?.invoiceNo || !Number.isFinite(discount) || discount <= 0) return null;
    return {
      invoiceNo: String(parsed.invoiceNo),
      saleDate: parsed.saleDate ? String(parsed.saleDate) : undefined,
      discount,
    };
  } catch {
    return null;
  }
}

function buildPriorDiscountMap(rows: SaleTransactionItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const invNo = String(row.invoiceNo || '');
    const disc = Number(row.memberDiscount || 0);
    if (invNo && disc > 0) {
      map.set(invNo, Number(((map.get(invNo) || 0) + disc).toFixed(2)));
    }
  }
  return map;
}

function applyRestoredInvoiceDiscounts(
  unpacked: SaleTransactionItem[],
  priorMap: Map<string, number>,
  ...logSources: Array<any[] | null | undefined>
): SaleTransactionItem[] {
  const restoredDiscountByInvoice = new Map<string, number>(priorMap);
  for (const logs of logSources) {
    if (!Array.isArray(logs)) continue;
    for (const log of logs) {
      if (log?.action === 'INVOICE_DISCOUNT_SYNC') {
        const parsed = parseInvoiceDiscountFromAuditDetails(log.details);
        if (parsed && parsed.discount > 0 && !restoredDiscountByInvoice.has(parsed.invoiceNo)) {
          restoredDiscountByInvoice.set(parsed.invoiceNo, parsed.discount);
        }
      }
    }
  }

  const existingCloudDiscounts = new Map<string, number>();
  for (const row of unpacked) {
    const invNo = String(row.invoiceNo || '');
    const disc = Number(row.memberDiscount || 0);
    if (invNo && disc > 0) {
      existingCloudDiscounts.set(invNo, (existingCloudDiscounts.get(invNo) || 0) + disc);
    }
  }

  const restoredApplied = new Set<string>();
  for (const row of unpacked) {
    const invNo = String(row.invoiceNo || '');
    if (!invNo || restoredApplied.has(invNo)) continue;
    if ((existingCloudDiscounts.get(invNo) || 0) <= 0) {
      const savedDisc = restoredDiscountByInvoice.get(invNo);
      if (savedDisc && savedDisc > 0) {
        row.memberDiscount = savedDisc;
        restoredApplied.add(invNo);
      }
    }
  }
  return unpacked;
}

export async function refreshLocalMemoryFromSupabase(): Promise<void> {
  if (!supabase || !supabaseStatus.connected) return;

  const priorDiscountByInvoice = buildPriorDiscountMap(memoryStore.ledger);

  try {
    const [p, cloudLedger, c, s, cat, al, lp, discAuditRes] = await Promise.all([
      supabase.from('products').select('*').order('id', { ascending: true }),
      fetchCloudLedgerRows(),
      supabase.from('cashiers').select('*'),
      supabase.from('admin_settings').select('*').eq('id', 1).single(),
      supabase.from('categories').select('name'),
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(100),
      supabase.from('loose_packets').select('*').order('createdAt', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'INVOICE_DISCOUNT_SYNC')
        .order('timestamp', { ascending: false })
        .limit(500),
    ]);

    // Proactively remove legacy registered email members table rows & developer row from Supabase
    await supabase.from('authorized_email_members').delete().neq('id', '').then(() => null, () => null);
    await supabase.from('cashiers').delete().eq('role', 'Developer').then(() => null, () => null);

    if (!p.error && Array.isArray(p.data)) {
      memoryStore.products = p.data.map(r => {
        const gstPct = (r.gstPercent !== null && r.gstPercent !== undefined && Number.isFinite(Number(r.gstPercent))) ? Number(r.gstPercent) : 5;
        const cost = Number(r.costPrice || 0);
        const basePrice = r.sellingPriceWD !== null && r.sellingPriceWD !== undefined && Number(r.sellingPriceWD) > 0 ? Number(r.sellingPriceWD) : Number(r.sellingPrice || 0);
        const gstAmount = (cost * gstPct) / 100;
        const sellingWithGst = (r.sellingPriceWithGst !== null && r.sellingPriceWithGst !== undefined) ? Number(r.sellingPriceWithGst) : (basePrice + gstAmount);
        return {
          ...r,
          id: Number(r.id),
          hsnCode: r.hsnCode || '',
          gstPercent: gstPct,
          costPrice: cost,
          sellingPriceWD: basePrice,
          sellingPriceWithGst: sellingWithGst,
          sellingPrice: sellingWithGst > 0 ? sellingWithGst : Number(r.sellingPrice || 0),
          stock: Number(r.stock),
          minStockLevel: Number(r.minStockLevel),
        };
      });
    }

    const localDiscountLogs = memoryStore.auditLogs.filter(
      (l) => l?.action === 'INVOICE_DISCOUNT_SYNC'
    );

    if (cloudLedger.hadCloudSuccess) {
      const unpacked = unpackLedgerRows(cloudLedger.invoiceRows, cloudLedger.saleTxRows);
      memoryStore.ledger = applyRestoredInvoiceDiscounts(
        unpacked,
        priorDiscountByInvoice,
        memoryStore.auditLogs,
        !discAuditRes.error ? discAuditRes.data : null,
        !al.error ? al.data : null
      );
    }
    if (!c.error && Array.isArray(c.data) && c.data.length > 0) {
      memoryStore.cashiers = c.data.filter((row: any) => row?.role !== 'Developer');
    }
    if (s.data) memoryStore.settings = deserializeAdminSettingsFromDb(s.data);
    if (!cat.error && Array.isArray(cat.data)) memoryStore.categories = cat.data.map(r => r.name);
    if (!al.error && Array.isArray(al.data)) {
      const mergedAuditMap = new Map<string, AdminAuditLog>();
      for (const row of al.data) {
        if (row?.id) mergedAuditMap.set(String(row.id), row);
      }
      if (!discAuditRes.error && Array.isArray(discAuditRes.data)) {
        for (const row of discAuditRes.data) {
          if (row?.id && !mergedAuditMap.has(String(row.id))) {
            mergedAuditMap.set(String(row.id), row);
          }
        }
      }
      for (const row of localDiscountLogs) {
        if (row?.id && !mergedAuditMap.has(String(row.id))) {
          mergedAuditMap.set(String(row.id), row);
        }
      }

      // Backfill any invoice discounts present in memoryStore.ledger that lack a cloud INVOICE_DISCOUNT_SYNC record
      const cloudDiscountInvSet = new Set<string>();
      if (!discAuditRes.error && Array.isArray(discAuditRes.data)) {
        for (const row of discAuditRes.data) {
          const parsed = parseInvoiceDiscountFromAuditDetails(row?.details);
          if (parsed?.invoiceNo) cloudDiscountInvSet.add(parsed.invoiceNo);
        }
      }
      const ledgerDiscTotals = buildPriorDiscountMap(memoryStore.ledger);
      const ledgerDateByInv = new Map<string, { saleDate: string; cashierName: string }>();
      for (const row of memoryStore.ledger) {
        if (row.invoiceNo && !ledgerDateByInv.has(row.invoiceNo)) {
          ledgerDateByInv.set(row.invoiceNo, {
            saleDate: String(row.saleDate || getIstDateTimeStr()),
            cashierName: String(row.cashierName || 'Society Administrator'),
          });
        }
      }
      const logsToBackfill: AdminAuditLog[] = [];
      for (const [invNo, disc] of ledgerDiscTotals.entries()) {
        if (disc > 0 && !cloudDiscountInvSet.has(invNo)) {
          const safeInvId = invNo.replace(/[^a-zA-Z0-9_-]/g, '_');
          const logId = `inv-disc-${safeInvId}`;
          const meta = ledgerDateByInv.get(invNo);
          const existingLocal = mergedAuditMap.get(logId);
          const backfillLog: AdminAuditLog = existingLocal || {
            id: logId,
            timestamp: meta?.saleDate || getIstDateTimeStr(),
            action: 'INVOICE_DISCOUNT_SYNC',
            performedBy: meta?.cashierName || 'Society Administrator',
            details: `[INVOICE_DISCOUNT_TX:${JSON.stringify({
              invoiceNo: invNo,
              saleDate: meta?.saleDate || '',
              discount: Number(disc.toFixed(2)),
            })}] Bill Discount Allowed ₹${disc.toFixed(2)} on ${invNo}`,
          };
          mergedAuditMap.set(logId, backfillLog);
          logsToBackfill.push(backfillLog);
        }
      }
      if (logsToBackfill.length > 0) {
        try {
          await supabase.from('audit_logs').upsert(logsToBackfill);
        } catch (err) {
          console.warn('[Supabase Notice] backfill discount audit logs:', err);
        }
      }

      memoryStore.auditLogs = Array.from(mergedAuditMap.values()).sort((a, b) =>
        String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
      );
    }
    if (!lp.error && Array.isArray(lp.data)) memoryStore.loosePackets = lp.data.map(r => ({
      ...r,
      productId: Number(r.productId),
      measuredGramsOrMl: Number(r.measuredGramsOrMl),
      quantityInBaseUnit: Number(r.quantityInBaseUnit),
      unitPrice: Number(r.unitPrice),
      calculatedPrice: Number(r.calculatedPrice)
    }));

    // Load and synchronize all 7 extended accounting tables directly with Supabase
    const [purchases, gstPays, vouchers, parties, returns, assets, closings] = await Promise.all([
      getAllPurchaseTransactions(),
      getAllGstPayments(),
      getAllAccountVouchers(),
      getAllPartyAccounts(),
      getAllReturnNotes(),
      getAllFixedAssets(),
      getAllDrawerClosings(),
    ]);

    if (purchases.length > 0) {
      await supabase
        .from('purchase_transactions')
        .upsert(purchases.map(serializePurchaseTxForSupabase))
        .then(() => null, () => null);
    }
    if (gstPays.length > 0) {
      await supabase
        .from('gst_payments')
        .upsert(gstPays.map(serializeGstPaymentForSupabase))
        .then(() => null, () => null);
    }
    if (vouchers.length > 0) {
      await supabase
        .from('account_vouchers')
        .upsert(vouchers.map(serializeAccountVoucherForSupabase))
        .then(() => null, () => null);
    }
    if (parties.length > 0) {
      await supabase
        .from('party_accounts')
        .upsert(parties.map(serializePartyAccountForSupabase))
        .then(() => null, () => null);
    }
    if (returns.length > 0) {
      await supabase
        .from('return_notes')
        .upsert(returns.map(serializeReturnNoteForSupabase))
        .then(() => null, () => null);
    }
    if (assets.length > 0) {
      await supabase
        .from('fixed_assets')
        .upsert(assets.map(serializeFixedAssetForSupabase))
        .then(() => null, () => null);
    }
    if (closings.length > 0) {
      await supabase
        .from('drawer_closings')
        .upsert(closings.map(serializeDrawerClosingForSupabase))
        .then(() => null, () => null);
    }

    console.log(`[Supabase Sync] Direct cloud tables refreshed (${memoryStore.ledger.length} ledger items, ${memoryStore.products.length} products)`);
  } catch (e) {
    console.error('[Supabase Sync Error]', e);
  }
}

export async function syncStoreToSupabase(): Promise<{ success: boolean; message: string }> {
  if (!supabase || !supabaseStatus.connected) {
    return { success: false, message: 'Database not connected' };
  }

  try {
    // 1. Products
    if (memoryStore.products.length > 0) {
      await supabase.from('products').upsert(memoryStore.products.map(p => ({
        ...p,
        id: p.id
      })));
    }

    // 2. Sync any invoices in memoryStore.ledger not yet in Supabase
    if (memoryStore.ledger.length > 0) {
      const grouped = new Map<string, SaleTransactionItem[]>();
      memoryStore.ledger.forEach((item) => {
        if (!item.invoiceNo) return;
        const key = `${item.invoiceNo}|${item.saleDate || ''}`;
        const list = grouped.get(key) || [];
        list.push(item);
        grouped.set(key, list);
      });

      for (const items of grouped.values()) {
        await addLedgerItems({ items });
      }
    }

    // 3. Cashiers
    if (memoryStore.cashiers.length > 0) {
      await supabase.from('cashiers').upsert(memoryStore.cashiers);
    }

    // 4. Settings
    await supabase.from('admin_settings').upsert(serializeAdminSettingsForDb(memoryStore.settings));

    // 5. Categories
    if (memoryStore.categories.length > 0) {
      await supabase.from('categories').upsert(memoryStore.categories.map(name => ({ name })));
    }

    // 6. Audit Logs
    if (memoryStore.auditLogs.length > 0) {
      await supabase.from('audit_logs').upsert(memoryStore.auditLogs);
    }

    // 7. Loose Packets
    if (memoryStore.loosePackets.length > 0) {
      await supabase.from('loose_packets').upsert(memoryStore.loosePackets);
    }

    // 8. Extended accounting tables
    if (memoryStore.purchaseTransactions.length > 0) {
      await supabase
        .from('purchase_transactions')
        .upsert(memoryStore.purchaseTransactions.map(serializePurchaseTxForSupabase));
    }
    if (memoryStore.gstPayments.length > 0) {
      await supabase
        .from('gst_payments')
        .upsert(memoryStore.gstPayments.map(serializeGstPaymentForSupabase));
    }
    if (memoryStore.accountVouchers.length > 0) {
      await supabase
        .from('account_vouchers')
        .upsert(memoryStore.accountVouchers.map(serializeAccountVoucherForSupabase));
    }
    if (memoryStore.partyAccounts.length > 0) {
      await supabase
        .from('party_accounts')
        .upsert(memoryStore.partyAccounts.map(serializePartyAccountForSupabase));
    }
    if (memoryStore.returnNotes.length > 0) {
      await supabase
        .from('return_notes')
        .upsert(memoryStore.returnNotes.map(serializeReturnNoteForSupabase));
    }
    if (memoryStore.fixedAssets.length > 0) {
      await supabase
        .from('fixed_assets')
        .upsert(memoryStore.fixedAssets.map(serializeFixedAssetForSupabase));
    }
    if (memoryStore.drawerClosings.length > 0) {
      await supabase
        .from('drawer_closings')
        .upsert(memoryStore.drawerClosings.map(serializeDrawerClosingForSupabase));
    }

    return { success: true, message: 'All data synchronized to Supabase' };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export function getSupabaseStatus() {
  return supabaseStatus;
}

export async function diagnoseSupabase() {
  if (!supabase) return { connected: false, error: 'Supabase client not initialized' };
  const results: Record<string, any> = {};
  const tables = ['products', 'Invoice Analytics', 'sale_transactions', 'cashiers', 'admin_settings', 'categories', 'audit_logs', 'loose_packets'];
  for (const t of tables) {
    try {
      const { data, error, count } = await supabase.from(t).select('*', { count: 'exact' }).limit(20);
      const dates = Array.isArray(data)
        ? data.map((r: any) => r.saleDate || r.timestamp || r.createdAt).filter(Boolean).sort().reverse()
        : [];
      results[t] = {
        ok: !error,
        count,
        error: error ? { code: error.code, message: error.message } : null,
        latestDate: dates[0] || null,
      };
    } catch (e: any) {
      results[t] = { ok: false, exception: e.message };
    }
  }
  return { status: supabaseStatus, tables: results };
}

// ==========================================
// DATA ACCESS LAYER: PRODUCTS
// ==========================================
export async function getAllProducts(): Promise<Product[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true });
      if (!error && Array.isArray(data)) {
        memoryStore.products = data.map((r: any) => {
          const gstPct = (r.gstPercent !== null && r.gstPercent !== undefined && Number.isFinite(Number(r.gstPercent))) ? Number(r.gstPercent) : 5;
          const cost = Number(r.costPrice || 0);
          const basePrice = r.sellingPriceWD !== null && r.sellingPriceWD !== undefined && Number(r.sellingPriceWD) > 0 ? Number(r.sellingPriceWD) : Number(r.sellingPrice || 0);
          const gstAmount = (cost * gstPct) / 100;
          const sellingWithGst = (r.sellingPriceWithGst !== null && r.sellingPriceWithGst !== undefined) ? Number(r.sellingPriceWithGst) : (basePrice + gstAmount);
          return {
            id: Number(r.id),
            name: r.name,
            category: r.category,
            barcode: r.barcode,
            hsnCode: r.hsnCode || '',
            unit: r.unit,
            sellingPrice: sellingWithGst > 0 ? sellingWithGst : Number(r.sellingPrice || 0),
            costPrice: cost,
            sellingPriceWD: basePrice,
            gstPercent: gstPct,
            sellingPriceWithGst: sellingWithGst,
            stock: Number(r.stock),
            minStockLevel: Number(r.minStockLevel),
            batchNo: r.batchNo || '',
            expiryDate: r.expiryDate || '',
            image: r.image || '',
            description: r.description || '',
            featured: Boolean(r.featured),
          };
        });
        return memoryStore.products;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllProducts:', e);
    }
  }
  return memoryStore.products;
}

export async function createProduct(prod: Omit<Product, 'id'> & { id?: number }): Promise<Product> {
  const nextId = prod.id || (memoryStore.products.reduce((max, p) => Math.max(max, p.id), 100) + 1);
  const newProduct: Product = { ...prod, id: nextId } as Product;

  if (supabase && supabaseStatus.connected) {
    try {
      const payload: any = {
        name: newProduct.name,
        category: newProduct.category,
        barcode: newProduct.barcode,
        unit: newProduct.unit,
        sellingPrice: Number(newProduct.sellingPrice),
        costPrice: Number(newProduct.costPrice),
        stock: Number(newProduct.stock),
        minStockLevel: Number(newProduct.minStockLevel),
        batchNo: newProduct.batchNo || '',
        expiryDate: newProduct.expiryDate || '',
        image: newProduct.image || '',
        description: newProduct.description || '',
        featured: Boolean(newProduct.featured),
      };
      if (newProduct.sellingPriceWD !== undefined) payload.sellingPriceWD = Number(newProduct.sellingPriceWD);
      if (newProduct.gstPercent !== undefined) payload.gstPercent = Number(newProduct.gstPercent);
      if (newProduct.sellingPriceWithGst !== undefined) payload.sellingPriceWithGst = Number(newProduct.sellingPriceWithGst);
      if (newProduct.hsnCode) payload.hsnCode = String(newProduct.hsnCode);

      let { data, error } = await supabase.from('products').insert([{ ...payload, id: newProduct.id }]).select().single();
      if (error) {
        // If Supabase products table doesn't have the optional columns yet, retry with base columns
        const basePayload = {
          name: newProduct.name,
          category: newProduct.category,
          barcode: newProduct.barcode,
          unit: newProduct.unit,
          sellingPrice: Number(newProduct.sellingPrice),
          costPrice: Number(newProduct.costPrice),
          stock: Number(newProduct.stock),
          minStockLevel: Number(newProduct.minStockLevel),
          batchNo: newProduct.batchNo || '',
          expiryDate: newProduct.expiryDate || '',
          image: newProduct.image || '',
          description: newProduct.description || '',
          featured: Boolean(newProduct.featured),
        };
        const retry = await supabase.from('products').insert([basePayload]).select().single();
        if (!retry.error && retry.data) {
          data = retry.data;
          error = null;
        } else {
          console.error('[Supabase Insert Error] createProduct:', retry.error || error);
        }
      }

      if (!error && data) {
        const created: Product = {
          ...newProduct,
          ...data,
          id: Number(data.id),
          sellingPrice: Number(data.sellingPrice),
          costPrice: Number(data.costPrice),
          stock: Number(data.stock),
          minStockLevel: Number(data.minStockLevel),
          featured: Boolean(data.featured),
        };
        const existingIdx = memoryStore.products.findIndex(p => p.id === created.id);
        if (existingIdx >= 0) memoryStore.products[existingIdx] = created;
        else memoryStore.products.push(created);
        saveStoreToDisk();
        return created;
      }
    } catch (e) {
      console.error('[Supabase Exception] createProduct:', e);
    }
  }

  memoryStore.products.push(newProduct);
  saveStoreToDisk();
  return newProduct;
}

export async function updateProduct(id: number, updates: Partial<Product>): Promise<{ success: boolean; error?: string }> {
  const sanitizedUpdates: Partial<Product> = { ...updates };
  const numericFields: (keyof Product)[] = [
    'sellingPrice',
    'costPrice',
    'stock',
    'minStockLevel',
    'sellingPriceWD',
    'gstPercent',
    'sellingPriceWithGst',
  ];

  for (const field of numericFields) {
    if (sanitizedUpdates[field] !== undefined) {
      const parsed = Number(sanitizedUpdates[field]);
      if (Number.isFinite(parsed)) {
        (sanitizedUpdates as any)[field] = parsed;
      } else {
        delete (sanitizedUpdates as any)[field];
      }
    }
  }

  if (supabase && supabaseStatus.connected) {
    try {
      let dbUpdates: Record<string, any> = { ...sanitizedUpdates };
      delete dbUpdates.id;

      let lastError: any = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (Object.keys(dbUpdates).length === 0) {
          lastError = null;
          break;
        }
        const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error;

        // Retry if optional GST/WD columns do not exist yet
        if (
          error.code === 'PGRST204' &&
          (dbUpdates.sellingPriceWD !== undefined ||
            dbUpdates.gstPercent !== undefined ||
            dbUpdates.sellingPriceWithGst !== undefined)
        ) {
          const match = error.message?.match(/'([^']+)'/);
          const missingCol = match ? match[1] : null;
          if (missingCol && missingCol in dbUpdates) {
            delete dbUpdates[missingCol];
          } else {
            delete dbUpdates.sellingPriceWD;
            delete dbUpdates.gstPercent;
            delete dbUpdates.sellingPriceWithGst;
          }
          continue;
        }

        // Retry if any Supabase column was provisioned as INTEGER instead of NUMERIC
        if (error.code === '22P02' && error.message?.toLowerCase().includes('integer')) {
          let roundedAny = false;
          for (const field of numericFields) {
            if (typeof dbUpdates[field] === 'number' && !Number.isInteger(dbUpdates[field])) {
              dbUpdates[field] = Math.round(dbUpdates[field]);
              roundedAny = true;
            }
          }
          if (roundedAny) continue;
        }

        break;
      }

      if (lastError) {
        console.error('[Supabase Error] updateProduct:', lastError);
        return { success: false, error: lastError.message };
      }
    } catch (e: any) {
      console.error('[Supabase Exception] updateProduct:', e);
      return { success: false, error: e.message };
    }
  }

  memoryStore.products = memoryStore.products.map((p) =>
    p.id === id ? { ...p, ...sanitizedUpdates } : p
  );
  saveStoreToDisk();
  return { success: true };
}

export async function deleteProduct(id: number): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) console.error('[Supabase Error] deleteProduct:', error);
    } catch (e) {
      console.error('[Supabase Error] deleteProduct:', e);
    }
  }
  memoryStore.products = memoryStore.products.filter((p) => p.id !== id);
  saveStoreToDisk();
  return true;
}

// ==========================================
// DATA ACCESS LAYER: SALES TRANSACTIONS (LEDGER)
// ==========================================
export async function getAllLedger(): Promise<SaleTransactionItem[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const priorDiscountByInvoice = buildPriorDiscountMap(memoryStore.ledger);
      const [cloudLedger, discAuditRes] = await Promise.all([
        fetchCloudLedgerRows(),
        supabase
          .from('audit_logs')
          .select('*')
          .eq('action', 'INVOICE_DISCOUNT_SYNC')
          .order('timestamp', { ascending: false })
          .limit(500),
      ]);
      if (cloudLedger.hadCloudSuccess) {
        const unpacked = unpackLedgerRows(cloudLedger.invoiceRows, cloudLedger.saleTxRows);
        memoryStore.ledger = applyRestoredInvoiceDiscounts(
          unpacked,
          priorDiscountByInvoice,
          memoryStore.auditLogs,
          !discAuditRes.error ? discAuditRes.data : null
        );
        saveStoreToDisk();
        return memoryStore.ledger;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllLedger:', e);
    }
  }
  return memoryStore.ledger;
}

export async function getAllInvoices(): Promise<any[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase.from('Invoice Analytics').select('*');
      if (!error && data) {
        return data.sort((a: any, b: any) =>
          String(b.saleDate || '').localeCompare(String(a.saleDate || ''))
        );
      }
    } catch (e) {
      console.error('[Supabase Error] getAllInvoices:', e);
    }
  }
  return [];
}

async function insertLineItemRows(
  tableName: string,
  rows: Record<string, any>[],
  invoiceNo: string,
  saleDate: string
): Promise<{ success: boolean; error?: string; tableMissing?: boolean; alreadyExists?: boolean }> {
  if (!supabase) return { success: false, error: 'Supabase not initialized' };

  // Avoid duplicate inserts for the exact same invoice + date
  const { data: existingRows, error: checkErr } = await supabase
    .from(tableName)
    .select('saleItemId')
    .eq('invoiceNo', invoiceNo)
    .eq('saleDate', saleDate)
    .limit(1);

  if (checkErr) {
    if (checkErr.code === '42P01' || checkErr.message.includes('Could not find the table')) {
      return { success: false, tableMissing: true, error: checkErr.message };
    }
  } else if (existingRows && existingRows.length > 0) {
    return { success: true, alreadyExists: true };
  }

  let workingRows = rows.map((r) => ({ ...r }));
  let lastError = '';

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabase.from(tableName).insert(workingRows);
    if (!error) {
      return { success: true };
    }

    lastError = error.message;
    if (error.code === '42P01' || error.message.includes('Could not find the table')) {
      return { success: false, tableMissing: true, error: error.message };
    }

    // If saleItemId does not auto-increment in this table, assign next sequential IDs
    if (
      error.code === '23502' &&
      error.message.toLowerCase().includes('saleitemid') &&
      !('saleItemId' in workingRows[0])
    ) {
      const { data: maxRow } = await supabase
        .from(tableName)
        .select('saleItemId')
        .order('saleItemId', { ascending: false })
        .limit(1);
      const maxId = maxRow && maxRow[0]?.saleItemId ? Number(maxRow[0].saleItemId) : 0;
      workingRows = workingRows.map((r, idx) => ({ saleItemId: maxId + 1 + idx, ...r }));
      continue;
    }

    // Prune any unknown column reported by PostgREST
    const match = error.message.match(/'([^']+)'/);
    const missingCol = match ? match[1] : null;
    if (missingCol && missingCol in workingRows[0]) {
      workingRows = workingRows.map((r) => {
        const copy = { ...r };
        delete copy[missingCol];
        return copy;
      });
      continue;
    }

    break;
  }

  return { success: false, error: lastError };
}

export function getCurrentIndianFinancialYear(dateInput?: Date | string): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const year = valid.getFullYear();
  const month = valid.getMonth() + 1; // 1..12
  const startYear = month >= 4 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${String(startYear % 100).padStart(2, '0')}-${endShort}`;
}

export async function getNextInvoiceNumberFromStore(): Promise<string> {
  const fy =
    memoryStore.settings.financialYear && memoryStore.settings.financialYear.trim()
      ? memoryStore.settings.financialYear.trim()
      : getCurrentIndianFinancialYear();
  const prefix = `POS/${fy}/`;
  let maxSeq = 0;

  for (const row of memoryStore.ledger) {
    const inv = String(row.invoiceNo || '');
    if (inv.startsWith(prefix)) {
      const tail = Number(inv.slice(prefix.length));
      if (Number.isFinite(tail) && tail > maxSeq) maxSeq = tail;
    } else {
      const m = inv.match(/(\d+)$/);
      if (m && inv.includes(fy)) {
        const num = Number(m[1]);
        if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
      }
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export async function addLedgerItems(
  input: any
): Promise<{ success: boolean; insertedCount: number; updatedStocks?: Record<number, number>; error?: string }> {
  let items: SaleTransactionItem[] = [];
  let invoiceData: any = {};

  if (Array.isArray(input)) {
    items = input;
  } else if (input && typeof input === 'object') {
    if (Array.isArray(input.items)) {
      items = input.items;
      invoiceData = input;
    } else if (input.invoiceNo) {
      invoiceData = input;
      items = Array.isArray(input.itemsDetail)
        ? input.itemsDetail.map((it: any, idx: number) => ({
            saleItemId: idx + 1,
            saleId: input.saleId || 1,
            invoiceNo: input.invoiceNo,
            saleDate: input.saleDate,
            customerId: input.customerId,
            customerName: input.customerName,
            buyerGstin: input.buyerGstin,
            paymentMode: input.paymentMode,
            cashierName: input.cashierName,
            productId: it.productId,
            productName: it.productName,
            barcode: it.barcode,
            hsnCode: it.hsnCode || '',
            quantity: it.quantity,
            unitType: it.unitType,
            sellingPrice: it.sellingPrice,
            lineTotal: it.lineTotal,
            costPrice: it.purchasePrice || it.costPrice || 0,
            sellingPriceWD: it.sellingPriceWD,
            gstPercent: it.gstPercent,
            cgstPercent: it.cgstPercent,
            sgstPercent: it.sgstPercent,
            cgstAmount: it.cgstAmount,
            sgstAmount: it.sgstAmount,
            totalGstAmount: it.totalGstAmount,
            baseAmount: it.baseAmount,
            barcodeMode: it.barcodeMode,
            saleType: it.saleType,
            measuredWeightText: it.measuredWeightText,
            packetBarcode: it.packetBarcode,
            memberDiscount:
              it.memberDiscount !== undefined
                ? Number(it.memberDiscount)
                : idx === 0 && input.memberDiscount !== undefined
                ? Number(input.memberDiscount)
                : 0,
          }))
        : [];
    }
  }

  if (items.length === 0 && !invoiceData.invoiceNo) {
    return { success: true, insertedCount: 0 };
  }

  // Atomic stock check & deduction when requested by live POS checkout
  if (invoiceData.commitStock && items.length > 0) {
    const qtyByProduct = new Map<number, number>();
    for (const it of items) {
      const pid = Number(it.productId || 0);
      if (pid > 0) {
        qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + Number(it.quantity || 0));
      }
    }
    for (const [pid, reqQty] of qtyByProduct.entries()) {
      const prod = memoryStore.products.find((p) => Number(p.id) === pid);
      if (prod && Number(prod.stock) + 0.0001 < reqQty) {
        return {
          success: false,
          insertedCount: 0,
          error: `Insufficient stock for "${prod.name}". Available: ${prod.stock} ${prod.unit}, Requested: ${reqQty} ${prod.unit}`,
        };
      }
    }
  }

  const first = items[0] || invoiceData;
  const invoiceNo = String(invoiceData.invoiceNo || first.invoiceNo);
  const saleId = Number(invoiceData.saleId || first.saleId || Date.now());
  const saleDate = String(invoiceData.saleDate || first.saleDate || getIstDateTimeStr());
  const customerId = invoiceData.customerId || first.customerId || undefined;
  const customerName = String(invoiceData.customerName || first.customerName || 'Walk-in Customer');
  const buyerGstin = invoiceData.buyerGstin || first.buyerGstin || undefined;
  const paymentMode = String(invoiceData.paymentMode || first.paymentMode || 'CASH').toUpperCase();
  const cashierName = String(invoiceData.cashierName || first.cashierName || 'Society Administrator');

  const totalAmount = invoiceData.totalAmount !== undefined
    ? Number(invoiceData.totalAmount)
    : items.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0);

  const baseAmount = invoiceData.baseAmount !== undefined
    ? Number(invoiceData.baseAmount)
    : items.reduce((sum, it) => sum + (Number(it.baseAmount) || (Number(it.sellingPriceWD || it.sellingPrice) * Number(it.quantity))), 0);

  const totalGst = invoiceData.totalGst !== undefined
    ? Number(invoiceData.totalGst)
    : items.reduce((sum, it) => sum + (Number(it.totalGstAmount) || 0), 0);

  const cgstAmount = invoiceData.cgstAmount !== undefined
    ? Number(invoiceData.cgstAmount)
    : (totalGst > 0 ? Number((totalGst / 2).toFixed(2)) : 0);

  const sgstAmount = invoiceData.sgstAmount !== undefined
    ? Number(invoiceData.sgstAmount)
    : (totalGst > 0 ? Number((totalGst / 2).toFixed(2)) : 0);

  const gstSummary = invoiceData.gstSummary || (
    totalGst > 0
      ? `Total GST: ₹${totalGst.toFixed(2)} (CGST: ₹${cgstAmount.toFixed(2)}, SGST: ₹${sgstAmount.toFixed(2)})`
      : 'GST Exempt (0%)'
  );

  const totalProducts = invoiceData.totalProducts !== undefined
    ? Number(invoiceData.totalProducts)
    : items.length;

  const productsSummary = invoiceData.productsSummary ||
    items.map((it) => `${it.productName} (${it.quantity} ${it.unitType})`).join(', ');

  const cashPaidVal = Number(invoiceData.cashPaid ?? first.cashPaid ?? (paymentMode === 'CASH' ? totalAmount : 0));
  const upiPaidVal = Number(invoiceData.upiPaid ?? first.upiPaid ?? (paymentMode === 'UPI' ? totalAmount : 0));
  const creditDueVal = Number(invoiceData.creditDue ?? first.creditDue ?? (paymentMode === 'CREDIT' ? totalAmount : 0));
  const memberDiscountVal = Number(
    invoiceData.memberDiscount ??
      items.reduce((sum, it) => sum + (Number(it.memberDiscount) || 0), 0) ??
      0
  );

  const itemsDetail = Array.isArray(invoiceData.itemsDetail) && invoiceData.itemsDetail.length > 0
    ? invoiceData.itemsDetail.map((it: any, idx: number) => ({
        ...it,
        memberDiscount:
          it.memberDiscount !== undefined
            ? Number(it.memberDiscount)
            : idx === 0
            ? memberDiscountVal
            : 0,
      }))
    : items.map((it, idx) => ({
        productId: Number(it.productId),
        productName: String(it.productName),
        barcode: String(it.barcode || ''),
        hsnCode: String(it.hsnCode || ''),
        quantity: Number(it.quantity),
        unitType: String(it.unitType),
        purchasePrice: Number(it.costPrice || 0),
        sellingPriceWD: Number(it.sellingPriceWD || it.sellingPrice),
        gstPercent: Number(it.gstPercent || 0),
        cgstPercent: Number(it.cgstPercent || (it.gstPercent ? it.gstPercent / 2 : 0)),
        sgstPercent: Number(it.sgstPercent || (it.gstPercent ? it.gstPercent / 2 : 0)),
        cgstAmount: Number(it.cgstAmount || 0),
        sgstAmount: Number(it.sgstAmount || 0),
        totalGstAmount: Number(it.totalGstAmount || 0),
        baseAmount: Number(it.baseAmount || 0),
        sellingPrice: Number(it.sellingPrice),
        lineTotal: Number(it.lineTotal),
        barcodeMode: it.barcodeMode || (it.packetBarcode ? 'WITH_BARCODE' : (it.saleType === 'DIRECT_LOOSE' ? 'WITHOUT_BARCODE' : 'WITH_BARCODE')),
        saleType: it.saleType || (it.barcodeMode === 'WITHOUT_BARCODE' ? 'DIRECT_LOOSE' : 'BARCODE'),
        measuredWeightText: it.measuredWeightText || '',
        packetBarcode: it.packetBarcode || '',
        memberDiscount: idx === 0 ? memberDiscountVal : Number(it.memberDiscount || 0),
      }));

  const hasLooseItems = items.some(
    (it) => it.barcodeMode === 'WITHOUT_BARCODE' || it.saleType === 'DIRECT_LOOSE'
  );
  const saleModeSummary = hasLooseItems ? 'MIXED_OR_LOOSE' : 'WITH_BARCODE';

  const lineItemAnalyticsRows = items.map((it, idx) => ({
    saleId,
    invoiceNo,
    saleDate,
    customerId: customerId || '',
    customerName,
    buyerGstin: buyerGstin || '',
    paymentMode,
    productId: Number(it.productId || 0),
    productName: String(it.productName || 'General Item'),
    barcode: String(it.barcode || ''),
    hsnCode: String(it.hsnCode || ''),
    quantity: Number(it.quantity || 1),
    unitType: String(it.unitType || 'PCS'),
    sellingPrice: Number(it.sellingPrice || 0),
    lineTotal: Number(it.lineTotal || 0),
    cashierName,
    baseAmount: Number((it.baseAmount ?? (Number(it.sellingPriceWD || it.sellingPrice) * Number(it.quantity || 1))).toFixed(2)),
    totalGst: Number((it.totalGstAmount ?? 0).toFixed(2)),
    cgstAmount: Number((it.cgstAmount ?? 0).toFixed(2)),
    sgstAmount: Number((it.sgstAmount ?? 0).toFixed(2)),
    gstSummary,
    tenderedCash: Number(invoiceData.tenderedCash || first.tenderedCash || (paymentMode === 'CASH' ? totalAmount : cashPaidVal)),
    changeDue: Number(invoiceData.changeDue || first.changeDue || 0),
    upiTxnRef: String(invoiceData.upiTxnRef || first.upiTxnRef || ''),
    cashPaid: cashPaidVal,
    upiPaid: upiPaidVal,
    creditDue: creditDueVal,
    memberDiscount: idx === 0 ? memberDiscountVal : 0,
    itemsDetail: [],
    productsSummary: '',
    totalProducts: 1,
    hasLooseItems: it.barcodeMode === 'WITHOUT_BARCODE' || it.saleType === 'DIRECT_LOOSE',
    saleModeSummary: it.barcodeMode === 'WITHOUT_BARCODE' || it.saleType === 'DIRECT_LOOSE' ? 'WITHOUT_BARCODE' : 'WITH_BARCODE',
  }));

  const saleTransactionRows = items.map((it) => ({
    saleId,
    invoiceNo,
    saleDate,
    customerName,
    paymentMode,
    productId: Number(it.productId || 0),
    productName: String(it.productName || 'General Item'),
    barcode: String(it.barcode || ''),
    quantity: Number(it.quantity || 1),
    unitType: String(it.unitType || 'PCS'),
    sellingPrice: Number(it.sellingPrice || 0),
    lineTotal: Number(it.lineTotal || 0),
    cashierName,
  }));

  const singleInvoiceRow = {
    saleId,
    invoiceNo,
    saleDate,
    customerId: customerId || '',
    customerName,
    buyerGstin: buyerGstin || '',
    paymentMode,
    cashierName,
    totalAmount: Number(totalAmount.toFixed(2)),
    baseAmount: Number(baseAmount.toFixed(2)),
    totalGst: Number(totalGst.toFixed(2)),
    cgstAmount: Number(cgstAmount.toFixed(2)),
    sgstAmount: Number(sgstAmount.toFixed(2)),
    gstSummary,
    totalProducts,
    productsSummary,
    itemsDetail,
    hasLooseItems,
    saleModeSummary,
    tenderedCash: Number(invoiceData.tenderedCash || first.tenderedCash || (paymentMode === 'CASH' ? totalAmount : cashPaidVal)),
    changeDue: Number(invoiceData.changeDue || first.changeDue || 0),
    upiTxnRef: String(invoiceData.upiTxnRef || first.upiTxnRef || ''),
    cashPaid: cashPaidVal,
    upiPaid: upiPaidVal,
    creditDue: creditDueVal,
    memberDiscount: memberDiscountVal,
  };

  if (supabase && supabaseStatus.connected) {
    try {
      const mode = await detectInvoiceTableMode();
      let invoiceSaved = false;
      let lastErrorMessage = '';

      if (mode === 'LINE_ITEM') {
        const res = await insertLineItemRows('Invoice Analytics', lineItemAnalyticsRows, invoiceNo, saleDate);
        invoiceSaved = res.success;
        if (!res.success) lastErrorMessage = res.error || 'Failed to insert line items into Invoice Analytics';
      } else {
        let payloadRow: Record<string, any> = { ...singleInvoiceRow };
        for (let attempt = 0; attempt < 10; attempt++) {
          const { error } = await supabase
            .from('Invoice Analytics')
            .upsert([payloadRow], { onConflict: 'invoiceNo' });

          if (!error) {
            invoiceSaved = true;
            break;
          }

          lastErrorMessage = error.message;
          if (error.code === '42P10' || error.code === '23502') {
            cachedInvoiceTableMode = 'LINE_ITEM';
            const fallbackRes = await insertLineItemRows('Invoice Analytics', lineItemAnalyticsRows, invoiceNo, saleDate);
            invoiceSaved = fallbackRes.success;
            if (!fallbackRes.success) lastErrorMessage = fallbackRes.error || lastErrorMessage;
            break;
          }

          const match = error.message.match(/'([^']+)'/);
          const missingCol = match ? match[1] : null;
          if (missingCol && missingCol in payloadRow) {
            delete payloadRow[missingCol];
          } else {
            payloadRow = {
              saleId: singleInvoiceRow.saleId,
              invoiceNo: singleInvoiceRow.invoiceNo,
              saleDate: singleInvoiceRow.saleDate,
              paymentMode: singleInvoiceRow.paymentMode,
              totalAmount: singleInvoiceRow.totalAmount,
            };
          }
        }
      }

      const txRes = await insertLineItemRows('sale_transactions', saleTransactionRows, invoiceNo, saleDate);
      if (!txRes.success && !txRes.tableMissing) {
        console.warn('[Supabase Notice] sale_transactions sync:', txRes.error);
      }

      if (!invoiceSaved && !txRes.success) {
        console.error('[Supabase Warning] Could not save transaction to cloud:', lastErrorMessage);
        return {
          success: false,
          insertedCount: 0,
          error: `DB Notice: ${lastErrorMessage}`,
        };
      }
      console.log(`[Supabase Success] Transaction "${invoiceNo}" (${saleDate}) synced to Supabase.`);
    } catch (e: any) {
      console.error('[Supabase Exception] addLedgerItems:', e);
      return { success: false, insertedCount: 0, error: `Exception: ${e.message}` };
    }
  } else {
    const reason = !supabase ? 'Client not initialized' : 'Status disconnected';
    console.warn(`[Supabase Warning] Skipping cloud save: ${reason}`);
    if (supabaseStatus.configured) {
      return {
        success: false,
        insertedCount: 0,
        error: 'Database is configured but not connected. Check your Supabase settings.',
      };
    }
  }

  // Commit stock deductions after ledger insert succeeds
  const updatedStocks: Record<number, number> = {};
  if (invoiceData.commitStock && items.length > 0) {
    const qtyByProduct = new Map<number, number>();
    for (const it of items) {
      const pid = Number(it.productId || 0);
      if (pid > 0) {
        qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + Number(it.quantity || 0));
      }
    }
    for (const [pid, soldQty] of qtyByProduct.entries()) {
      const prod = memoryStore.products.find((p) => Number(p.id) === pid);
      if (prod) {
        const nextStock = Math.max(0, Number((Number(prod.stock) - soldQty).toFixed(3)));
        await updateProduct(pid, { stock: nextStock });
        updatedStocks[pid] = nextStock;
      }
    }
  }

  if (memberDiscountVal > 0 && invoiceNo) {
    const safeInvId = invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    const discountSyncLog: AdminAuditLog = {
      id: `inv-disc-${safeInvId}`,
      timestamp: getIstDateTimeStr(),
      action: 'INVOICE_DISCOUNT_SYNC',
      performedBy: cashierName || 'POS CASHIER',
      details: `[INVOICE_DISCOUNT_TX:${JSON.stringify({ invoiceNo, saleDate, discount: memberDiscountVal })}] Bill Discount Allowed ₹${memberDiscountVal.toFixed(2)} on ${invoiceNo}`,
    };
    memoryStore.auditLogs = [
      discountSyncLog,
      ...memoryStore.auditLogs.filter((l) => l.id !== discountSyncLog.id),
    ];
    if (supabase && supabaseStatus.connected) {
      try {
        await supabase.from('audit_logs').upsert([discountSyncLog]);
      } catch (err) {
        console.warn('[Supabase Notice] discount audit sync:', err);
      }
    }
  }

  if (items.length > 0) {
    const existingMap = new Map<number, SaleTransactionItem>();
    items.forEach((it) => existingMap.set(it.saleItemId, it));
    memoryStore.ledger.forEach((it) => {
      if (!existingMap.has(it.saleItemId)) {
        existingMap.set(it.saleItemId, it);
      }
    });
    memoryStore.ledger = Array.from(existingMap.values()).sort((a, b) => {
      const dateCmp = String(b.saleDate || '').localeCompare(String(a.saleDate || ''));
      if (dateCmp !== 0) return dateCmp;
      return Number(b.saleItemId || 0) - Number(a.saleItemId || 0);
    });
    saveStoreToDisk();
  }
  return {
    success: true,
    insertedCount: items.length || 1,
    ...(Object.keys(updatedStocks).length > 0 ? { updatedStocks } : {}),
  };
}

// ==========================================
// EXTERNAL LINK ACCESS RESTRICTION (3 ALLOWED EMAILS ONLY — NO DB TABLE)
// ==========================================
export async function verifyActiveMemberSession(token?: string | null): Promise<{
  valid: boolean;
  session?: NonNullable<ReturnType<typeof verifySessionToken>>;
  reason?: string;
}> {
  const decoded = verifySessionToken(token);
  if (!decoded) {
    return { valid: false, reason: 'Invalid or expired session token.' };
  }
  if (!decoded.email || !isStrictlyAllowedViewerEmail(decoded.email)) {
    return {
      valid: false,
      reason: UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE,
    };
  }
  return { valid: true, session: decoded };
}

// ==========================================
// DATA ACCESS LAYER: CASHIERS
// ==========================================
export async function getAllCashiers(): Promise<CashierUser[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase.from('cashiers').select('*').order('id', { ascending: true });
      if (!error && data && data.length > 0) {
        memoryStore.cashiers = data
          .filter((r: any) => r.role !== 'Developer')
          .map((r: any) => ({
            id: r.id,
            loginId: r.loginId,
            passwordHash: r.passwordHash,
            name: r.name,
            staffCode: r.staffCode,
            role: r.role,
            assignedCounter: r.assignedCounter || 'COUNTER-01',
            email: r.email || undefined,
            isActive: Boolean(r.isActive),
            createdAt: r.createdAt,
            lastLogin: r.lastLogin || undefined,
          }));
        return memoryStore.cashiers;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllCashiers:', e);
    }
  }
  return memoryStore.cashiers.filter((c) => c.role !== 'Developer');
}

export async function authenticateCashier(params: {
  email?: string;
  loginId?: string;
  password: string;
  counter?: string;
  mode?: 'cashier' | 'admin';
}): Promise<{
  success: boolean;
  statusCode: number;
  message?: string;
  unauthorizedEmail?: boolean;
  cashier?: CashierUser;
  token?: string;
}> {
  const email = normalizeEmailAddress(params.email);
  if (!email || !isValidEmailFormat(email) || !isStrictlyAllowedViewerEmail(email)) {
    return {
      success: false,
      statusCode: 403,
      unauthorizedEmail: true,
      message: UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE,
    };
  }

  const loginKey = String(params.loginId || '').trim().toLowerCase();
  const password = String(params.password ?? '');
  if (!loginKey || !password) {
    return { success: false, statusCode: 400, message: 'Login ID and password are required.' };
  }

  const all = await getAllCashiers();
  const user = all.find(
    (c) =>
      c.role !== 'Developer' &&
      ((c.loginId || '').trim().toLowerCase() === loginKey ||
        (c.staffCode || '').trim().toLowerCase() === loginKey)
  );

  if (!user) {
    return { success: false, statusCode: 401, message: 'Invalid Staff ID or Administrator credentials.' };
  }
  if (user.isActive === false) {
    return { success: false, statusCode: 403, message: 'This account is deactivated by the Administrator.' };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { success: false, statusCode: 401, message: 'Incorrect password / PIN.' };
  }

  const nowIso = getIstDateTimeStr();
  const updates: Partial<CashierUser> = { lastLogin: nowIso };
  // Upgrade legacy plain-text password to salted scrypt hash seamlessly on login
  if (!user.passwordHash.startsWith('scrypt$')) {
    updates.passwordHash = hashPassword(password);
  }
  await updateCashier(user.id, updates);

  const assignedCounter = params.counter || user.assignedCounter;
  const safeUser = sanitizeCashierForClient({
    ...user,
    email,
    isDeveloper: false,
    lastLogin: nowIso,
    assignedCounter,
  });
  const token = createSessionToken(safeUser, { email, isDeveloper: false });
  return { success: true, statusCode: 200, cashier: safeUser, token };
}

function serializeCashierForSupabase(c: Partial<CashierUser>) {
  const row: Record<string, any> = {};
  const allowedKeys: (keyof CashierUser)[] = [
    'id',
    'loginId',
    'passwordHash',
    'name',
    'staffCode',
    'role',
    'assignedCounter',
    'isActive',
    'createdAt',
    'lastLogin',
  ];
  for (const k of allowedKeys) {
    if (c[k] !== undefined) row[k] = c[k];
  }
  return row;
}

export async function createCashier(c: CashierUser): Promise<CashierUser> {
  const secureUser: CashierUser = {
    ...c,
    passwordHash:
      c.passwordHash && !c.passwordHash.startsWith('scrypt$')
        ? hashPassword(c.passwordHash)
        : c.passwordHash,
  };
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase
        .from('cashiers')
        .insert([serializeCashierForSupabase(secureUser)])
        .select()
        .single();
      if (!error && data) {
        const merged = { ...secureUser, ...data };
        const existingIdx = memoryStore.cashiers.findIndex((ex) => ex.id === merged.id);
        if (existingIdx >= 0) memoryStore.cashiers[existingIdx] = merged;
        else memoryStore.cashiers.push(merged);
        saveStoreToDisk();
        return sanitizeCashierForClient(merged);
      }
      if (error) console.error('[Supabase Error] createCashier:', error);
    } catch (e) {
      console.error('[Supabase Error] createCashier:', e);
    }
  }
  memoryStore.cashiers.push(secureUser);
  saveStoreToDisk();
  return sanitizeCashierForClient(secureUser);
}

export async function updateCashier(id: string, updates: Partial<CashierUser>): Promise<boolean> {
  const secureUpdates: Partial<CashierUser> = { ...updates };
  if (
    secureUpdates.passwordHash &&
    secureUpdates.passwordHash !== '********' &&
    !secureUpdates.passwordHash.startsWith('scrypt$')
  ) {
    secureUpdates.passwordHash = hashPassword(secureUpdates.passwordHash);
  } else if (secureUpdates.passwordHash === '********') {
    delete secureUpdates.passwordHash;
  }

  if (supabase && supabaseStatus.connected) {
    try {
      const dbPatch = serializeCashierForSupabase(secureUpdates);
      if (Object.keys(dbPatch).length > 0) {
        const { error } = await supabase.from('cashiers').update(dbPatch).eq('id', id);
        if (error) console.error('[Supabase Error] updateCashier:', error);
      }
    } catch (e) {
      console.error('[Supabase Error] updateCashier:', e);
    }
  }
  memoryStore.cashiers = memoryStore.cashiers.map((c) =>
    c.id === id ? { ...c, ...secureUpdates } : c
  );
  saveStoreToDisk();
  return true;
}

export async function deleteCashier(id: string): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase.from('cashiers').delete().eq('id', id);
      if (error) console.error('[Supabase Error] deleteCashier:', error);
    } catch (e) {
      console.error('[Supabase Error] deleteCashier:', e);
    }
  }
  memoryStore.cashiers = memoryStore.cashiers.filter((c) => c.id !== id);
  saveStoreToDisk();
  return true;
}

export async function resetUserOrAdminPassword(params: {
  loginId: string;
  currentPassword: string;
  newPassword: string;
  accountType?: 'user' | 'admin';
}): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  updatedCashier?: CashierUser;
}> {
  const loginKey = String(params.loginId || '').trim().toLowerCase();
  const currentPass = String(params.currentPassword ?? '');
  const nextPass = String(params.newPassword ?? '').trim();

  if (!loginKey) {
    return { success: false, statusCode: 400, message: 'Login ID or Staff Code is required.' };
  }
  if (!currentPass) {
    return { success: false, statusCode: 400, message: 'Existing password / PIN is required.' };
  }
  if (nextPass.length < 4) {
    return { success: false, statusCode: 400, message: 'New password must be at least 4 characters long.' };
  }
  if (nextPass === currentPass) {
    return {
      success: false,
      statusCode: 400,
      message: 'New password must be different from the existing password.',
    };
  }

  const allCashiers = await getAllCashiers();
  const target = allCashiers.find(
    (c) =>
      c.role !== 'Developer' &&
      ((c.loginId || '').trim().toLowerCase() === loginKey ||
        (c.staffCode || '').trim().toLowerCase() === loginKey)
  );

  if (!target) {
    return { success: false, statusCode: 404, message: `No account found for "${params.loginId}".` };
  }

  const isTargetAdmin = target.role === 'System Admin' || (target.loginId || '').toLowerCase() === 'admin';
  if (params.accountType === 'admin' && !isTargetAdmin) {
    return {
      success: false,
      statusCode: 403,
      message: `"${target.loginId}" is a Cashier user account, not an Administrator account.`,
    };
  }
  if (params.accountType === 'user' && isTargetAdmin) {
    return {
      success: false,
      statusCode: 403,
      message: `"${target.loginId}" is an Administrator account. Switch to Admin mode to reset it.`,
    };
  }

  if (target.isActive === false) {
    return {
      success: false,
      statusCode: 403,
      message: 'This account is currently deactivated by the Administrator.',
    };
  }

  if (!verifyPassword(currentPass, target.passwordHash)) {
    return {
      success: false,
      statusCode: 401,
      message: 'Existing password / PIN does not match.',
    };
  }

  const hashedNextPass = hashPassword(nextPass);
  if (supabase && supabaseStatus.connected) {
    const { error } = await supabase
      .from('cashiers')
      .update({ passwordHash: hashedNextPass })
      .eq('id', target.id);
    if (error) {
      return {
        success: false,
        statusCode: 500,
        message: `Failed to update password in database: ${error.message}`,
      };
    }
  }

  const updatedStored: CashierUser = { ...target, passwordHash: hashedNextPass };
  memoryStore.cashiers = memoryStore.cashiers.map((c) => (c.id === target.id ? updatedStored : c));
  saveStoreToDisk();

  await addAuditLogEntry({
    id: `audit-pwd-${Date.now()}`,
    timestamp: getIstDateTimeStr(),
    action: isTargetAdmin ? 'ADMIN_PASSWORD_RESET' : 'USER_PASSWORD_RESET',
    performedBy: `${target.name} (${target.staffCode})`,
    details: `Reset existing password via Reset Password window for ${isTargetAdmin ? 'Administrator' : 'User'} "${target.loginId}".`,
  });

  return {
    success: true,
    statusCode: 200,
    message: `Password updated successfully for ${target.name} (${target.loginId}).`,
    updatedCashier: sanitizeCashierForClient(updatedStored),
  };
}

// ==========================================
// DATA ACCESS LAYER: ADMIN SETTINGS (WITH DB-PERSISTED ACCOUNTING CONFIG)
// ==========================================
function getCurrentIndianFy(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYr = m >= 4 ? y : y - 1;
  return `${startYr}-${String((startYr + 1) % 100).padStart(2, '0')}`;
}

function normalizeTransactionMode(
  settings: Partial<AdminStoreSettings> & { emergencyNotice?: string }
): TransactionControlMode {
  if (
    settings.transactionMode === 'STOP_ALL' ||
    settings.transactionMode === 'ONLY_SELL' ||
    settings.transactionMode === 'ONLY_PURCHASE' ||
    settings.transactionMode === 'BOTH'
  ) {
    return settings.transactionMode;
  }
  const match = String(settings.emergencyNotice || '').match(
    /^\[TX_MODE:(STOP_ALL|ONLY_SELL|ONLY_PURCHASE|BOTH)\](?:\s*|\n)?/
  );
  if (match) {
    return match[1] as TransactionControlMode;
  }
  return settings.transactionsEnabled === false ? 'STOP_ALL' : 'BOTH';
}

function serializeAdminSettingsForDb(settings: AdminStoreSettings) {
  const mode = normalizeTransactionMode(settings);
  const cleanNotice = String(settings.emergencyNotice || '')
    .replace(/^\[TX_MODE:(STOP_ALL|ONLY_SELL|ONLY_PURCHASE|BOTH)\](?:\s*|\n)?/, '')
    .replace(/\[STORE_CFG:\{[\s\S]*?\}\]/g, '')
    .trim();

  const rawGstin = String(settings.societyGstin || '').trim().toUpperCase();
  const normalizedGstin = !rawGstin || rawGstin === '19AAAAD0000A1Z5' ? '19AAAAD9763A1ZS' : rawGstin;

  const storeCfg = {
    creditSalesEnabled: settings.creditSalesEnabled !== false,
    societyGstin: normalizedGstin,
    stateCode: String(settings.stateCode || '19').trim(),
    financialYear: String(settings.financialYear || getCurrentIndianFy()).trim(),
    openingCashBalance: Math.max(0, Number(settings.openingCashBalance || 0)),
    openingBankBalance: Math.max(0, Number(settings.openingBankBalance || 0)),
    openingCgstItc: Math.max(0, Number(settings.openingCgstItc || 0)),
    openingSgstItc: Math.max(0, Number(settings.openingSgstItc || 0)),
    shareCapital: Math.max(0, Number(settings.shareCapital || 0)),
    cooperativeReserveFund: Math.max(0, Number(settings.cooperativeReserveFund || 0)),
    purchaseSettlementMode:
      settings.purchaseSettlementMode === 'BANK_UPI' || settings.purchaseSettlementMode === 'CASH'
        ? settings.purchaseSettlementMode
        : 'CREDIT',
    requireStrictUpiUtr: Boolean(settings.requireStrictUpiUtr),
  };

  const encodedNotice = `[TX_MODE:${mode}][STORE_CFG:${JSON.stringify(storeCfg)}]${
    cleanNotice ? ` ${cleanNotice}` : ''
  }`;

  return {
    id: 1,
    transactionsEnabled: mode === 'BOTH' || mode === 'ONLY_SELL',
    upiPaymentsEnabled: Boolean(settings.upiPaymentsEnabled),
    cashPaymentsEnabled: Boolean(settings.cashPaymentsEnabled),
    memberDiscountPercent: Number(settings.memberDiscountPercent || 0),
    emergencyNotice: encodedNotice,
    haltReason: settings.haltReason || '',
  };
}

function deserializeAdminSettingsFromDb(data: any): AdminStoreSettings {
  const mode = normalizeTransactionMode(data || {});
  const rawNotice = String(data?.emergencyNotice || '');
  let parsedCfg: Record<string, any> = {};
  const cfgMatch = rawNotice.match(/\[STORE_CFG:(\{[\s\S]*?\})\]/);
  if (cfgMatch && cfgMatch[1]) {
    try {
      parsedCfg = JSON.parse(cfgMatch[1]);
    } catch {
      parsedCfg = {};
    }
  }
  const cleanNotice = rawNotice
    .replace(/^\[TX_MODE:(STOP_ALL|ONLY_SELL|ONLY_PURCHASE|BOTH)\](?:\s*|\n)?/, '')
    .replace(/\[STORE_CFG:\{[\s\S]*?\}\]/g, '')
    .trim();

  return {
    transactionsEnabled: mode === 'BOTH' || mode === 'ONLY_SELL',
    transactionMode: mode,
    upiPaymentsEnabled: Boolean(data?.upiPaymentsEnabled ?? true),
    cashPaymentsEnabled: Boolean(data?.cashPaymentsEnabled ?? true),
    creditSalesEnabled:
      data?.creditSalesEnabled !== undefined
        ? Boolean(data.creditSalesEnabled)
        : parsedCfg.creditSalesEnabled !== undefined
        ? Boolean(parsedCfg.creditSalesEnabled)
        : true,
    memberDiscountPercent: Number(data?.memberDiscountPercent || 0),
    emergencyNotice: cleanNotice,
    haltReason: data?.haltReason || '',
    societyGstin: (() => {
      const val = String(data?.societyGstin ?? parsedCfg.societyGstin ?? '').trim().toUpperCase();
      return !val || val === '19AAAAD0000A1Z5' ? '19AAAAD9763A1ZS' : val;
    })(),
    stateCode: String(data?.stateCode ?? parsedCfg.stateCode ?? '19'),
    financialYear: String(data?.financialYear ?? parsedCfg.financialYear ?? getCurrentIndianFy()),
    openingCashBalance: Number(data?.openingCashBalance ?? parsedCfg.openingCashBalance ?? 0),
    openingBankBalance: Number(data?.openingBankBalance ?? parsedCfg.openingBankBalance ?? 0),
    openingCgstItc: Number(data?.openingCgstItc ?? parsedCfg.openingCgstItc ?? 0),
    openingSgstItc: Number(data?.openingSgstItc ?? parsedCfg.openingSgstItc ?? 0),
    shareCapital: Number(data?.shareCapital ?? parsedCfg.shareCapital ?? 0),
    cooperativeReserveFund: Number(
      data?.cooperativeReserveFund ?? parsedCfg.cooperativeReserveFund ?? 0
    ),
    purchaseSettlementMode:
      data?.purchaseSettlementMode || parsedCfg.purchaseSettlementMode || 'CREDIT',
    requireStrictUpiUtr: Boolean(data?.requireStrictUpiUtr ?? parsedCfg.requireStrictUpiUtr ?? false),
  };
}

export async function getAdminSettings(): Promise<AdminStoreSettings> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase.from('admin_settings').select('*').eq('id', 1).single();
      if (!error && data) {
        const normalized = deserializeAdminSettingsFromDb(data);
        memoryStore.settings = normalized;
        return normalized;
      }
    } catch (e) {
      console.error('[Supabase Error] getAdminSettings:', e);
    }
  }
  return deserializeAdminSettingsFromDb(memoryStore.settings);
}

export async function updateAdminSettings(settings: AdminStoreSettings): Promise<boolean> {
  const normalized = deserializeAdminSettingsFromDb(serializeAdminSettingsForDb(settings));
  if (supabase && supabaseStatus.connected) {
    try {
      const dbRow = serializeAdminSettingsForDb(normalized);
      const { error } = await supabase.from('admin_settings').upsert(dbRow);
      if (error) console.error('[Supabase Error] updateAdminSettings:', error);
    } catch (e) {
      console.error('[Supabase Error] updateAdminSettings:', e);
    }
  }
  memoryStore.settings = normalized;
  saveStoreToDisk();
  return true;
}

// ==========================================
// DATA ACCESS LAYER: CATEGORIES
// ==========================================
export async function getAllCategories(): Promise<string[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase.from('categories').select('name').order('id', { ascending: true });
      if (!error && Array.isArray(data)) {
        memoryStore.categories = data.map((r: any) => r.name);
        return memoryStore.categories;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllCategories:', e);
    }
  }
  return memoryStore.categories;
}

export async function addCategory(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;

  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase.from('categories').insert([{ name: trimmed }]);
      if (error) console.error('[Supabase Error] addCategory:', error);
    } catch (e) {
      console.error('[Supabase Error] addCategory:', e);
    }
  }

  if (!memoryStore.categories.includes(trimmed)) {
    memoryStore.categories.push(trimmed);
  }
  return true;
}

export async function renameCategory(oldName: string, newName: string): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('categories').update({ name: newName }).eq('name', oldName);
      await supabase.from('products').update({ category: newName }).eq('category', oldName);
    } catch (e) {
      console.error('[Supabase Error] renameCategory:', e);
    }
  }

  memoryStore.categories = memoryStore.categories.map((c) => (c === oldName ? newName : c));
  memoryStore.products = memoryStore.products.map((p) =>
    p.category === oldName ? { ...p, category: newName } : p
  );
  return true;
}

// ==========================================
// DATA ACCESS LAYER: AUDIT LOGS
// ==========================================
export async function getAllAuditLogs(): Promise<AdminAuditLog[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (!error && data && data.length > 0) {
        memoryStore.auditLogs = data.map((r: any) => ({
          id: r.id,
          timestamp: r.timestamp,
          action: r.action,
          performedBy: r.performedBy,
          details: r.details || '',
        }));
        return memoryStore.auditLogs;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllAuditLogs:', e);
    }
  }
  return memoryStore.auditLogs;
}

export async function addAuditLogEntry(log: AdminAuditLog): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase.from('audit_logs').insert([log]);
      if (error) console.error('[Supabase Error] addAuditLogEntry:', error);
    } catch (e) {
      console.error('[Supabase Error] addAuditLogEntry:', e);
    }
  }
  memoryStore.auditLogs = [log, ...memoryStore.auditLogs];
  return true;
}

// ==========================================
// DATA ACCESS LAYER: LOOSE PACKETS
// ==========================================
export async function getAllLoosePackets(): Promise<LoosePacket[]> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { data, error } = await supabase
        .from('loose_packets')
        .select('*')
        .order('createdAt', { ascending: false });

      if (!error && Array.isArray(data)) {
        memoryStore.loosePackets = data.map((r: any) => ({
          id: r.id,
          productId: Number(r.productId),
          productName: r.productName,
          baseBarcode: r.baseBarcode,
          uniqueBarcode: r.uniqueBarcode,
          measuredGramsOrMl: Number(r.measuredGramsOrMl),
          weightText: r.weightText,
          quantityInBaseUnit: Number(r.quantityInBaseUnit),
          unitPrice: Number(r.unitPrice),
          calculatedPrice: Number(r.calculatedPrice),
          unit: r.unit,
          createdAt: r.createdAt,
          status: r.status,
          soldAtInvoiceNo: r.soldAtInvoiceNo || undefined,
          soldDate: r.soldDate || undefined,
        }));
        return memoryStore.loosePackets;
      }
    } catch (e) {
      console.error('[Supabase Error] getAllLoosePackets:', e);
    }
  }
  return memoryStore.loosePackets;
}

export async function saveLoosePacketRecord(pk: LoosePacket): Promise<{ success: boolean; error?: string }> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('loose_packets')
        .upsert(pk, { onConflict: 'uniqueBarcode' });
      if (error) {
        console.error('[Supabase Error] saveLoosePacketRecord:', error);
        return { success: false, error: error.message };
      }
    } catch (e: any) {
      console.error('[Supabase Error] saveLoosePacketRecord:', e);
      return { success: false, error: e.message };
    }
  }

  const idx = memoryStore.loosePackets.findIndex((p) => p.id === pk.id);
  if (idx >= 0) {
    memoryStore.loosePackets[idx] = pk;
  } else {
    memoryStore.loosePackets = [pk, ...memoryStore.loosePackets];
  }
  return { success: true };
}

export async function updateLoosePacketStatus(
  uniqueBarcode: string,
  status: 'UNSOLD' | 'SOLD',
  soldAtInvoiceNo?: string,
  soldDate?: string
): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('loose_packets')
        .update({ status, soldAtInvoiceNo: soldAtInvoiceNo || null, soldDate: soldDate || null })
        .eq('uniqueBarcode', uniqueBarcode);
      if (error) console.error('[Supabase Error] updateLoosePacketStatus:', error);
    } catch (e) {
      console.error('[Supabase Error] updateLoosePacketStatus:', e);
    }
  }

  memoryStore.loosePackets = memoryStore.loosePackets.map((pk) =>
    pk.uniqueBarcode === uniqueBarcode
      ? { ...pk, status, soldAtInvoiceNo, soldDate }
      : pk
  );
  return true;
}

export async function deleteLoosePacketRecord(id: string): Promise<boolean> {
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase.from('loose_packets').delete().eq('id', id);
      if (error) console.error('[Supabase Error] deleteLoosePacketRecord:', error);
    } catch (e) {
      console.error('[Supabase Error] deleteLoosePacketRecord:', e);
    }
  }
  memoryStore.loosePackets = memoryStore.loosePackets.filter((pk) => pk.id !== id);
  return true;
}

// ==========================================
// DATA ACCESS LAYER: PURCHASE TRANSACTIONS
// ==========================================
function normalizePurchaseTransaction(raw: Partial<PurchaseTransaction>): PurchaseTransaction {
  const now = new Date();
  const prevStock = Number(raw.previousStock || 0);
  const addedQty = Number(raw.addedQuantity || 0);
  const newStock =
    raw.newStock !== undefined ? Number(raw.newStock) : Number((prevStock + addedQty).toFixed(3));
  const unitPrice = Number(raw.purchasePrice || 0);
  const gstPct = Number(raw.gstPercent || 0);
  const totalAmt =
    raw.totalAmount !== undefined
      ? Number(raw.totalAmount)
      : Number((addedQty * unitPrice).toFixed(2));
  const computedBase =
    gstPct > 0 ? totalAmt / (1 + gstPct / 100) : totalAmt;
  const computedGst = totalAmt - computedBase;
  const entryType: PurchaseEntryType =
    raw.entryType === 'NEW_PRODUCT' || raw.entryType === 'QUICK_RESTOCK'
      ? raw.entryType
      : 'FILL_EXISTING';

  return {
    id: String(raw.id || `pur-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    purchaseRef: String(
      raw.purchaseRef ||
        `PUR-${getIstDateStr(now).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
    ),
    purchaseDate: String(
      raw.purchaseDate || getIstDateTimeStr(now)
    ),
    entryType,
    productId: Number(raw.productId || 0),
    productName: String(raw.productName || 'Unnamed Product'),
    category: String(raw.category || ''),
    barcode: String(raw.barcode || ''),
    hsnCode: raw.hsnCode ? String(raw.hsnCode) : '',
    unit: (raw.unit as PurchaseTransaction['unit']) || 'KG',
    previousStock: Number(prevStock.toFixed(3)),
    addedQuantity: Number(addedQty.toFixed(3)),
    newStock: Number(newStock.toFixed(3)),
    purchasePrice: Number(unitPrice.toFixed(2)),
    gstPercent: Number(gstPct.toFixed(2)),
    baseAmount: Number((raw.baseAmount !== undefined ? raw.baseAmount : computedBase).toFixed(2)),
    cgstAmount: Number((raw.cgstAmount !== undefined ? raw.cgstAmount : computedGst / 2).toFixed(2)),
    sgstAmount: Number((raw.sgstAmount !== undefined ? raw.sgstAmount : computedGst / 2).toFixed(2)),
    totalGstAmount: Number((raw.totalGstAmount !== undefined ? raw.totalGstAmount : computedGst).toFixed(2)),
    totalAmount: Number(totalAmt.toFixed(2)),
    supplierId: raw.supplierId ? String(raw.supplierId) : '',
    supplierName: raw.supplierName ? String(raw.supplierName) : '',
    supplierInvoiceNo: raw.supplierInvoiceNo ? String(raw.supplierInvoiceNo) : '',
    paymentStatus:
      raw.paymentStatus === 'CASH' || raw.paymentStatus === 'BANK_UPI' ? raw.paymentStatus : 'CREDIT',
    supplierNote: raw.supplierNote ? String(raw.supplierNote) : '',
    batchNo: raw.batchNo ? String(raw.batchNo) : '',
    expiryDate: raw.expiryDate ? String(raw.expiryDate) : '',
    performedBy: String(raw.performedBy || 'SYSTEM ADMIN'),
  };
}

function parsePurchaseTxFromAuditDetails(details?: string): PurchaseTransaction | null {
  if (!details) return null;
  const marker = '[PURCHASE_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(details.slice(jsonStart, end + 1));
    return normalizePurchaseTransaction(parsed);
  } catch {
    return null;
  }
}

function serializePurchaseTxForSupabase(tx: PurchaseTransaction) {
  return {
    id: tx.id,
    purchaseRef: tx.purchaseRef,
    purchaseDate: tx.purchaseDate,
    entryType: tx.entryType,
    productId: tx.productId,
    productName: tx.productName,
    category: tx.category,
    barcode: tx.barcode,
    hsnCode: tx.hsnCode || '',
    unit: tx.unit,
    previousStock: tx.previousStock,
    addedQuantity: tx.addedQuantity,
    newStock: tx.newStock,
    purchasePrice: tx.purchasePrice,
    gstPercent: tx.gstPercent,
    baseAmount: tx.baseAmount,
    cgstAmount: tx.cgstAmount,
    sgstAmount: tx.sgstAmount,
    totalGstAmount: tx.totalGstAmount,
    totalAmount: tx.totalAmount,
    supplierId: tx.supplierId || '',
    supplierName: tx.supplierName || '',
    supplierInvoiceNo: tx.supplierInvoiceNo || '',
    paymentStatus: tx.paymentStatus || 'CREDIT',
    supplierNote: tx.supplierNote || '',
    batchNo: tx.batchNo || '',
    performedBy: tx.performedBy || 'SYSTEM ADMIN',
  };
}

export async function getAllPurchaseTransactions(): Promise<PurchaseTransaction[]> {
  const mergedMap = new Map<string, PurchaseTransaction>();

  for (const tx of memoryStore.purchaseTransactions) {
    const norm = normalizePurchaseTransaction(tx);
    mergedMap.set(norm.id, norm);
  }

  for (const log of memoryStore.auditLogs) {
    if (log.action === 'PURCHASE_TRANSACTION') {
      const parsed = parsePurchaseTxFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) {
        mergedMap.set(parsed.id, parsed);
      }
    }
  }

  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('purchase_transactions')
        .select('*')
        .order('purchaseDate', { ascending: false })
        .limit(2000);

      const existingInTableIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizePurchaseTransaction(row);
          mergedMap.set(norm.id, norm);
          existingInTableIds.add(norm.id);
        }
      }

      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'PURCHASE_TRANSACTION')
        .order('timestamp', { ascending: false })
        .limit(1000);

      const missingFromTable: PurchaseTransaction[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parsePurchaseTxFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) {
              mergedMap.set(parsed.id, parsed);
            }
            if (!tableErr && !existingInTableIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingInTableIds.add(parsed.id);
            }
          }
        }
      }

      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('purchase_transactions')
          .upsert(missingFromTable.map(serializePurchaseTxForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllPurchaseTransactions:', e);
    }
  }

  const sorted = Array.from(mergedMap.values()).sort((a, b) => {
    const dateCmp = String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  memoryStore.purchaseTransactions = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function addPurchaseTransaction(
  rawTx: Partial<PurchaseTransaction>
): Promise<{ success: boolean; transaction: PurchaseTransaction; syncedToCloud: boolean }> {
  const tx = normalizePurchaseTransaction(rawTx);
  const existingIdx = memoryStore.purchaseTransactions.findIndex((p) => p.id === tx.id);
  if (existingIdx >= 0) {
    memoryStore.purchaseTransactions[existingIdx] = tx;
  } else {
    memoryStore.purchaseTransactions = [tx, ...memoryStore.purchaseTransactions];
  }
  saveStoreToDisk();

  let syncedToCloud = false;
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('purchase_transactions')
        .upsert([serializePurchaseTxForSupabase(tx)]);
      if (!error) {
        syncedToCloud = true;
      } else {
        const summary = `${tx.purchaseRef} | ${tx.entryType} | +${tx.addedQuantity} ${tx.unit} "${tx.productName}" (Stock: ${tx.previousStock} -> ${tx.newStock}, Total: ₹${tx.totalAmount.toFixed(2)})`;
        await addAuditLogEntry({
          id: `audit-${tx.id}`,
          timestamp: tx.purchaseDate,
          action: 'PURCHASE_TRANSACTION',
          performedBy: tx.performedBy,
          details: `[PURCHASE_TX:${JSON.stringify(tx)}] ${summary}`,
        });
        syncedToCloud = true;
      }
    } catch (e) {
      console.error('[Supabase Error] addPurchaseTransaction:', e);
    }
  }

  if (syncedToCloud) {
    const alreadyHasAudit = memoryStore.auditLogs.some((l) => l.id === `audit-${tx.id}`);
    if (!alreadyHasAudit) {
      await addAuditLogEntry({
        id: `audit-pur-${tx.id}`,
        timestamp: tx.purchaseDate,
        action:
          tx.entryType === 'NEW_PRODUCT'
            ? 'PRODUCT_PURCHASE_ADDED'
            : 'EXISTING_STOCK_FILLED',
        performedBy: tx.performedBy,
        details: `${tx.purchaseRef}: Added +${tx.addedQuantity} ${tx.unit} to "${tx.productName}" (${tx.previousStock} -> ${tx.newStock} ${tx.unit}, ₹${tx.totalAmount.toFixed(2)}).`,
      });
    }
  }

  return { success: true, transaction: tx, syncedToCloud };
}

// ==========================================
// DATA ACCESS LAYER: GOVT GST PAYMENTS (CHALLAN PMT-06)
// ==========================================
function normalizeGstPayment(raw: Partial<GstGovtPayment> & { paymentMode?: string }): GstGovtPayment {
  const now = new Date();
  const cgst = Math.max(0, Number(raw.cgstPaid || 0));
  const sgst = Math.max(0, Number(raw.sgstPaid || 0));
  const fee = Math.max(0, Number(raw.interestOrFee || 0));
  const total =
    raw.totalPaid !== undefined && Number(raw.totalPaid) > 0
      ? Number(raw.totalPaid)
      : cgst + sgst + fee;
  const dateStr = String(raw.paymentDate || getIstDateStr(now)).slice(0, 10);
  const src = raw.paymentSource || raw.paymentMode;

  return {
    id: String(raw.id || `gstpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    challanRef: String(
      raw.challanRef || `PMT06-${dateStr.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
    ),
    paymentDate: dateStr,
    returnPeriod: String(raw.returnPeriod || dateStr.slice(0, 7)),
    cgstPaid: Number(cgst.toFixed(2)),
    sgstPaid: Number(sgst.toFixed(2)),
    interestOrFee: Number(fee.toFixed(2)),
    totalPaid: Number(total.toFixed(2)),
    paymentSource: src === 'CASH' ? 'CASH' : 'BANK_UPI',
    notes: raw.notes ? String(raw.notes) : '',
    performedBy: String(raw.performedBy || 'SYSTEM ADMIN'),
  };
}

function serializeGstPaymentForSupabase(gp: GstGovtPayment) {
  return {
    id: gp.id,
    challanRef: gp.challanRef,
    paymentDate: gp.paymentDate,
    returnPeriod: gp.returnPeriod,
    cgstPaid: gp.cgstPaid,
    sgstPaid: gp.sgstPaid,
    interestOrFee: gp.interestOrFee,
    totalPaid: gp.totalPaid,
    paymentMode: gp.paymentSource || 'BANK_UPI',
    notes: gp.notes || '',
    performedBy: gp.performedBy || 'SYSTEM ADMIN',
  };
}

function parseGstPaymentFromAuditDetails(details?: string): GstGovtPayment | null {
  if (!details) return null;
  const marker = '[GST_PAYMENT_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(details.slice(jsonStart, end + 1));
    return normalizeGstPayment(parsed);
  } catch {
    return null;
  }
}

export async function getAllGstPayments(): Promise<GstGovtPayment[]> {
  const mergedMap = new Map<string, GstGovtPayment>();

  for (const gp of memoryStore.gstPayments) {
    const norm = normalizeGstPayment(gp);
    mergedMap.set(norm.id, norm);
  }

  for (const log of memoryStore.auditLogs) {
    if (log.action === 'GST_PAYMENT_GOVT') {
      const parsed = parseGstPaymentFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) {
        mergedMap.set(parsed.id, parsed);
      }
    }
  }

  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('gst_payments')
        .select('*')
        .order('paymentDate', { ascending: false })
        .limit(1000);

      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizeGstPayment(row);
          mergedMap.set(norm.id, norm);
          existingIds.add(norm.id);
        }
      }

      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'GST_PAYMENT_GOVT')
        .order('timestamp', { ascending: false })
        .limit(500);

      const missingFromTable: GstGovtPayment[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parseGstPaymentFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) {
              mergedMap.set(parsed.id, parsed);
            }
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingIds.add(parsed.id);
            }
          }
        }
      }

      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('gst_payments')
          .upsert(missingFromTable.map(serializeGstPaymentForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllGstPayments:', e);
    }
  }

  const sorted = Array.from(mergedMap.values()).sort((a, b) => {
    const dateCmp = String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  memoryStore.gstPayments = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function addGstPayment(
  rawPayment: Partial<GstGovtPayment>
): Promise<{ success: boolean; payment: GstGovtPayment; syncedToCloud: boolean }> {
  const payment = normalizeGstPayment(rawPayment);
  const existingIdx = memoryStore.gstPayments.findIndex((p) => p.id === payment.id);
  if (existingIdx >= 0) {
    memoryStore.gstPayments[existingIdx] = payment;
  } else {
    memoryStore.gstPayments = [payment, ...memoryStore.gstPayments];
  }
  saveStoreToDisk();

  let syncedToCloud = false;
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('gst_payments')
        .upsert([serializeGstPaymentForSupabase(payment)]);
      if (!error) {
        syncedToCloud = true;
      } else {
        const summary = `${payment.challanRef} | Period: ${payment.returnPeriod} | Paid ₹${payment.totalPaid.toFixed(2)} (CGST ₹${payment.cgstPaid.toFixed(2)} + SGST ₹${payment.sgstPaid.toFixed(2)}) via ${payment.paymentSource}`;
        await addAuditLogEntry({
          id: `audit-${payment.id}`,
          timestamp: `${payment.paymentDate} ${getIstTimeStr()}`,
          action: 'GST_PAYMENT_GOVT',
          performedBy: payment.performedBy,
          details: `[GST_PAYMENT_TX:${JSON.stringify(payment)}] ${summary}`,
        });
        syncedToCloud = true;
      }
    } catch (e) {
      console.error('[Supabase Error] addGstPayment:', e);
    }
  }

  if (syncedToCloud && !memoryStore.auditLogs.some((l) => l.id === `audit-${payment.id}`)) {
    await addAuditLogEntry({
      id: `audit-gst-${payment.id}`,
      timestamp: `${payment.paymentDate} ${getIstTimeStr()}`,
      action: 'GST_GOVT_CHALLAN_PAID',
      performedBy: payment.performedBy,
      details: `${payment.challanRef}: Paid ₹${payment.totalPaid.toFixed(2)} to Govt (${payment.returnPeriod}, CGST ₹${payment.cgstPaid.toFixed(2)}, SGST ₹${payment.sgstPaid.toFixed(2)}).`,
    });
  }

  return { success: true, payment, syncedToCloud };
}

export async function deleteGstPayment(id: string): Promise<boolean> {
  memoryStore.gstPayments = memoryStore.gstPayments.filter((p) => p.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();

  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('gst_payments').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
    } catch (e) {
      console.error('[Supabase Error] deleteGstPayment:', e);
    }
  }
  return true;
}

// ==========================================
// DATA ACCESS LAYER: NON-INVENTORY ACCOUNT LEDGER VOUCHERS
// (Operating Expenses & Other Income)
// ==========================================
function normalizeAccountVoucher(
  raw: Partial<AccountLedgerVoucher> & {
    category?: string;
    partyName?: string;
    particulars?: string;
    referenceNo?: string;
  }
): AccountLedgerVoucher {
  const now = new Date();
  const allowedTypes: AccountLedgerVoucher['voucherType'][] = [
    'EXPENSE',
    'OTHER_INCOME',
    'CONTRA_CASH_TO_BANK',
    'CONTRA_BANK_TO_CASH',
    'SUPPLIER_PAYMENT',
    'MEMBER_RECEIPT',
  ];
  const voucherType: AccountLedgerVoucher['voucherType'] =
    raw.voucherType && allowedTypes.includes(raw.voucherType) ? raw.voucherType : 'EXPENSE';
  const dateStr = String(raw.voucherDate || getIstDateStr(now)).slice(0, 10);
  const prefixMap: Record<AccountLedgerVoucher['voucherType'], string> = {
    EXPENSE: 'EXP',
    OTHER_INCOME: 'INC',
    CONTRA_CASH_TO_BANK: 'CTR',
    CONTRA_BANK_TO_CASH: 'CTR',
    SUPPLIER_PAYMENT: 'PAY',
    MEMBER_RECEIPT: 'RCT',
  };
  const defaultHeadMap: Record<AccountLedgerVoucher['voucherType'], string> = {
    EXPENSE: 'Staff Salary & Wages',
    OTHER_INCOME: 'Miscellaneous Income',
    CONTRA_CASH_TO_BANK: 'Cash Deposited to Bank A/c',
    CONTRA_BANK_TO_CASH: 'Cash Withdrawn from Bank A/c',
    SUPPLIER_PAYMENT: 'Supplier Payment (Sundry Creditors)',
    MEMBER_RECEIPT: 'Member Credit Recovery (Sundry Debtors)',
  };
  const amount = Math.max(0, Number(raw.amount || 0));
  const head = raw.ledgerHead || raw.category || defaultHeadMap[voucherType];
  const payee = raw.payeeOrPayer ?? raw.partyName ?? '';
  const narr = raw.narration ?? raw.particulars ?? '';

  return {
    id: String(raw.id || `acctv-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    voucherNo: String(
      raw.voucherNo || `${prefixMap[voucherType]}-${dateStr.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`
    ),
    voucherDate: dateStr,
    voucherType,
    ledgerHead: String(head).trim(),
    amount: Number(amount.toFixed(2)),
    paymentMode: raw.paymentMode === 'BANK_UPI' ? 'BANK_UPI' : 'CASH',
    partyId: raw.partyId ? String(raw.partyId) : '',
    payeeOrPayer: String(payee).trim(),
    narration: String(narr).trim(),
    performedBy: String(raw.performedBy || 'SYSTEM ADMIN'),
  };
}

function serializeAccountVoucherForSupabase(v: AccountLedgerVoucher) {
  return {
    id: v.id,
    voucherNo: v.voucherNo,
    voucherDate: v.voucherDate,
    voucherType: v.voucherType,
    category: v.ledgerHead,
    partyId: v.partyId || '',
    partyName: v.payeeOrPayer || '',
    particulars: v.narration || v.ledgerHead || '',
    amount: v.amount,
    paymentMode: v.paymentMode,
    referenceNo: '',
    performedBy: v.performedBy || 'SYSTEM ADMIN',
  };
}

function parseAccountVoucherFromAuditDetails(details?: string): AccountLedgerVoucher | null {
  if (!details) return null;
  const marker = '[ACCOUNT_VOUCHER_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(details.slice(jsonStart, end + 1));
    return normalizeAccountVoucher(parsed);
  } catch {
    return null;
  }
}

export async function getAllAccountVouchers(): Promise<AccountLedgerVoucher[]> {
  const mergedMap = new Map<string, AccountLedgerVoucher>();

  for (const v of memoryStore.accountVouchers) {
    const norm = normalizeAccountVoucher(v);
    mergedMap.set(norm.id, norm);
  }

  for (const log of memoryStore.auditLogs) {
    if (log.action === 'ACCOUNT_LEDGER_VOUCHER') {
      const parsed = parseAccountVoucherFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) {
        mergedMap.set(parsed.id, parsed);
      }
    }
  }

  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('account_vouchers')
        .select('*')
        .order('voucherDate', { ascending: false })
        .limit(1000);

      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizeAccountVoucher(row);
          mergedMap.set(norm.id, norm);
          existingIds.add(norm.id);
        }
      }

      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'ACCOUNT_LEDGER_VOUCHER')
        .order('timestamp', { ascending: false })
        .limit(500);

      const missingFromTable: AccountLedgerVoucher[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parseAccountVoucherFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) {
              mergedMap.set(parsed.id, parsed);
            }
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingIds.add(parsed.id);
            }
          }
        }
      }

      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('account_vouchers')
          .upsert(missingFromTable.map(serializeAccountVoucherForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllAccountVouchers:', e);
    }
  }

  const sorted = Array.from(mergedMap.values()).sort((a, b) => {
    const dateCmp = String(b.voucherDate || '').localeCompare(String(a.voucherDate || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  memoryStore.accountVouchers = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function addAccountVoucher(
  rawVoucher: Partial<AccountLedgerVoucher>
): Promise<{ success: boolean; voucher: AccountLedgerVoucher; syncedToCloud: boolean }> {
  const voucher = normalizeAccountVoucher(rawVoucher);
  const existingIdx = memoryStore.accountVouchers.findIndex((v) => v.id === voucher.id);
  if (existingIdx >= 0) {
    memoryStore.accountVouchers[existingIdx] = voucher;
  } else {
    memoryStore.accountVouchers = [voucher, ...memoryStore.accountVouchers];
  }
  saveStoreToDisk();

  let syncedToCloud = false;
  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('account_vouchers')
        .upsert([serializeAccountVoucherForSupabase(voucher)]);
      if (!error) {
        syncedToCloud = true;
      } else {
        const typeLabelMap: Record<AccountLedgerVoucher['voucherType'], string> = {
          EXPENSE: 'Operating Expense',
          OTHER_INCOME: 'Other Income',
          CONTRA_CASH_TO_BANK: 'Contra (Cash to Bank)',
          CONTRA_BANK_TO_CASH: 'Contra (Bank to Cash)',
          SUPPLIER_PAYMENT: 'Supplier Payment',
          MEMBER_RECEIPT: 'Member Receipt',
        };
        const summary = `${voucher.voucherNo} | ${typeLabelMap[voucher.voucherType]}: ${voucher.ledgerHead} | ₹${voucher.amount.toFixed(2)} via ${voucher.paymentMode}${voucher.payeeOrPayer ? ` (${voucher.payeeOrPayer})` : ''}`;
        await addAuditLogEntry({
          id: `audit-${voucher.id}`,
          timestamp: `${voucher.voucherDate} ${getIstTimeStr()}`,
          action: 'ACCOUNT_LEDGER_VOUCHER',
          performedBy: voucher.performedBy,
          details: `[ACCOUNT_VOUCHER_TX:${JSON.stringify(voucher)}] ${summary}`,
        });
        syncedToCloud = true;
      }
    } catch (e) {
      console.error('[Supabase Error] addAccountVoucher:', e);
    }
  }

  if (syncedToCloud && !memoryStore.auditLogs.some((l) => l.id === `audit-${voucher.id}`)) {
    await addAuditLogEntry({
      id: `audit-vch-${voucher.id}`,
      timestamp: `${voucher.voucherDate} ${getIstTimeStr()}`,
      action:
        voucher.voucherType === 'OTHER_INCOME' ? 'OTHER_INCOME_RECORDED' : voucher.voucherType,
      performedBy: voucher.performedBy,
      details: `${voucher.voucherNo}: ${voucher.ledgerHead} ₹${voucher.amount.toFixed(2)} (${voucher.paymentMode})${voucher.payeeOrPayer ? ` - ${voucher.payeeOrPayer}` : ''}.`,
    });
  }

  return { success: true, voucher, syncedToCloud };
}

export async function deleteAccountVoucher(id: string): Promise<boolean> {
  memoryStore.accountVouchers = memoryStore.accountVouchers.filter((v) => v.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();

  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('account_vouchers').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
    } catch (e) {
      console.error('[Supabase Error] deleteAccountVoucher:', e);
    }
  }
  return true;
}

// ==========================================
// DATA ACCESS LAYER: PARTY ACCOUNTS (SUPPLIERS & MEMBERS)
// ==========================================
function normalizePartyAccount(
  raw: Partial<PartyAccount> & { partyCode?: string; balanceType?: string }
): PartyAccount {
  const partyType = raw.partyType === 'SUPPLIER' ? 'SUPPLIER' : 'MEMBER';
  const rawDisc = Number(raw.discountPercent || 0);
  const clampedDisc =
    partyType === 'MEMBER' && Number.isFinite(rawDisc)
      ? Math.max(0, Math.min(100, Number(rawDisc.toFixed(2))))
      : 0;
  const code = raw.memberCode
    ? String(raw.memberCode).trim().toUpperCase()
    : raw.memberNo
    ? String(raw.memberNo).trim().toUpperCase()
    : raw.partyCode
    ? String(raw.partyCode).trim().toUpperCase()
    : '';
  return {
    id: String(raw.id || `party-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    partyType,
    name: String(raw.name || 'Unnamed Party').trim(),
    phone: raw.phone ? String(raw.phone).trim() : '',
    gstin: raw.gstin ? String(raw.gstin).trim().toUpperCase() : '',
    address: raw.address ? String(raw.address).trim() : '',
    memberNo: raw.memberNo ? String(raw.memberNo).trim() : code,
    memberCode: code,
    discountPercent: clampedDisc,
    openingBalance: Number(Number(raw.openingBalance || 0).toFixed(2)),
    creditLimit: raw.creditLimit !== undefined ? Number(Number(raw.creditLimit).toFixed(2)) : undefined,
    isActive: raw.isActive !== false,
    createdAt: String(raw.createdAt || getIstDateStr()),
  };
}

function serializePartyAccountForSupabase(party: PartyAccount) {
  return {
    id: party.id,
    partyCode: party.memberCode || party.memberNo || party.id,
    name: party.name,
    partyType: party.partyType,
    phone: party.phone || '',
    gstin: party.gstin || '',
    address: party.address || '',
    openingBalance: party.openingBalance || 0,
    balanceType: party.partyType === 'SUPPLIER' ? 'PAYABLE' : 'RECEIVABLE',
    createdAt: party.createdAt || getIstDateStr(),
  };
}

function parsePartyAccountFromAuditDetails(details?: string): PartyAccount | null {
  if (!details) return null;
  const marker = '[PARTY_ACCOUNT_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    return normalizePartyAccount(JSON.parse(details.slice(jsonStart, end + 1)));
  } catch {
    return null;
  }
}

function mergeAuditPartyFields(existing: PartyAccount | undefined, fromAudit: PartyAccount): PartyAccount {
  if (!existing) return fromAudit;
  return normalizePartyAccount({
    ...existing,
    ...fromAudit,
    discountPercent: fromAudit.discountPercent ?? existing.discountPercent ?? 0,
    memberCode: fromAudit.memberCode || existing.memberCode || existing.memberNo || '',
  });
}

export async function getAllPartyAccounts(): Promise<PartyAccount[]> {
  const mergedMap = new Map<string, PartyAccount>();
  for (const p of memoryStore.partyAccounts) {
    const norm = normalizePartyAccount(p);
    mergedMap.set(norm.id, norm);
  }
  const seenLocalAuditIds = new Set<string>();
  for (const log of memoryStore.auditLogs) {
    if (log.action === 'PARTY_ACCOUNT_SYNC') {
      const parsed = parsePartyAccountFromAuditDetails(log.details);
      if (parsed && !seenLocalAuditIds.has(parsed.id)) {
        seenLocalAuditIds.add(parsed.id);
        mergedMap.set(parsed.id, mergeAuditPartyFields(mergedMap.get(parsed.id), parsed));
      }
    }
  }
  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('party_accounts')
        .select('*')
        .order('name', { ascending: true })
        .limit(1000);
      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizePartyAccount(row);
          const prevMem = mergedMap.get(norm.id);
          mergedMap.set(
            norm.id,
            normalizePartyAccount({
              ...norm,
              discountPercent:
                row.discountPercent !== undefined ? norm.discountPercent : prevMem?.discountPercent ?? 0,
              memberCode: norm.memberCode || prevMem?.memberCode || '',
            })
          );
          existingIds.add(norm.id);
        }
      }
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'PARTY_ACCOUNT_SYNC')
        .order('timestamp', { ascending: false })
        .limit(500);
      const missingFromTable: PartyAccount[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        const seenRemoteAuditIds = new Set<string>();
        for (const row of auditRows) {
          const parsed = parsePartyAccountFromAuditDetails(row.details);
          if (parsed && !seenRemoteAuditIds.has(parsed.id)) {
            seenRemoteAuditIds.add(parsed.id);
            const merged = mergeAuditPartyFields(mergedMap.get(parsed.id), parsed);
            mergedMap.set(parsed.id, merged);
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(merged);
              existingIds.add(parsed.id);
            }
          }
        }
      }
      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('party_accounts')
          .upsert(missingFromTable.map(serializePartyAccountForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllPartyAccounts:', e);
    }
  }
  const sorted = Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  memoryStore.partyAccounts = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function upsertPartyAccount(
  rawParty: Partial<PartyAccount>
): Promise<{ success: boolean; party: PartyAccount }> {
  const party = normalizePartyAccount(rawParty);
  const idx = memoryStore.partyAccounts.findIndex((p) => p.id === party.id);
  if (idx >= 0) memoryStore.partyAccounts[idx] = party;
  else memoryStore.partyAccounts = [party, ...memoryStore.partyAccounts];

  const syncLog: AdminAuditLog = {
    id: `audit-${party.id}`,
    timestamp: getIstDateTimeStr(),
    action: 'PARTY_ACCOUNT_SYNC',
    performedBy: 'SYSTEM ADMIN',
    details: `[PARTY_ACCOUNT_TX:${JSON.stringify(party)}] ${party.partyType}: ${party.name}`,
  };
  memoryStore.auditLogs = [
    syncLog,
    ...memoryStore.auditLogs.filter((l) => l.id !== syncLog.id),
  ];
  saveStoreToDisk();

  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('party_accounts')
        .upsert([serializePartyAccountForSupabase(party)]);
      if (error) {
        await supabase.from('party_accounts').upsert([party]);
      }
      await supabase.from('audit_logs').upsert([syncLog]);
    } catch (e) {
      console.error('[Supabase Error] upsertPartyAccount:', e);
    }
  }
  return { success: true, party };
}

export async function deletePartyAccount(id: string): Promise<boolean> {
  memoryStore.partyAccounts = memoryStore.partyAccounts.filter((p) => p.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();
  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('party_accounts').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
    } catch (e) {
      console.error('[Supabase Error] deletePartyAccount:', e);
    }
  }
  return true;
}

// ==========================================
// DATA ACCESS LAYER: SALES RETURNS (CREDIT NOTE) & PURCHASE RETURNS (DEBIT NOTE)
// ==========================================
function normalizeReturnNote(
  raw: Partial<ReturnNote> & { originalInvoiceNo?: string; unitBasePrice?: number }
): ReturnNote {
  const noteType = raw.noteType === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE';
  const dateStr = String(raw.noteDate || raw.returnDate || getIstDateStr()).slice(0, 10);
  const qty = Math.max(0, Number(raw.quantity || 0));
  const gstPct = Math.max(0, Number(raw.gstPercent || 0));
  const totalAmt = Number(Number(raw.totalAmount || 0).toFixed(2));
  const baseAmt =
    raw.baseAmount !== undefined
      ? Number(Number(raw.baseAmount).toFixed(2))
      : Number((gstPct > 0 ? totalAmt / (1 + gstPct / 100) : totalAmt).toFixed(2));
  const gstAmt = Number(Math.max(0, totalAmt - baseAmt).toFixed(2));
  const rawMode = raw.settlementMode || raw.refundMode;
  const settlementMode: ReturnNote['settlementMode'] =
    rawMode === 'BANK_UPI' ||
    rawMode === 'ADJUST_LEDGER' ||
    rawMode === 'CREDIT_LEDGER' ||
    rawMode === 'ADJUST_CREDIT'
      ? rawMode
      : 'CASH';
  return {
    id: String(raw.id || `ret-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    noteNo: String(raw.noteNo || `${noteType === 'CREDIT_NOTE' ? 'CN' : 'DN'}-${dateStr.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`),
    noteDate: dateStr,
    noteType,
    referenceNo: String(raw.referenceNo || raw.refNo || raw.originalInvoiceNo || '').trim(),
    partyId: raw.partyId ? String(raw.partyId) : '',
    partyName: String(raw.partyName || (noteType === 'CREDIT_NOTE' ? 'Walk-in Customer' : 'Supplier')).trim(),
    productId: Number(raw.productId || 0),
    productName: String(raw.productName || '').trim(),
    hsnCode: raw.hsnCode ? String(raw.hsnCode).trim() : '',
    quantity: Number(qty.toFixed(3)),
    unit: String(raw.unit || 'PCS'),
    baseAmount: baseAmt,
    gstPercent: gstPct,
    cgstAmount: raw.cgstAmount !== undefined ? Number(Number(raw.cgstAmount).toFixed(2)) : Number((gstAmt / 2).toFixed(2)),
    sgstAmount: raw.sgstAmount !== undefined ? Number(Number(raw.sgstAmount).toFixed(2)) : Number((gstAmt / 2).toFixed(2)),
    totalGstAmount: raw.totalGstAmount !== undefined ? Number(Number(raw.totalGstAmount).toFixed(2)) : gstAmt,
    totalAmount: totalAmt,
    settlementMode,
    reason: raw.reason ? String(raw.reason).trim() : '',
    performedBy: String(raw.performedBy || 'SYSTEM ADMIN'),
  };
}

function serializeReturnNoteForSupabase(note: ReturnNote) {
  const unitBase =
    note.quantity > 0 ? Number((note.baseAmount / note.quantity).toFixed(2)) : note.baseAmount;
  return {
    id: note.id,
    noteNo: note.noteNo,
    noteDate: note.noteDate || getIstDateStr(),
    noteType: note.noteType,
    originalInvoiceNo: note.referenceNo || note.refNo || '',
    partyId: note.partyId || '',
    partyName: note.partyName,
    productId: note.productId,
    productName: note.productName,
    hsnCode: note.hsnCode || '',
    quantity: note.quantity,
    unit: note.unit,
    unitBasePrice: unitBase,
    gstPercent: note.gstPercent,
    baseAmount: note.baseAmount,
    cgstAmount: note.cgstAmount,
    sgstAmount: note.sgstAmount,
    totalGstAmount: note.totalGstAmount,
    totalAmount: note.totalAmount,
    settlementMode: note.settlementMode || 'CASH',
    reason: note.reason || '',
    performedBy: note.performedBy || 'SYSTEM ADMIN',
  };
}

function parseReturnNoteFromAuditDetails(details?: string): ReturnNote | null {
  if (!details) return null;
  const marker = '[RETURN_NOTE_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    return normalizeReturnNote(JSON.parse(details.slice(jsonStart, end + 1)));
  } catch {
    return null;
  }
}

export async function getAllReturnNotes(): Promise<ReturnNote[]> {
  const mergedMap = new Map<string, ReturnNote>();
  for (const r of memoryStore.returnNotes) {
    const norm = normalizeReturnNote(r);
    mergedMap.set(norm.id, norm);
  }
  for (const log of memoryStore.auditLogs) {
    if (log.action === 'RETURN_NOTE_TX') {
      const parsed = parseReturnNoteFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
    }
  }
  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('return_notes')
        .select('*')
        .order('noteDate', { ascending: false })
        .limit(1000);
      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizeReturnNote(row);
          mergedMap.set(norm.id, norm);
          existingIds.add(norm.id);
        }
      }
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'RETURN_NOTE_TX')
        .order('timestamp', { ascending: false })
        .limit(500);
      const missingFromTable: ReturnNote[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parseReturnNoteFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingIds.add(parsed.id);
            }
          }
        }
      }
      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('return_notes')
          .upsert(missingFromTable.map(serializeReturnNoteForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllReturnNotes:', e);
    }
  }
  const sorted = Array.from(mergedMap.values()).sort((a, b) =>
    String(b.noteDate).localeCompare(String(a.noteDate)) || String(b.id).localeCompare(String(a.id))
  );
  memoryStore.returnNotes = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function addReturnNote(
  rawNote: Partial<ReturnNote>
): Promise<{ success: boolean; note: ReturnNote }> {
  const note = normalizeReturnNote(rawNote);
  const existing = memoryStore.returnNotes.find((n) => n.id === note.id);
  memoryStore.returnNotes = existing
    ? memoryStore.returnNotes.map((n) => (n.id === note.id ? note : n))
    : [note, ...memoryStore.returnNotes];

  if (!existing && note.productId > 0 && note.quantity > 0) {
    const prod = memoryStore.products.find((p) => Number(p.id) === Number(note.productId));
    if (prod) {
      const delta = note.noteType === 'CREDIT_NOTE' ? note.quantity : -note.quantity;
      const nextStock = Math.max(0, Number((Number(prod.stock) + delta).toFixed(3)));
      await updateProduct(prod.id, { stock: nextStock });
    }
  }
  saveStoreToDisk();

  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('return_notes')
        .upsert([serializeReturnNoteForSupabase(note)]);
      if (error) {
        await addAuditLogEntry({
          id: `audit-${note.id}`,
          timestamp: `${note.noteDate} ${getIstTimeStr()}`,
          action: 'RETURN_NOTE_TX',
          performedBy: note.performedBy,
          details: `[RETURN_NOTE_TX:${JSON.stringify(note)}] ${note.noteNo} ${note.noteType}: ${note.productName} (${note.quantity} ${note.unit}) ₹${note.totalAmount.toFixed(2)}`,
        });
      }
    } catch (e) {
      console.error('[Supabase Error] addReturnNote:', e);
    }
  }
  return { success: true, note };
}

export async function deleteReturnNote(id: string): Promise<boolean> {
  const existing = memoryStore.returnNotes.find((n) => n.id === id);
  if (existing && existing.productId > 0 && existing.quantity > 0) {
    const prod = memoryStore.products.find((p) => Number(p.id) === Number(existing.productId));
    if (prod) {
      const reverseDelta = existing.noteType === 'CREDIT_NOTE' ? -existing.quantity : existing.quantity;
      const nextStock = Math.max(0, Number((Number(prod.stock) + reverseDelta).toFixed(3)));
      await updateProduct(prod.id, { stock: nextStock });
    }
  }
  memoryStore.returnNotes = memoryStore.returnNotes.filter((n) => n.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();
  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('return_notes').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
    } catch (e) {
      console.error('[Supabase Error] deleteReturnNote:', e);
    }
  }
  return true;
}

// ==========================================
// DATA ACCESS LAYER: FIXED ASSETS & DEPRECIATION
// ==========================================
function unpackFixedAssetMetaFromNotes(rawNotes?: string): {
  cleanNotes: string;
  quantity?: number;
  invoiceOrBillNo?: string;
  supplierName?: string;
  location?: string;
  serialNumber?: string;
  status?: 'ACTIVE' | 'UNDER_REPAIR' | 'DISPOSED';
} {
  if (!rawNotes) return { cleanNotes: '' };
  const text = String(rawNotes).trim();
  const metaRegex = /^\[FA_META:(\{.*?\})\]\s*(.*)$/s;
  const match = text.match(metaRegex);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const remainder = (match[2] || '').trim();
      // Strip auto-summary prefix if present before " — "
      const dashIdx = remainder.indexOf(' — ');
      const userRemarks =
        parsed.userNotes !== undefined
          ? String(parsed.userNotes)
          : dashIdx >= 0
          ? remainder.slice(dashIdx + 3).trim()
          : remainder;
      return {
        cleanNotes: userRemarks,
        quantity: parsed.quantity ? Number(parsed.quantity) : undefined,
        invoiceOrBillNo: parsed.invoiceOrBillNo ? String(parsed.invoiceOrBillNo) : undefined,
        supplierName: parsed.supplierName ? String(parsed.supplierName) : undefined,
        location: parsed.location ? String(parsed.location) : undefined,
        serialNumber: parsed.serialNumber ? String(parsed.serialNumber) : undefined,
        status:
          parsed.status === 'UNDER_REPAIR' || parsed.status === 'DISPOSED'
            ? parsed.status
            : 'ACTIVE',
      };
    } catch {
      return { cleanNotes: text };
    }
  }

  // Also parse clean pipe-delimited notes e.g. "Qty: 2 | Bill: INV-01 | Vendor: ABC | Loc: Counter-1 | S/N: 123 | Status: ACTIVE — Remarks"
  const parts = text.split(' — ');
  const headerPart = parts[0] || '';
  if (
    headerPart.includes('Bill:') ||
    headerPart.includes('Vendor:') ||
    headerPart.includes('Loc:') ||
    headerPart.includes('S/N:') ||
    headerPart.includes('Qty:')
  ) {
    const tokens = headerPart.split('|').map((t) => t.trim());
    let quantity: number | undefined;
    let invoiceOrBillNo: string | undefined;
    let supplierName: string | undefined;
    let location: string | undefined;
    let serialNumber: string | undefined;
    let status: 'ACTIVE' | 'UNDER_REPAIR' | 'DISPOSED' | undefined;

    for (const tok of tokens) {
      if (tok.startsWith('Qty:')) quantity = Math.max(1, Number(tok.slice(4).trim()) || 1);
      else if (tok.startsWith('Bill:')) invoiceOrBillNo = tok.slice(5).trim();
      else if (tok.startsWith('Vendor:')) supplierName = tok.slice(7).trim();
      else if (tok.startsWith('Loc:')) location = tok.slice(4).trim();
      else if (tok.startsWith('S/N:')) serialNumber = tok.slice(4).trim();
      else if (tok.startsWith('Status:')) {
        const st = tok.slice(7).trim();
        if (st === 'UNDER_REPAIR' || st === 'DISPOSED' || st === 'ACTIVE') status = st;
      }
    }
    return {
      cleanNotes: parts.slice(1).join(' — ').trim(),
      quantity,
      invoiceOrBillNo,
      supplierName,
      location,
      serialNumber,
      status,
    };
  }

  return { cleanNotes: text };
}

function packFixedAssetNotesForSupabase(asset: FixedAsset): string {
  const summaryTokens: string[] = [];
  if (asset.quantity && asset.quantity > 1) summaryTokens.push(`Qty: ${asset.quantity}`);
  if (asset.invoiceOrBillNo) summaryTokens.push(`Bill: ${asset.invoiceOrBillNo}`);
  if (asset.supplierName) summaryTokens.push(`Vendor: ${asset.supplierName}`);
  if (asset.location) summaryTokens.push(`Loc: ${asset.location}`);
  if (asset.serialNumber) summaryTokens.push(`S/N: ${asset.serialNumber}`);
  if (asset.status && asset.status !== 'ACTIVE') summaryTokens.push(`Status: ${asset.status}`);

  const cleanRemarks = (asset.notes || '').trim();
  if (summaryTokens.length === 0) {
    return cleanRemarks;
  }
  const header = summaryTokens.join(' | ');
  return cleanRemarks ? `${header} — ${cleanRemarks}` : header;
}

function normalizeFixedAsset(
  raw: Partial<FixedAsset> & {
    acquisitionDate?: string;
    depreciationPercent?: number;
    paymentMode?: string;
  }
): FixedAsset {
  const id = String(raw.id || `asset-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  const unpacked = unpackFixedAssetMetaFromNotes(raw.notes);
  const costVal = Math.max(0, Number(Number(raw.costValue ?? raw.purchaseCost ?? 0).toFixed(2)));
  const depRate = Math.max(
    0,
    Math.min(
      100,
      Number(
        raw.depreciationRatePct ??
          raw.depreciationRatePercent ??
          raw.depreciationRate ??
          raw.depreciationPercent ??
          10
      )
    )
  );
  const accumVal = Math.max(
    0,
    Number(Number(raw.accumulatedDepreciation ?? raw.accumulatedDep ?? 0).toFixed(2))
  );
  const openWdv = Math.max(0, Number((costVal - accumVal).toFixed(2)));
  const periodDep = Number(((openWdv * depRate) / 100).toFixed(2));
  const computedNetBook = Math.max(0, Number((openWdv - periodDep).toFixed(2)));

  const src = String(raw.fundingSource || raw.paymentMode || 'CAPITAL_OPENING').toUpperCase();
  const fundingSource: FixedAsset['fundingSource'] =
    src === 'CASH' ? 'CASH' : src === 'BANK_UPI' ? 'BANK_UPI' : 'CAPITAL_OPENING';

  const dateStr = String(raw.purchaseDate || raw.acquisitionDate || getIstDateStr()).slice(0, 10);
  const rawCode = String(raw.assetCode || '').trim();
  const fallbackSuffix = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || '0001';
  const assetCode = rawCode || `FA-${dateStr.slice(0, 4)}-${fallbackSuffix}`;

  return {
    id,
    assetCode,
    assetName: String(raw.assetName || 'Society Fixed Asset').trim(),
    category: String(raw.category || 'Equipment').trim(),
    purchaseDate: dateStr,
    acquisitionDate: dateStr,
    costValue: costVal,
    purchaseCost: costVal,
    depreciationRate: depRate,
    depreciationRatePercent: depRate,
    depreciationRatePct: depRate,
    depreciationPercent: depRate,
    accumulatedDep: accumVal,
    accumulatedDepreciation: accumVal,
    netBookValue:
      raw.netBookValue !== undefined && Number(raw.netBookValue) >= 0
        ? Number(Number(raw.netBookValue).toFixed(2))
        : computedNetBook,
    fundingSource,
    paymentMode: fundingSource,
    quantity: Math.max(1, Number(raw.quantity ?? unpacked.quantity ?? 1) || 1),
    invoiceOrBillNo: String(raw.invoiceOrBillNo ?? unpacked.invoiceOrBillNo ?? '').trim(),
    supplierName: String(raw.supplierName ?? unpacked.supplierName ?? '').trim(),
    location: String(raw.location ?? unpacked.location ?? '').trim(),
    serialNumber: String(raw.serialNumber ?? unpacked.serialNumber ?? '').trim(),
    status:
      raw.status === 'UNDER_REPAIR' || raw.status === 'DISPOSED'
        ? raw.status
        : unpacked.status || 'ACTIVE',
    notes: unpacked.cleanNotes,
  };
}

function serializeFixedAssetForSupabase(asset: FixedAsset) {
  const cost = Number(asset.costValue ?? asset.purchaseCost ?? 0);
  const accum = Number(asset.accumulatedDepreciation ?? asset.accumulatedDep ?? 0);
  const rate = Number(
    asset.depreciationRatePct ??
      asset.depreciationPercent ??
      asset.depreciationRate ??
      10
  );
  const openWdv = Math.max(0, Number((cost - accum).toFixed(2)));
  const periodDep = Number(((openWdv * rate) / 100).toFixed(2));
  const closingNetBook = Math.max(0, Number((openWdv - periodDep).toFixed(2)));

  return {
    id: asset.id,
    assetCode: (asset.assetCode || asset.id).toUpperCase(),
    assetName: asset.assetName,
    category: asset.category,
    acquisitionDate: asset.purchaseDate || asset.acquisitionDate || getIstDateStr(),
    costValue: cost,
    depreciationPercent: rate,
    accumulatedDepreciation: accum,
    netBookValue: closingNetBook,
    paymentMode: asset.fundingSource || asset.paymentMode || 'CAPITAL_OPENING',
    notes: packFixedAssetNotesForSupabase(asset),
  };
}

function parseFixedAssetFromAuditDetails(details?: string): FixedAsset | null {
  if (!details) return null;
  const marker = '[FIXED_ASSET_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    return normalizeFixedAsset(JSON.parse(details.slice(jsonStart, end + 1)));
  } catch {
    return null;
  }
}

export async function getAllFixedAssets(): Promise<FixedAsset[]> {
  const mergedMap = new Map<string, FixedAsset>();
  for (const a of memoryStore.fixedAssets) {
    const norm = normalizeFixedAsset(a);
    mergedMap.set(norm.id, norm);
  }
  for (const log of memoryStore.auditLogs) {
    if (log.action === 'FIXED_ASSET_SYNC') {
      const parsed = parseFixedAssetFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
    }
  }
  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('fixed_assets')
        .select('*')
        .order('acquisitionDate', { ascending: false })
        .limit(1000);
      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        // When table query succeeds, use authoritative rows from Supabase fixed_assets table
        mergedMap.clear();
        for (const row of tableRows) {
          const norm = normalizeFixedAsset(row);
          mergedMap.set(norm.id, norm);
          existingIds.add(norm.id);
        }
      }
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'FIXED_ASSET_SYNC')
        .order('timestamp', { ascending: false })
        .limit(300);
      const missingFromTable: FixedAsset[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parseFixedAssetFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingIds.add(parsed.id);
            }
          }
        }
      }
      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('fixed_assets')
          .upsert(missingFromTable.map(serializeFixedAssetForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllFixedAssets:', e);
    }
  }
  const sorted = Array.from(mergedMap.values()).sort((a, b) =>
    String(b.purchaseDate).localeCompare(String(a.purchaseDate))
  );
  memoryStore.fixedAssets = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function upsertFixedAsset(
  rawAsset: Partial<FixedAsset>
): Promise<{ success: boolean; asset: FixedAsset; syncedToCloud?: boolean; error?: string }> {
  const isUpdate = Boolean(
    rawAsset.id && memoryStore.fixedAssets.some((a) => a.id === rawAsset.id)
  );
  const asset = normalizeFixedAsset(rawAsset);
  const idx = memoryStore.fixedAssets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) memoryStore.fixedAssets[idx] = asset;
  else memoryStore.fixedAssets = [asset, ...memoryStore.fixedAssets];
  saveStoreToDisk();

  let syncedToCloud = false;
  if (supabase && supabaseStatus.connected) {
    try {
      const payload = serializeFixedAssetForSupabase(asset);
      const { error } = await supabase.from('fixed_assets').upsert([payload]);
      if (!error) {
        syncedToCloud = true;
        await addAuditLogEntry({
          id: `audit-fa-${asset.id}-${Date.now()}`,
          timestamp: `${getIstDateStr()} ${getIstTimeStr()}`,
          action: isUpdate ? 'FIXED_ASSET_UPDATED' : 'FIXED_ASSET_REGISTERED',
          performedBy: 'SYSTEM ADMIN',
          details: `${asset.assetCode}: ${asset.assetName} (${asset.category}) | Cost ₹${Number(asset.costValue || 0).toFixed(2)}, Depr ${asset.depreciationRatePct}%, Net Value ₹${Number(payload.netBookValue).toFixed(2)}`,
        });
      } else {
        console.error('[Supabase Error] upsertFixedAsset table error:', error.message);
        await addAuditLogEntry({
          id: `audit-${asset.id}`,
          timestamp: `${asset.purchaseDate} ${getIstTimeStr()}`,
          action: 'FIXED_ASSET_SYNC',
          performedBy: 'SYSTEM ADMIN',
          details: `[FIXED_ASSET_TX:${JSON.stringify(asset)}] ${asset.assetName} ₹${Number(asset.costValue || 0).toFixed(2)}`,
        });
      }
    } catch (e: any) {
      console.error('[Supabase Error] upsertFixedAsset:', e);
    }
  }
  return { success: true, asset, syncedToCloud };
}

export async function deleteFixedAsset(id: string): Promise<boolean> {
  const existing = memoryStore.fixedAssets.find((a) => a.id === id);
  memoryStore.fixedAssets = memoryStore.fixedAssets.filter((a) => a.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();
  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('fixed_assets').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
      if (existing) {
        await addAuditLogEntry({
          id: `audit-fa-del-${id}-${Date.now()}`,
          timestamp: `${getIstDateStr()} ${getIstTimeStr()}`,
          action: 'FIXED_ASSET_DELETED',
          performedBy: 'SYSTEM ADMIN',
          details: `Removed fixed asset ${existing.assetCode || id}: "${existing.assetName}" (Cost ₹${Number(existing.costValue || 0).toFixed(2)}) from Supabase fixed_assets table.`,
        });
      }
    } catch (e) {
      console.error('[Supabase Error] deleteFixedAsset:', e);
    }
  }
  return true;
}

// ==========================================
// DATA ACCESS LAYER: DAILY DRAWER Z-REPORT CLOSINGS
// ==========================================
function normalizeDrawerClosing(
  raw: Partial<DailyDrawerClosing> & {
    systemExpectedCash?: number;
    physicalCountedCash?: number;
    varianceAmount?: number;
  }
): DailyDrawerClosing {
  const dateStr = String(raw.closingDate || getIstDateStr()).slice(0, 10);
  const expected = Number(Number(raw.expectedCash ?? raw.systemExpectedCash ?? 0).toFixed(2));
  const counted = Number(
    Number(
      raw.physicalCashCounted ??
        raw.physicalCountedCash ??
        raw.actualCountedCash ??
        raw.countedCash ??
        0
    ).toFixed(2)
  );
  const variance =
    raw.variance !== undefined
      ? Number(Number(raw.variance).toFixed(2))
      : raw.varianceAmount !== undefined
      ? Number(Number(raw.varianceAmount).toFixed(2))
      : Number((counted - expected).toFixed(2));
  return {
    id: String(raw.id || `zrep-${dateStr}-${Date.now().toString().slice(-4)}`),
    closingDate: dateStr,
    closedAt: String(raw.closedAt || raw.createdAt || getIstDateTimeStr()),
    closedBy: String(raw.closedBy || raw.cashierName || 'Cashier'),
    openingFloat: Number(Number(raw.openingFloat || 0).toFixed(2)),
    cashSalesTotal: Number(Number(raw.cashSalesTotal ?? raw.cashSales ?? 0).toFixed(2)),
    upiSalesTotal: Number(Number(raw.upiSalesTotal ?? raw.upiSales ?? 0).toFixed(2)),
    cashInflowsTotal: Number(Number(raw.cashInflowsTotal ?? raw.cashInflows ?? 0).toFixed(2)),
    cashOutflowsTotal: Number(Number(raw.cashOutflowsTotal ?? raw.cashOutflows ?? 0).toFixed(2)),
    expectedCash: expected,
    physicalCashCounted: counted,
    variance,
    denominations: raw.denominations && typeof raw.denominations === 'object' ? raw.denominations : {},
    notes: raw.notes || raw.remarks ? String(raw.notes || raw.remarks).trim() : '',
  };
}

function serializeDrawerClosingForSupabase(closing: DailyDrawerClosing) {
  return {
    id: closing.id,
    closingDate: closing.closingDate,
    systemExpectedCash: closing.expectedCash ?? 0,
    physicalCountedCash: closing.physicalCashCounted ?? 0,
    varianceAmount: closing.variance ?? 0,
    denominations: closing.denominations || {},
    closedBy: closing.closedBy || 'Cashier',
    closedAt: closing.closedAt || getIstDateTimeStr(),
    notes: closing.notes || '',
  };
}

function parseDrawerClosingFromAuditDetails(details?: string): DailyDrawerClosing | null {
  if (!details) return null;
  const marker = '[DRAWER_CLOSING_TX:';
  const start = details.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  const end = details.indexOf('}]', jsonStart);
  if (end === -1) return null;
  try {
    return normalizeDrawerClosing(JSON.parse(details.slice(jsonStart, end + 1)));
  } catch {
    return null;
  }
}

export async function getAllDrawerClosings(): Promise<DailyDrawerClosing[]> {
  const mergedMap = new Map<string, DailyDrawerClosing>();
  for (const dc of memoryStore.drawerClosings) {
    const norm = normalizeDrawerClosing(dc);
    mergedMap.set(norm.id, norm);
  }
  for (const log of memoryStore.auditLogs) {
    if (log.action === 'DRAWER_CLOSING_TX') {
      const parsed = parseDrawerClosingFromAuditDetails(log.details);
      if (parsed && !mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
    }
  }
  if (supabase && supabaseStatus.connected) {
    try {
      const { data: tableRows, error: tableErr } = await supabase
        .from('drawer_closings')
        .select('*')
        .order('closingDate', { ascending: false })
        .limit(500);
      const existingIds = new Set<string>();
      if (!tableErr && Array.isArray(tableRows)) {
        for (const row of tableRows) {
          const norm = normalizeDrawerClosing(row);
          mergedMap.set(norm.id, norm);
          existingIds.add(norm.id);
        }
      }
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'DRAWER_CLOSING_TX')
        .order('timestamp', { ascending: false })
        .limit(300);
      const missingFromTable: DailyDrawerClosing[] = [];
      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const parsed = parseDrawerClosingFromAuditDetails(row.details);
          if (parsed) {
            if (!mergedMap.has(parsed.id)) mergedMap.set(parsed.id, parsed);
            if (!tableErr && !existingIds.has(parsed.id)) {
              missingFromTable.push(parsed);
              existingIds.add(parsed.id);
            }
          }
        }
      }
      if (!tableErr && missingFromTable.length > 0) {
        await supabase
          .from('drawer_closings')
          .upsert(missingFromTable.map(serializeDrawerClosingForSupabase))
          .then(() => null, () => null);
      }
    } catch (e) {
      console.error('[Supabase Error] getAllDrawerClosings:', e);
    }
  }
  const sorted = Array.from(mergedMap.values()).sort((a, b) =>
    String(b.closingDate).localeCompare(String(a.closingDate)) || String(b.closedAt || '').localeCompare(String(a.closedAt || ''))
  );
  memoryStore.drawerClosings = sorted;
  saveStoreToDisk();
  return sorted;
}

export async function addDrawerClosing(
  rawClosing: Partial<DailyDrawerClosing>
): Promise<{ success: boolean; closing: DailyDrawerClosing }> {
  const closing = normalizeDrawerClosing(rawClosing);
  const idx = memoryStore.drawerClosings.findIndex((c) => c.id === closing.id);
  if (idx >= 0) memoryStore.drawerClosings[idx] = closing;
  else memoryStore.drawerClosings = [closing, ...memoryStore.drawerClosings];
  saveStoreToDisk();

  if (supabase && supabaseStatus.connected) {
    try {
      const { error } = await supabase
        .from('drawer_closings')
        .upsert([serializeDrawerClosingForSupabase(closing)]);
      if (error) {
        await addAuditLogEntry({
          id: `audit-${closing.id}`,
          timestamp: `${closing.closingDate} ${getIstTimeStr()}`,
          action: 'DRAWER_CLOSING_TX',
          performedBy: closing.closedBy || 'Cashier',
          details: `[DRAWER_CLOSING_TX:${JSON.stringify(closing)}] Z-Report ${closing.closingDate}: Expected ₹${Number(closing.expectedCash || 0).toFixed(2)}, Counted ₹${Number(closing.physicalCashCounted || 0).toFixed(2)}, Diff ₹${Number(closing.variance || 0).toFixed(2)}`,
        });
      }
    } catch (e) {
      console.error('[Supabase Error] addDrawerClosing:', e);
    }
  }
  return { success: true, closing };
}

export async function deleteDrawerClosing(id: string): Promise<boolean> {
  memoryStore.drawerClosings = memoryStore.drawerClosings.filter((c) => c.id !== id);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((l) => l.id !== `audit-${id}`);
  saveStoreToDisk();
  if (supabase && supabaseStatus.connected) {
    try {
      await supabase.from('drawer_closings').delete().eq('id', id);
      await supabase.from('audit_logs').delete().eq('id', `audit-${id}`);
    } catch (e) {
      console.error('[Supabase Error] deleteDrawerClosing:', e);
    }
  }
  return true;
}

// ==========================================
// DATABASE BACKUP, SNAPSHOTS & RESTORE
// ==========================================
export interface FullBackupPayload {
  version: string;
  society: string;
  source: string;
  exportedAt: string;
  counts: {
    products: number;
    ledger: number;
    cashiers: number;
    categories: number;
    auditLogs: number;
    loosePackets: number;
    purchaseTransactions?: number;
    gstPayments?: number;
    accountVouchers?: number;
    partyAccounts?: number;
    returnNotes?: number;
    fixedAssets?: number;
    drawerClosings?: number;
  };
  products: Product[];
  ledger: SaleTransactionItem[];
  cashiers: CashierUser[];
  settings: AdminStoreSettings;
  categories: string[];
  auditLogs: AdminAuditLog[];
  loosePackets: LoosePacket[];
  purchaseTransactions?: PurchaseTransaction[];
  gstPayments?: GstGovtPayment[];
  accountVouchers?: AccountLedgerVoucher[];
  partyAccounts?: PartyAccount[];
  returnNotes?: ReturnNote[];
  fixedAssets?: FixedAsset[];
  drawerClosings?: DailyDrawerClosing[];
}

export async function exportFullDatabaseBackup(): Promise<FullBackupPayload> {
  const [
    products,
    ledger,
    cashiers,
    settings,
    categories,
    auditLogs,
    loosePackets,
    purchaseTransactions,
    gstPayments,
    accountVouchers,
    partyAccounts,
    returnNotes,
    fixedAssets,
    drawerClosings,
  ] = await Promise.all([
    getAllProducts(),
    getAllLedger(),
    getAllCashiers(),
    getAdminSettings(),
    getAllCategories(),
    getAllAuditLogs(),
    getAllLoosePackets(),
    getAllPurchaseTransactions(),
    getAllGstPayments(),
    getAllAccountVouchers(),
    getAllPartyAccounts(),
    getAllReturnNotes(),
    getAllFixedAssets(),
    getAllDrawerClosings(),
  ]);

  return {
    version: '3.0',
    society: 'Deganga CADPFSCS Ltd',
    source: 'Supabase PostgreSQL',
    exportedAt: new Date().toISOString(),
    counts: {
      products: products.length,
      ledger: ledger.length,
      cashiers: cashiers.length,
      categories: categories.length,
      auditLogs: auditLogs.length,
      loosePackets: loosePackets.length,
      purchaseTransactions: purchaseTransactions.length,
      gstPayments: gstPayments.length,
      accountVouchers: accountVouchers.length,
      partyAccounts: partyAccounts.length,
      returnNotes: returnNotes.length,
      fixedAssets: fixedAssets.length,
      drawerClosings: drawerClosings.length,
    },
    products,
    ledger,
    cashiers,
    settings,
    categories,
    auditLogs,
    loosePackets,
    purchaseTransactions,
    gstPayments,
    accountVouchers,
    partyAccounts,
    returnNotes,
    fixedAssets,
    drawerClosings,
  };
}

function sqlEscape(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

export async function exportFullDatabaseSql(): Promise<string> {
  const backup = await exportFullDatabaseBackup();
  const lines: string[] = [
    `-- ==========================================================`,
    `-- Deganga CADPFSCS Ltd - Full Database SQL Backup`,
    `-- Exported At: ${backup.exportedAt}`,
    `-- Source: ${backup.source}`,
    `-- ==========================================================`,
    ``,
  ];

  if (backup.categories.length > 0) {
    lines.push(`-- Categories (${backup.categories.length})`);
    for (const name of backup.categories) {
      lines.push(`INSERT INTO categories (name) VALUES (${sqlEscape(name)}) ON CONFLICT (name) DO NOTHING;`);
    }
    lines.push('');
  }

  if (backup.products.length > 0) {
    lines.push(`-- Products (${backup.products.length})`);
    for (const p of backup.products) {
      lines.push(
        `INSERT INTO products (id, name, category, barcode, "hsnCode", unit, "sellingPrice", "costPrice", "sellingPriceWD", "gstPercent", "sellingPriceWithGst", stock, "minStockLevel", "batchNo", "expiryDate", image, description, featured) VALUES (${sqlEscape(p.id)}, ${sqlEscape(p.name)}, ${sqlEscape(p.category)}, ${sqlEscape(p.barcode)}, ${sqlEscape(p.hsnCode || '')}, ${sqlEscape(p.unit)}, ${sqlEscape(p.sellingPrice)}, ${sqlEscape(p.costPrice)}, ${sqlEscape(p.sellingPriceWD ?? p.sellingPrice)}, ${sqlEscape(p.gstPercent ?? 0)}, ${sqlEscape(p.sellingPriceWithGst ?? p.sellingPrice)}, ${sqlEscape(p.stock)}, ${sqlEscape(p.minStockLevel)}, ${sqlEscape(p.batchNo)}, ${sqlEscape(p.expiryDate || '')}, ${sqlEscape(p.image || '')}, ${sqlEscape(p.description || '')}, ${sqlEscape(Boolean(p.featured))}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, barcode = EXCLUDED.barcode, "hsnCode" = EXCLUDED."hsnCode", unit = EXCLUDED.unit, "sellingPrice" = EXCLUDED."sellingPrice", "costPrice" = EXCLUDED."costPrice", "sellingPriceWD" = EXCLUDED."sellingPriceWD", "gstPercent" = EXCLUDED."gstPercent", "sellingPriceWithGst" = EXCLUDED."sellingPriceWithGst", stock = EXCLUDED.stock, "minStockLevel" = EXCLUDED."minStockLevel", "batchNo" = EXCLUDED."batchNo", "expiryDate" = EXCLUDED."expiryDate";`
      );
    }
    lines.push('');
  }

  if (backup.cashiers.length > 0) {
    lines.push(`-- Cashiers (${backup.cashiers.length})`);
    for (const c of backup.cashiers) {
      lines.push(
        `INSERT INTO cashiers (id, "loginId", "passwordHash", name, "staffCode", role, "assignedCounter", "isActive", "createdAt", "lastLogin") VALUES (${sqlEscape(c.id)}, ${sqlEscape(c.loginId)}, ${sqlEscape(c.passwordHash)}, ${sqlEscape(c.name)}, ${sqlEscape(c.staffCode)}, ${sqlEscape(c.role)}, ${sqlEscape(c.assignedCounter)}, ${sqlEscape(c.isActive !== false)}, ${sqlEscape(c.createdAt || '')}, ${sqlEscape(c.lastLogin || null)}) ON CONFLICT (id) DO UPDATE SET "loginId" = EXCLUDED."loginId", "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, "staffCode" = EXCLUDED."staffCode", role = EXCLUDED.role, "assignedCounter" = EXCLUDED."assignedCounter", "isActive" = EXCLUDED."isActive";`
      );
    }
    lines.push('');
  }

  const dbSettings = serializeAdminSettingsForDb(backup.settings);
  lines.push(`-- Admin Settings`);
  lines.push(
    `INSERT INTO admin_settings (id, "transactionsEnabled", "upiPaymentsEnabled", "cashPaymentsEnabled", "memberDiscountPercent", "emergencyNotice", "haltReason") VALUES (1, ${sqlEscape(dbSettings.transactionsEnabled)}, ${sqlEscape(dbSettings.upiPaymentsEnabled)}, ${sqlEscape(dbSettings.cashPaymentsEnabled)}, ${sqlEscape(dbSettings.memberDiscountPercent)}, ${sqlEscape(dbSettings.emergencyNotice)}, ${sqlEscape(dbSettings.haltReason)}) ON CONFLICT (id) DO UPDATE SET "transactionsEnabled" = EXCLUDED."transactionsEnabled", "upiPaymentsEnabled" = EXCLUDED."upiPaymentsEnabled", "cashPaymentsEnabled" = EXCLUDED."cashPaymentsEnabled", "memberDiscountPercent" = EXCLUDED."memberDiscountPercent", "emergencyNotice" = EXCLUDED."emergencyNotice", "haltReason" = EXCLUDED."haltReason";`
  );
  lines.push('');

  if (backup.ledger.length > 0) {
    lines.push(`-- Sale Transactions (${backup.ledger.length})`);
    for (const l of backup.ledger) {
      lines.push(
        `INSERT INTO sale_transactions ("saleItemId", "saleId", "invoiceNo", "saleDate", "customerName", "paymentMode", "productId", "productName", barcode, quantity, "unitType", "sellingPrice", "lineTotal", "cashierName") VALUES (${sqlEscape(l.saleItemId)}, ${sqlEscape(l.saleId)}, ${sqlEscape(l.invoiceNo)}, ${sqlEscape(l.saleDate)}, ${sqlEscape(l.customerName)}, ${sqlEscape(l.paymentMode)}, ${sqlEscape(l.productId)}, ${sqlEscape(l.productName)}, ${sqlEscape(l.barcode)}, ${sqlEscape(l.quantity)}, ${sqlEscape(l.unitType)}, ${sqlEscape(l.sellingPrice)}, ${sqlEscape(l.lineTotal)}, ${sqlEscape(l.cashierName || 'Society Administrator')}) ON CONFLICT ("saleItemId") DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.auditLogs.length > 0) {
    lines.push(`-- Audit Logs (${backup.auditLogs.length})`);
    for (const a of backup.auditLogs) {
      lines.push(
        `INSERT INTO audit_logs (id, timestamp, action, "performedBy", details) VALUES (${sqlEscape(a.id)}, ${sqlEscape(a.timestamp)}, ${sqlEscape(a.action)}, ${sqlEscape(a.performedBy)}, ${sqlEscape(a.details)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.loosePackets.length > 0) {
    lines.push(`-- Loose Packets (${backup.loosePackets.length})`);
    for (const lp of backup.loosePackets) {
      lines.push(
        `INSERT INTO loose_packets (id, "productId", "productName", "baseBarcode", "uniqueBarcode", "measuredGramsOrMl", "weightText", "quantityInBaseUnit", "unitPrice", "calculatedPrice", unit, "createdAt", status, "soldAtInvoiceNo", "soldDate") VALUES (${sqlEscape(lp.id)}, ${sqlEscape(lp.productId)}, ${sqlEscape(lp.productName)}, ${sqlEscape(lp.baseBarcode)}, ${sqlEscape(lp.uniqueBarcode)}, ${sqlEscape(lp.measuredGramsOrMl)}, ${sqlEscape(lp.weightText)}, ${sqlEscape(lp.quantityInBaseUnit)}, ${sqlEscape(lp.unitPrice)}, ${sqlEscape(lp.calculatedPrice)}, ${sqlEscape(lp.unit)}, ${sqlEscape(lp.createdAt)}, ${sqlEscape(lp.status)}, ${sqlEscape(lp.soldAtInvoiceNo || null)}, ${sqlEscape(lp.soldDate || null)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.purchaseTransactions && backup.purchaseTransactions.length > 0) {
    lines.push(`-- Purchase Transactions (${backup.purchaseTransactions.length})`);
    for (const pt of backup.purchaseTransactions) {
      lines.push(
        `INSERT INTO purchase_transactions (id, "purchaseRef", "purchaseDate", "entryType", "productId", "productName", category, barcode, "hsnCode", unit, "previousStock", "addedQuantity", "newStock", "purchasePrice", "gstPercent", "baseAmount", "cgstAmount", "sgstAmount", "totalGstAmount", "totalAmount", "supplierId", "supplierName", "supplierInvoiceNo", "paymentStatus", "supplierNote", "batchNo", "expiryDate", "performedBy") VALUES (${sqlEscape(pt.id)}, ${sqlEscape(pt.purchaseRef)}, ${sqlEscape(pt.purchaseDate)}, ${sqlEscape(pt.entryType)}, ${sqlEscape(pt.productId)}, ${sqlEscape(pt.productName)}, ${sqlEscape(pt.category)}, ${sqlEscape(pt.barcode)}, ${sqlEscape(pt.hsnCode || '')}, ${sqlEscape(pt.unit)}, ${sqlEscape(pt.previousStock)}, ${sqlEscape(pt.addedQuantity)}, ${sqlEscape(pt.newStock)}, ${sqlEscape(pt.purchasePrice)}, ${sqlEscape(pt.gstPercent)}, ${sqlEscape(pt.baseAmount)}, ${sqlEscape(pt.cgstAmount)}, ${sqlEscape(pt.sgstAmount)}, ${sqlEscape(pt.totalGstAmount)}, ${sqlEscape(pt.totalAmount)}, ${sqlEscape(pt.supplierId || '')}, ${sqlEscape(pt.supplierName || '')}, ${sqlEscape(pt.supplierInvoiceNo || '')}, ${sqlEscape(pt.paymentStatus || 'CREDIT')}, ${sqlEscape(pt.supplierNote || '')}, ${sqlEscape(pt.batchNo || '')}, ${sqlEscape(pt.expiryDate || '')}, ${sqlEscape(pt.performedBy)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.gstPayments && backup.gstPayments.length > 0) {
    lines.push(`-- GST Govt Payments (${backup.gstPayments.length})`);
    for (const gp of backup.gstPayments) {
      lines.push(
        `INSERT INTO gst_payments (id, "challanRef", "paymentDate", "returnPeriod", "cgstPaid", "sgstPaid", "interestOrFee", "totalPaid", "paymentSource", notes, "performedBy") VALUES (${sqlEscape(gp.id)}, ${sqlEscape(gp.challanRef)}, ${sqlEscape(gp.paymentDate)}, ${sqlEscape(gp.returnPeriod)}, ${sqlEscape(gp.cgstPaid)}, ${sqlEscape(gp.sgstPaid)}, ${sqlEscape(gp.interestOrFee)}, ${sqlEscape(gp.totalPaid)}, ${sqlEscape(gp.paymentSource)}, ${sqlEscape(gp.notes || '')}, ${sqlEscape(gp.performedBy)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.accountVouchers && backup.accountVouchers.length > 0) {
    lines.push(`-- Account Ledger Vouchers (${backup.accountVouchers.length})`);
    for (const av of backup.accountVouchers) {
      lines.push(
        `INSERT INTO account_vouchers (id, "voucherNo", "voucherDate", "voucherType", "ledgerHead", amount, "paymentMode", "partyId", "payeeOrPayer", narration, "performedBy") VALUES (${sqlEscape(av.id)}, ${sqlEscape(av.voucherNo)}, ${sqlEscape(av.voucherDate)}, ${sqlEscape(av.voucherType)}, ${sqlEscape(av.ledgerHead)}, ${sqlEscape(av.amount)}, ${sqlEscape(av.paymentMode)}, ${sqlEscape(av.partyId || '')}, ${sqlEscape(av.payeeOrPayer || '')}, ${sqlEscape(av.narration || '')}, ${sqlEscape(av.performedBy)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.partyAccounts && backup.partyAccounts.length > 0) {
    lines.push(`-- Party Accounts (${backup.partyAccounts.length})`);
    for (const pa of backup.partyAccounts) {
      lines.push(
        `INSERT INTO party_accounts (id, "partyType", name, phone, gstin, address, "memberNo", "memberCode", "discountPercent", "openingBalance", "creditLimit", "isActive", "createdAt") VALUES (${sqlEscape(pa.id)}, ${sqlEscape(pa.partyType)}, ${sqlEscape(pa.name)}, ${sqlEscape(pa.phone || '')}, ${sqlEscape(pa.gstin || '')}, ${sqlEscape(pa.address || '')}, ${sqlEscape(pa.memberNo || '')}, ${sqlEscape(pa.memberCode || '')}, ${sqlEscape(pa.discountPercent ?? 0)}, ${sqlEscape(pa.openingBalance)}, ${sqlEscape(pa.creditLimit ?? 0)}, ${sqlEscape(pa.isActive !== false)}, ${sqlEscape(pa.createdAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.returnNotes && backup.returnNotes.length > 0) {
    lines.push(`-- Return Notes (${backup.returnNotes.length})`);
    for (const rn of backup.returnNotes) {
      lines.push(
        `INSERT INTO return_notes (id, "noteNo", "noteDate", "noteType", "referenceNo", "partyId", "partyName", "productId", "productName", "hsnCode", quantity, unit, "baseAmount", "gstPercent", "cgstAmount", "sgstAmount", "totalGstAmount", "totalAmount", "settlementMode", reason, "performedBy") VALUES (${sqlEscape(rn.id)}, ${sqlEscape(rn.noteNo)}, ${sqlEscape(rn.noteDate)}, ${sqlEscape(rn.noteType)}, ${sqlEscape(rn.referenceNo)}, ${sqlEscape(rn.partyId || '')}, ${sqlEscape(rn.partyName)}, ${sqlEscape(rn.productId)}, ${sqlEscape(rn.productName)}, ${sqlEscape(rn.hsnCode || '')}, ${sqlEscape(rn.quantity)}, ${sqlEscape(rn.unit)}, ${sqlEscape(rn.baseAmount)}, ${sqlEscape(rn.gstPercent)}, ${sqlEscape(rn.cgstAmount)}, ${sqlEscape(rn.sgstAmount)}, ${sqlEscape(rn.totalGstAmount)}, ${sqlEscape(rn.totalAmount)}, ${sqlEscape(rn.settlementMode)}, ${sqlEscape(rn.reason || '')}, ${sqlEscape(rn.performedBy)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.fixedAssets && backup.fixedAssets.length > 0) {
    lines.push(`-- Fixed Assets (${backup.fixedAssets.length})`);
    for (const fa of backup.fixedAssets) {
      lines.push(
        `INSERT INTO fixed_assets (id, "assetName", category, "purchaseDate", "costValue", "depreciationRatePct", "accumulatedDepreciation", "fundingSource", notes) VALUES (${sqlEscape(fa.id)}, ${sqlEscape(fa.assetName)}, ${sqlEscape(fa.category)}, ${sqlEscape(fa.purchaseDate)}, ${sqlEscape(fa.costValue)}, ${sqlEscape(fa.depreciationRatePct)}, ${sqlEscape(fa.accumulatedDepreciation)}, ${sqlEscape(fa.fundingSource)}, ${sqlEscape(fa.notes || '')}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  if (backup.drawerClosings && backup.drawerClosings.length > 0) {
    lines.push(`-- Drawer Closings (${backup.drawerClosings.length})`);
    for (const dc of backup.drawerClosings) {
      lines.push(
        `INSERT INTO drawer_closings (id, "closingDate", "closedAt", "closedBy", "openingFloat", "cashSalesTotal", "upiSalesTotal", "cashInflowsTotal", "cashOutflowsTotal", "expectedCash", "physicalCashCounted", variance, denominations, notes) VALUES (${sqlEscape(dc.id)}, ${sqlEscape(dc.closingDate)}, ${sqlEscape(dc.closedAt)}, ${sqlEscape(dc.closedBy)}, ${sqlEscape(dc.openingFloat)}, ${sqlEscape(dc.cashSalesTotal)}, ${sqlEscape(dc.upiSalesTotal)}, ${sqlEscape(dc.cashInflowsTotal)}, ${sqlEscape(dc.cashOutflowsTotal)}, ${sqlEscape(dc.expectedCash)}, ${sqlEscape(dc.physicalCashCounted)}, ${sqlEscape(dc.variance)}, ${sqlEscape(dc.denominations)}, ${sqlEscape(dc.notes || '')}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface BackupSnapshotInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  source: string;
  counts: FullBackupPayload['counts'];
}

export async function createServerBackupSnapshot(prefix = 'deganga_db_backup'): Promise<BackupSnapshotInfo> {
  // No temporary or local backup files are written to disk; synchronize directly with Supabase tables
  await syncStoreToSupabase();
  const payload = await exportFullDatabaseBackup();
  const now = new Date();
  const stamp = `${getIstDateStr(now)}_${getIstTimeStr(now).replace(':', '-')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `${prefix}_${stamp}.json`;

  await addAuditLogEntry({
    id: `audit-backup-${Date.now()}`,
    timestamp: getIstDateTimeStr(now),
    action: 'DATABASE_BACKUP_CREATED',
    performedBy: 'SYSTEM ADMIN',
    details: `Verified direct Supabase cloud sync (${payload.counts.products} products, ${payload.counts.ledger} sales rows, ${payload.counts.cashiers} staff).`,
  });

  return {
    filename,
    createdAt: payload.exportedAt,
    sizeBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    source: 'Supabase PostgreSQL',
    counts: payload.counts,
  };
}

export async function ensureDailyAutoBackupSnapshot(): Promise<void> {
  // No local files written to disk; all data persists directly in Supabase tables
}

export function listServerBackupSnapshots(): BackupSnapshotInfo[] {
  return [];
}

export function resolveSafeBackupFile(_filename: string): string | null {
  return null;
}

export function deleteServerBackupSnapshot(_filename: string): boolean {
  return false;
}

export async function restoreDatabaseFromBackup(rawPayload: any): Promise<{
  success: boolean;
  message: string;
  counts: FullBackupPayload['counts'];
}> {
  const source = rawPayload?.data && typeof rawPayload.data === 'object' ? rawPayload.data : rawPayload;
  if (!source || typeof source !== 'object') {
    return {
      success: false,
      message: 'Invalid backup file format.',
      counts: { products: 0, ledger: 0, cashiers: 0, categories: 0, auditLogs: 0, loosePackets: 0 },
    };
  }

  const products: Product[] = Array.isArray(source.products) ? source.products : [];
  const ledger: SaleTransactionItem[] = Array.isArray(source.ledger) ? source.ledger : [];
  const cashiers: CashierUser[] = Array.isArray(source.cashiers) ? source.cashiers : [];
  const categories: string[] = Array.isArray(source.categories) ? source.categories : [];
  const auditLogs: AdminAuditLog[] = Array.isArray(source.auditLogs) ? source.auditLogs : [];
  const loosePackets: LoosePacket[] = Array.isArray(source.loosePackets) ? source.loosePackets : [];
  const purchaseTransactions: PurchaseTransaction[] = Array.isArray(source.purchaseTransactions)
    ? source.purchaseTransactions.map((pt: any) => normalizePurchaseTransaction(pt))
    : [];
  const gstPayments: GstGovtPayment[] = Array.isArray(source.gstPayments)
    ? source.gstPayments.map((gp: any) => normalizeGstPayment(gp))
    : [];
  const accountVouchers: AccountLedgerVoucher[] = Array.isArray(source.accountVouchers)
    ? source.accountVouchers.map((av: any) => normalizeAccountVoucher(av))
    : [];
  const partyAccounts: PartyAccount[] = Array.isArray(source.partyAccounts)
    ? source.partyAccounts.map((pa: any) => normalizePartyAccount(pa))
    : [];
  const returnNotes: ReturnNote[] = Array.isArray(source.returnNotes)
    ? source.returnNotes.map((rn: any) => normalizeReturnNote(rn))
    : [];
  const fixedAssets: FixedAsset[] = Array.isArray(source.fixedAssets)
    ? source.fixedAssets.map((fa: any) => normalizeFixedAsset(fa))
    : [];
  const drawerClosings: DailyDrawerClosing[] = Array.isArray(source.drawerClosings)
    ? source.drawerClosings.map((dc: any) => normalizeDrawerClosing(dc))
    : [];
  const settings: AdminStoreSettings | undefined =
    source.settings && typeof source.settings === 'object' ? source.settings : undefined;

  if (
    products.length === 0 &&
    ledger.length === 0 &&
    cashiers.length === 0 &&
    categories.length === 0 &&
    !settings
  ) {
    return {
      success: false,
      message: 'Backup file does not contain any recognizable store tables.',
      counts: { products: 0, ledger: 0, cashiers: 0, categories: 0, auditLogs: 0, loosePackets: 0, purchaseTransactions: 0 },
    };
  }

  if (products.length > 0) memoryStore.products = products;
  if (ledger.length > 0) memoryStore.ledger = ledger;
  if (cashiers.length > 0) memoryStore.cashiers = cashiers.filter((c) => c.role !== 'Developer');
  if (categories.length > 0) memoryStore.categories = categories;
  if (auditLogs.length > 0) memoryStore.auditLogs = auditLogs;
  if (loosePackets.length > 0) memoryStore.loosePackets = loosePackets;
  if (purchaseTransactions.length > 0) memoryStore.purchaseTransactions = purchaseTransactions;
  if (gstPayments.length > 0) memoryStore.gstPayments = gstPayments;
  if (accountVouchers.length > 0) memoryStore.accountVouchers = accountVouchers;
  if (partyAccounts.length > 0) memoryStore.partyAccounts = partyAccounts;
  if (returnNotes.length > 0) memoryStore.returnNotes = returnNotes;
  if (fixedAssets.length > 0) memoryStore.fixedAssets = fixedAssets;
  if (drawerClosings.length > 0) memoryStore.drawerClosings = drawerClosings;
  if (settings) memoryStore.settings = deserializeAdminSettingsFromDb(settings);

  const restoredCounts: FullBackupPayload['counts'] = {
    products: products.length,
    ledger: ledger.length,
    cashiers: memoryStore.cashiers.length,
    categories: categories.length,
    auditLogs: auditLogs.length,
    loosePackets: loosePackets.length,
    purchaseTransactions: purchaseTransactions.length,
    gstPayments: gstPayments.length,
    accountVouchers: accountVouchers.length,
    partyAccounts: partyAccounts.length,
    returnNotes: returnNotes.length,
    fixedAssets: fixedAssets.length,
    drawerClosings: drawerClosings.length,
  };

  if (supabase && supabaseStatus.connected) {
    try {
      if (products.length > 0) await supabase.from('products').upsert(products.map((p) => ({ ...p, id: p.id })));
      if (memoryStore.cashiers.length > 0) await supabase.from('cashiers').upsert(memoryStore.cashiers);
      if (settings) await supabase.from('admin_settings').upsert(serializeAdminSettingsForDb(memoryStore.settings));
      if (categories.length > 0) {
        for (const name of categories) {
          await supabase.from('categories').upsert({ name }, { onConflict: 'name' });
        }
      }
      if (auditLogs.length > 0) await supabase.from('audit_logs').upsert(auditLogs);
      if (loosePackets.length > 0) await supabase.from('loose_packets').upsert(loosePackets);
      if (purchaseTransactions.length > 0) await supabase.from('purchase_transactions').upsert(purchaseTransactions);
      if (gstPayments.length > 0) await supabase.from('gst_payments').upsert(gstPayments);
      if (accountVouchers.length > 0) await supabase.from('account_vouchers').upsert(accountVouchers);
      if (partyAccounts.length > 0) await supabase.from('party_accounts').upsert(partyAccounts);
      if (returnNotes.length > 0) await supabase.from('return_notes').upsert(returnNotes);
      if (fixedAssets.length > 0) await supabase.from('fixed_assets').upsert(fixedAssets);
      if (drawerClosings.length > 0) await supabase.from('drawer_closings').upsert(drawerClosings);
      if (ledger.length > 0) {
        const grouped = new Map<string, SaleTransactionItem[]>();
        ledger.forEach((item) => {
          if (!item.invoiceNo) return;
          const key = `${item.invoiceNo}|${item.saleDate || ''}`;
          const list = grouped.get(key) || [];
          list.push(item);
          grouped.set(key, list);
        });
        for (const items of grouped.values()) {
          await addLedgerItems({ items });
        }
      }
    } catch (e: any) {
      return {
        success: false,
        message: `Supabase restore encountered an error: ${e.message}`,
        counts: restoredCounts,
      };
    }
  }

  await addAuditLogEntry({
    id: `audit-restore-${Date.now()}`,
    timestamp: getIstDateTimeStr(),
    action: 'DATABASE_RESTORED',
    performedBy: 'SYSTEM ADMIN',
    details: `Restored database backup directly to Supabase (${products.length} products, ${ledger.length} sales rows, ${cashiers.length} staff).`,
  });

  return {
    success: true,
    message: 'Database restored directly to Supabase tables.',
    counts: restoredCounts,
  };
}

// ==========================================
// DIRECT DATABASE TABLE INSPECTOR (ADMIN)
// ==========================================
export const ALLOWED_DB_TABLES = [
  'products',
  'Invoice Analytics',
  'sale_transactions',
  'purchase_transactions',
  'gst_payments',
  'account_vouchers',
  'party_accounts',
  'return_notes',
  'fixed_assets',
  'drawer_closings',
  'cashiers',
  'admin_settings',
  'categories',
  'audit_logs',
  'loose_packets',
] as const;

export type AllowedDbTable = (typeof ALLOWED_DB_TABLES)[number];

const DB_TABLE_ORDER_HINT: Record<AllowedDbTable, { col: string; asc: boolean }> = {
  products: { col: 'id', asc: true },
  'Invoice Analytics': { col: 'saleItemId', asc: false },
  sale_transactions: { col: 'saleItemId', asc: false },
  purchase_transactions: { col: 'purchaseDate', asc: false },
  gst_payments: { col: 'paymentDate', asc: false },
  account_vouchers: { col: 'voucherDate', asc: false },
  party_accounts: { col: 'name', asc: true },
  return_notes: { col: 'noteDate', asc: false },
  fixed_assets: { col: 'purchaseDate', asc: false },
  drawer_closings: { col: 'closingDate', asc: false },
  cashiers: { col: 'createdAt', asc: true },
  admin_settings: { col: 'id', asc: true },
  categories: { col: 'id', asc: true },
  audit_logs: { col: 'timestamp', asc: false },
  loose_packets: { col: 'createdAt', asc: false },
};

export interface DatabaseTableOverviewItem {
  name: AllowedDbTable;
  count: number;
  ok: boolean;
  source: string;
  error: string | null;
}

export interface DatabaseTableRowsResult {
  tableName: AllowedDbTable;
  source: string;
  totalCount: number;
  columns: string[];
  rows: Record<string, any>[];
  fetchedAt: string;
  error?: string;
}

export function isAllowedDbTable(tableName: string): tableName is AllowedDbTable {
  return (ALLOWED_DB_TABLES as readonly string[]).includes(tableName);
}

export async function getDatabaseTablesOverview(): Promise<{
  source: string;
  connected: boolean;
  tables: DatabaseTableOverviewItem[];
  fetchedAt: string;
}> {
  const fetchedAt = new Date().toISOString();

  if (supabase && supabaseStatus.connected) {
    const client = supabase;
    const authoritativeLoaders: Partial<Record<AllowedDbTable, () => Promise<any[]>>> = {
      purchase_transactions: getAllPurchaseTransactions,
      gst_payments: getAllGstPayments,
      account_vouchers: getAllAccountVouchers,
      party_accounts: getAllPartyAccounts,
      return_notes: getAllReturnNotes,
      fixed_assets: getAllFixedAssets,
      drawer_closings: getAllDrawerClosings,
    };

    const tables = await Promise.all(
      ALLOWED_DB_TABLES.map(async (name): Promise<DatabaseTableOverviewItem> => {
        try {
          const loader = authoritativeLoaders[name];
          if (loader) {
            const allRows = await loader();
            return {
              name,
              count: allRows.length,
              ok: true,
              source: 'Supabase PostgreSQL',
              error: null,
            };
          }

          const { count, error } = await client
            .from(name)
            .select('*', { count: 'exact', head: true });
          if (error) {
            return {
              name,
              count: 0,
              ok: false,
              source: 'Supabase PostgreSQL',
              error: error.message,
            };
          }
          return {
            name,
            count: count ?? 0,
            ok: true,
            source: 'Supabase PostgreSQL',
            error: null,
          };
        } catch (e: any) {
          return {
            name,
            count: 0,
            ok: false,
            source: 'Supabase PostgreSQL',
            error: e?.message || 'Failed to inspect table',
          };
        }
      })
    );

    return {
      source: 'Supabase PostgreSQL',
      connected: true,
      tables,
      fetchedAt,
    };
  }

  return {
    source: 'Supabase Disconnected',
    connected: false,
    tables: ALLOWED_DB_TABLES.map((name) => ({
      name,
      count: 0,
      ok: false,
      source: 'Supabase Disconnected',
      error: 'Supabase connection required',
    })),
    fetchedAt,
  };
}

export async function getDatabaseTableRows(tableName: string): Promise<DatabaseTableRowsResult | null> {
  if (!isAllowedDbTable(tableName)) {
    return null;
  }

  const fetchedAt = new Date().toISOString();

  const collectColumns = (rows: Record<string, any>[]): string[] => {
    const cols: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          cols.push(key);
        }
      }
    }
    return cols;
  };

  if (supabase && supabaseStatus.connected) {
    try {
      const authoritativeLoaders: Partial<Record<AllowedDbTable, () => Promise<any[]>>> = {
        purchase_transactions: getAllPurchaseTransactions,
        gst_payments: getAllGstPayments,
        account_vouchers: getAllAccountVouchers,
        party_accounts: getAllPartyAccounts,
        return_notes: getAllReturnNotes,
        fixed_assets: getAllFixedAssets,
        drawer_closings: getAllDrawerClosings,
      };

      const loader = authoritativeLoaders[tableName];
      if (loader) {
        const allRows = await loader();
        return {
          tableName,
          source: 'Supabase PostgreSQL',
          totalCount: allRows.length,
          columns: collectColumns(allRows),
          rows: allRows,
          fetchedAt,
        };
      }

      const hint = DB_TABLE_ORDER_HINT[tableName];
      let queryRes = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .order(hint.col, { ascending: hint.asc })
        .range(0, 4999);

      if (queryRes.error) {
        queryRes = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .range(0, 4999);
      }

      if (queryRes.error) {
        return {
          tableName,
          source: 'Supabase PostgreSQL',
          totalCount: 0,
          columns: [],
          rows: [],
          fetchedAt,
          error: queryRes.error.message,
        };
      }

      const rawRows = Array.isArray(queryRes.data) ? queryRes.data : [];
      const rows =
        tableName === 'cashiers'
          ? rawRows.filter((r: any) => r.role !== 'Developer').map((r: any) => sanitizeCashierForClient(r))
          : rawRows;
      return {
        tableName,
        source: 'Supabase PostgreSQL',
        totalCount: queryRes.count ?? rows.length,
        columns: collectColumns(rows),
        rows,
        fetchedAt,
      };
    } catch (e: any) {
      return {
        tableName,
        source: 'Supabase PostgreSQL',
        totalCount: 0,
        columns: [],
        rows: [],
        fetchedAt,
        error: e?.message || 'Failed to query table',
      };
    }
  }

  return {
    tableName,
    source: 'Supabase Disconnected',
    totalCount: 0,
    columns: [],
    rows: [],
    fetchedAt,
    error: 'Supabase is not connected.',
  };
}

export async function pruneStoreToCategories(allowedCategories: string[]): Promise<{
  success: boolean;
  keptCategories: string[];
  keptProductsCount: number;
  removedProductsCount: number;
  removedCategoriesCount: number;
  removedInvoiceAnalyticsCount: number;
  removedSaleTxCount: number;
  removedPurchaseTxCount: number;
  removedLoosePacketsCount: number;
  removedAuditLogsCount: number;
}> {
  const allowedSet = new Set(
    allowedCategories.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );

  let allProds = await getAllProducts();
  const keptProducts = allProds.filter((p) =>
    allowedSet.has(String(p.category || '').trim().toLowerCase())
  );
  const removedProducts = allProds.filter(
    (p) => !allowedSet.has(String(p.category || '').trim().toLowerCase())
  );
  const keptProductIds = new Set<number>(keptProducts.map((p) => Number(p.id)));
  const keptProductNames = new Set<string>(
    keptProducts.map((p) => String(p.name || '').trim().toLowerCase())
  );
  const removedProductIds = removedProducts.map((p) => Number(p.id));

  let removedCategoriesCount = 0;
  let removedInvoiceAnalyticsCount = 0;
  let removedSaleTxCount = 0;
  let removedPurchaseTxCount = 0;
  let removedLoosePacketsCount = 0;
  let removedAuditLogsCount = 0;

  if (supabase && supabaseStatus.connected) {
    // 1. Delete non-allowed products
    if (removedProductIds.length > 0) {
      await supabase.from('products').delete().in('id', removedProductIds);
    }

    // 2. Delete non-allowed categories
    const { data: catRows } = await supabase.from('categories').select('id, name');
    if (Array.isArray(catRows)) {
      const catIdsToRemove = catRows
        .filter((c: any) => !allowedSet.has(String(c.name || '').trim().toLowerCase()))
        .map((c: any) => c.id);
      if (catIdsToRemove.length > 0) {
        removedCategoriesCount = catIdsToRemove.length;
        await supabase.from('categories').delete().in('id', catIdsToRemove);
      }
    }

    // 3. Prune Invoice Analytics
    const { data: invRows } = await supabase.from('Invoice Analytics').select('*');
    const keptInvoiceNos = new Set<string>();
    if (Array.isArray(invRows)) {
      for (const r of invRows) {
        if (Array.isArray(r.itemsDetail) && r.itemsDetail.length > 0) {
          const keptItems = r.itemsDetail.filter((it: any) =>
            keptProductIds.has(Number(it.productId)) ||
            keptProductNames.has(String(it.productName || '').trim().toLowerCase())
          );
          if (keptItems.length === 0) {
            removedInvoiceAnalyticsCount++;
            if (r.saleItemId !== undefined) {
              await supabase.from('Invoice Analytics').delete().eq('saleItemId', r.saleItemId);
            } else if (r.invoiceNo) {
              await supabase.from('Invoice Analytics').delete().eq('invoiceNo', r.invoiceNo);
            }
          } else {
            keptInvoiceNos.add(String(r.invoiceNo));
            if (keptItems.length < r.itemsDetail.length && r.saleItemId !== undefined) {
              const newTotal = keptItems.reduce((s: number, it: any) => s + Number(it.lineTotal || 0), 0);
              const newBase = keptItems.reduce((s: number, it: any) => s + Number(it.baseAmount || 0), 0);
              const newGst = keptItems.reduce((s: number, it: any) => s + Number(it.totalGstAmount || 0), 0);
              await supabase
                .from('Invoice Analytics')
                .update({
                  itemsDetail: keptItems,
                  totalProducts: keptItems.length,
                  productsSummary: keptItems.map((it: any) => `${it.productName} (${it.quantity} ${it.unitType})`).join(', '),
                  lineTotal: Number(newTotal.toFixed(2)),
                  baseAmount: Number(newBase.toFixed(2)),
                  totalGst: Number(newGst.toFixed(2)),
                  cgstAmount: Number((newGst / 2).toFixed(2)),
                  sgstAmount: Number((newGst / 2).toFixed(2)),
                })
                .eq('saleItemId', r.saleItemId);
            }
          }
        } else {
          const matchesKept =
            keptProductIds.has(Number(r.productId)) ||
            keptProductNames.has(String(r.productName || '').trim().toLowerCase());
          if (!matchesKept) {
            removedInvoiceAnalyticsCount++;
            if (r.saleItemId !== undefined) {
              await supabase.from('Invoice Analytics').delete().eq('saleItemId', r.saleItemId);
            } else if (r.invoiceNo) {
              await supabase.from('Invoice Analytics').delete().eq('invoiceNo', r.invoiceNo);
            }
          } else if (r.invoiceNo) {
            keptInvoiceNos.add(String(r.invoiceNo));
          }
        }
      }
    }

    // 4. Prune sale_transactions
    const { data: stxRows, error: stxErr } = await supabase.from('sale_transactions').select('*');
    if (!stxErr && Array.isArray(stxRows)) {
      const stxIdsToDelete = stxRows
        .filter(
          (r: any) =>
            !keptProductIds.has(Number(r.productId)) &&
            !keptProductNames.has(String(r.productName || '').trim().toLowerCase())
        )
        .map((r: any) => r.saleItemId)
        .filter((id: any) => id !== undefined && id !== null);
      if (stxIdsToDelete.length > 0) {
        removedSaleTxCount = stxIdsToDelete.length;
        await supabase.from('sale_transactions').delete().in('saleItemId', stxIdsToDelete);
      }
    }

    // 5. Prune purchase_transactions table (if exists)
    const { data: ptxRows, error: ptxErr } = await supabase.from('purchase_transactions').select('*');
    if (!ptxErr && Array.isArray(ptxRows)) {
      const ptxIdsToDelete = ptxRows
        .filter(
          (r: any) =>
            !allowedSet.has(String(r.category || '').trim().toLowerCase()) &&
            !keptProductIds.has(Number(r.productId))
        )
        .map((r: any) => r.id);
      if (ptxIdsToDelete.length > 0) {
        removedPurchaseTxCount += ptxIdsToDelete.length;
        await supabase.from('purchase_transactions').delete().in('id', ptxIdsToDelete);
      }
    }

    // 6. Prune loose_packets
    const { data: lpRows, error: lpErr } = await supabase.from('loose_packets').select('id, productId, productName');
    if (!lpErr && Array.isArray(lpRows)) {
      const lpIdsToDelete = lpRows
        .filter(
          (r: any) =>
            !keptProductIds.has(Number(r.productId)) &&
            !keptProductNames.has(String(r.productName || '').trim().toLowerCase())
        )
        .map((r: any) => r.id);
      if (lpIdsToDelete.length > 0) {
        removedLoosePacketsCount = lpIdsToDelete.length;
        await supabase.from('loose_packets').delete().in('id', lpIdsToDelete);
      }
    }

    // 7. Prune non-Fertilizer / non-Pestiside audit logs (including archived PURCHASE_TRANSACTION logs)
    const { data: alRows, error: alErr } = await supabase.from('audit_logs').select('*');
    if (!alErr && Array.isArray(alRows)) {
      const alIdsToDelete: string[] = [];
      for (const row of alRows) {
        const action = String(row.action || '');
        const details = String(row.details || '');
        const lowerDetails = details.toLowerCase();
        const mentionsAllowed = Array.from(allowedSet).some((cat) => lowerDetails.includes(cat));

        if (action === 'PURCHASE_TRANSACTION') {
          const parsed = parsePurchaseTxFromAuditDetails(details);
          const keep =
            parsed &&
            (allowedSet.has(String(parsed.category || '').trim().toLowerCase()) ||
              keptProductIds.has(Number(parsed.productId)));
          if (!keep) {
            alIdsToDelete.push(row.id);
            removedPurchaseTxCount++;
          }
        } else if (action === 'SALE_COMPLETED') {
          const invMatch = details.match(/#(POS-[\w-]+)/i);
          const invNo = invMatch ? invMatch[1] : '';
          if (!invNo || !keptInvoiceNos.has(invNo)) {
            alIdsToDelete.push(row.id);
          }
        } else if (
          action === 'CATEGORY_ADDED' ||
          action === 'CATEGORY_RENAMED' ||
          action === 'PRODUCT_UPDATED' ||
          action === 'PRODUCT_DELETED' ||
          action === 'PRODUCT_PURCHASE_ADDED' ||
          action === 'EXISTING_STOCK_FILLED' ||
          action === 'DATABASE_BACKUP_CREATED'
        ) {
          if (!mentionsAllowed) {
            alIdsToDelete.push(row.id);
          }
        }
      }
      if (alIdsToDelete.length > 0) {
        removedAuditLogsCount = alIdsToDelete.length;
        await supabase.from('audit_logs').delete().in('id', alIdsToDelete);
      }
    }
  }

  // Update in-memory store and disk persistence
  memoryStore.products = keptProducts;
  memoryStore.categories = Array.from(
    new Set(
      memoryStore.categories.filter((c) =>
        allowedSet.has(String(c || '').trim().toLowerCase())
      )
    )
  );
  if (memoryStore.categories.length === 0) {
    memoryStore.categories = [...allowedCategories];
  }
  memoryStore.ledger = memoryStore.ledger.filter(
    (it) =>
      keptProductIds.has(Number(it.productId)) ||
      keptProductNames.has(String(it.productName || '').trim().toLowerCase())
  );
  memoryStore.purchaseTransactions = memoryStore.purchaseTransactions.filter(
    (pt) =>
      allowedSet.has(String(pt.category || '').trim().toLowerCase()) ||
      keptProductIds.has(Number(pt.productId))
  );
  memoryStore.loosePackets = memoryStore.loosePackets.filter(
    (lp) =>
      keptProductIds.has(Number(lp.productId)) ||
      keptProductNames.has(String(lp.productName || '').trim().toLowerCase())
  );
  memoryStore.auditLogs = memoryStore.auditLogs.filter((log) => {
    const action = String(log.action || '');
    const details = String(log.details || '').toLowerCase();
    const mentionsAllowed = Array.from(allowedSet).some((cat) => details.includes(cat));
    if (action === 'PURCHASE_TRANSACTION') {
      const parsed = parsePurchaseTxFromAuditDetails(log.details);
      return Boolean(
        parsed &&
          (allowedSet.has(String(parsed.category || '').trim().toLowerCase()) ||
            keptProductIds.has(Number(parsed.productId)))
      );
    }
    if (action === 'SALE_COMPLETED') {
      return memoryStore.ledger.some((it) => details.includes(String(it.invoiceNo || '').toLowerCase()));
    }
    if (
      action === 'CATEGORY_ADDED' ||
      action === 'CATEGORY_RENAMED' ||
      action === 'PRODUCT_UPDATED' ||
      action === 'PRODUCT_DELETED' ||
      action === 'PRODUCT_PURCHASE_ADDED' ||
      action === 'EXISTING_STOCK_FILLED' ||
      action === 'DATABASE_BACKUP_CREATED'
    ) {
      return mentionsAllowed;
    }
    return true;
  });

  if (supabase && supabaseStatus.connected) {
    await refreshLocalMemoryFromSupabase();
  }
  saveStoreToDisk();

  return {
    success: true,
    keptCategories: memoryStore.categories,
    keptProductsCount: memoryStore.products.length,
    removedProductsCount: removedProducts.length,
    removedCategoriesCount,
    removedInvoiceAnalyticsCount,
    removedSaleTxCount,
    removedPurchaseTxCount,
    removedLoosePacketsCount,
    removedAuditLogsCount,
  };
}



