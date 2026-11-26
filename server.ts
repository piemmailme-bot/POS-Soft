import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  initSupabase,
  ensureSupabaseReady,
  getSupabaseStatus,
  verifyLiveSupabaseConnection,
  diagnoseSupabase,
  validateSupabaseConnection,
  saveSupabaseConfig,
  disconnectSupabase,
  syncStoreToSupabase,
  refreshLocalMemoryFromSupabase,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllLedger,
  addLedgerItems,
  getAllCashiers,
  createCashier,
  updateCashier,
  deleteCashier,
  getAdminSettings,
  updateAdminSettings,
  getAllCategories,
  addCategory,
  renameCategory,
  getAllAuditLogs,
  addAuditLogEntry,
  getAllLoosePackets,
  saveLoosePacketRecord,
  updateLoosePacketStatus,
  deleteLoosePacketRecord,
  exportFullDatabaseBackup,
  exportFullDatabaseSql,
  createServerBackupSnapshot,
  listServerBackupSnapshots,
  resolveSafeBackupFile,
  deleteServerBackupSnapshot,
  restoreDatabaseFromBackup,
  getDatabaseTablesOverview,
  getDatabaseTableRows,
  resetUserOrAdminPassword,
  getAllPurchaseTransactions,
  addPurchaseTransaction,
  getAllGstPayments,
  addGstPayment,
  deleteGstPayment,
  getAllAccountVouchers,
  addAccountVoucher,
  deleteAccountVoucher,
  pruneStoreToCategories,
  authenticateCashier,
  sanitizeCashierForClient,
  getNextInvoiceNumberFromStore,
  getAllPartyAccounts,
  upsertPartyAccount,
  deletePartyAccount,
  getAllReturnNotes,
  addReturnNote,
  deleteReturnNote,
  getAllFixedAssets,
  upsertFixedAsset,
  deleteFixedAsset,
  getAllDrawerClosings,
  addDrawerClosing,
  deleteDrawerClosing,
  ensureDailyAutoBackupSnapshot,
  verifySessionToken,
  verifyActiveMemberSession,
  UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE,
} from './src/db/supabaseManager.ts';
import { buildUserGuideBuffer } from './src/utils/userGuideDocx.ts';
import { getIstDateStr, getIstDateTimeStr } from './src/utils/dateUtils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function requireLoggedInAuthorizedMember(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const token = extractBearerToken(req);
    const check = await verifyActiveMemberSession(token);
    if (!check.valid || !check.session) {
      return res.status(401).json({
        success: false,
        forceLogout: true,
        error: check.reason || UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE,
      });
    }
    (req as any).authSession = check.session;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      forceLogout: true,
      error: 'Session verification failed. Please sign in again.',
    });
  }
}

async function requireAdminOrDeveloper(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  await requireLoggedInAuthorizedMember(req, res, () => {
    const session = (req as any).authSession;
    const isAdmin =
      session?.role === 'System Admin' || String(session?.loginId || '').toLowerCase() === 'admin';

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required.',
      });
    }
    next();
  });
}

async function requireCloudStorageActive(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const status = await verifyLiveSupabaseConnection();
  if (!status.connected) {
    return res.status(503).json({
      success: false,
      cloudOffline: true,
      error:
        'Cloud Storage is NOT Active. No transaction is allowed until live Cloud Database connection is restored.',
    });
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Kick off Supabase initialization asynchronously so port 3000 binds immediately on cold starts
  initSupabase()
    .then(() => ensureDailyAutoBackupSnapshot().catch(() => {}))
    .catch((err) => console.error('[Startup] Initial Supabase sync error:', err));

  const autoBackupTimer = setInterval(() => {
    ensureDailyAutoBackupSnapshot().catch(() => {});
  }, 1000 * 60 * 60 * 24);
  if (typeof autoBackupTimer.unref === 'function') autoBackupTimer.unref();

  // Parse JSON bodies (allow large backup restore payloads)
  app.use(express.json({ limit: '15mb' }));

  // Same-origin / forwarded-host aware CORS (no wildcard '*' on authenticated endpoints)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
    if (origin && host) {
      try {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.host === host) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
      } catch {
        // ignore invalid origin header
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Dynamic port with fallback to 3000 for AI Studio / Cloud Run environment
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Prevent stale caching on API responses and HTML while allowing immutable caching for hashed static assets
  app.use((req, res, next) => {
    if (req.path.startsWith('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Root API status endpoint (public, responds immediately for Cloud Run health/wake-up probes)
  app.get(['/api', '/api/health', '/api/status'], (req, res) => {
    res.json({
      status: 'ok',
      message: 'Nabkul POS Backend API is active',
      cloudConnected: getSupabaseStatus().connected,
    });
  });

  // Ensure Supabase warm-up has completed (with timeout) before data/auth API handlers execute
  app.use('/api', async (req, res, next) => {
    if (req.path === '/' || req.path === '/health' || req.path === '/status') {
      return next();
    }
    await ensureSupabaseReady(8000);
    next();
  });

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, loginId, password, counter, mode } = req.body || {};
      const result = await authenticateCashier({ email, loginId, password, counter, mode });
      if (result.success && result.cashier) {
        await addAuditLogEntry({
          id: `audit-login-${Date.now()}`,
          timestamp: getIstDateTimeStr(),
          action: 'MEMBER_LOGIN',
          performedBy: `${result.cashier.name} (${result.cashier.email || result.cashier.loginId})`,
          details: `Signed in with authorized Email ID "${result.cashier.email}" as ${result.cashier.role} on ${result.cashier.assignedCounter}.`,
        });
      }
      res.status(result.statusCode).json(result);
    } catch (error: any) {
      console.error('Error authenticating user:', error);
      res.status(500).json({ success: false, message: error?.message || 'Authentication failed' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = extractBearerToken(req);
      const decoded = verifySessionToken(token);
      if (decoded?.email) {
        await addAuditLogEntry({
          id: `audit-logout-${Date.now()}`,
          timestamp: getIstDateTimeStr(),
          action: 'MEMBER_LOGOUT',
          performedBy: `${decoded.name} (${decoded.email})`,
          details: `Signed out of POS session cleanly.`,
        });
      }
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  app.get('/api/auth/session', async (req, res) => {
    try {
      const token = extractBearerToken(req);
      const check = await verifyActiveMemberSession(token);
      if (!check.valid || !check.session) {
        return res.status(401).json({
          valid: false,
          forceLogout: true,
          error: check.reason || UNAUTHORIZED_EXTERNAL_ACCESS_MESSAGE,
        });
      }
      const session = check.session;
      const allCashiers = await getAllCashiers();
      const matched = allCashiers.find((c) => c.id === session.id);

      const safeUser = sanitizeCashierForClient({
        id: matched?.id || session.id,
        loginId: matched?.loginId || session.loginId,
        passwordHash: '********',
        name: matched?.name || session.name,
        staffCode: matched?.staffCode || session.staffCode,
        role: matched?.role || session.role,
        assignedCounter: matched?.assignedCounter || 'COUNTER-01 (KOL-NORTH)',
        email: session.email,
        isDeveloper: false,
        isActive: matched ? matched.isActive !== false : true,
        lastLogin: matched?.lastLogin,
      });

      res.json({
        valid: true,
        cashier: safeUser,
      });
    } catch {
      res.status(401).json({
        valid: false,
        forceLogout: true,
        error: 'Session validation error.',
      });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { loginId, currentPassword, newPassword, accountType } = req.body || {};
      const result = await resetUserOrAdminPassword({
        loginId,
        currentPassword,
        newPassword,
        accountType,
      });
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        updatedCashier: result.updatedCashier,
      });
    } catch (error: any) {
      console.error('Error resetting password:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Failed to reset password',
      });
    }
  });

  // ==========================================
  // SUPABASE CONFIG & STATUS ROUTES
  // ==========================================
  app.get('/api/supabase/status', async (req, res) => {
    const reconnect = req.query.reconnect === '1';
    const status = await verifyLiveSupabaseConnection({ reconnect });
    res.json(status);
  });

  app.post('/api/supabase/validate', requireAdminOrDeveloper, async (req, res) => {
    const { url, key } = req.body;
    const result = await validateSupabaseConnection(url, key);
    res.json(result);
  });

  app.post('/api/supabase/config', requireAdminOrDeveloper, async (req, res) => {
    const { url, key } = req.body;
    const success = await saveSupabaseConfig(url, key);
    res.json({ success });
  });

  app.post('/api/supabase/disconnect', requireAdminOrDeveloper, async (req, res) => {
    const success = await disconnectSupabase();
    res.json({ success });
  });

  app.post('/api/supabase/sync', requireAdminOrDeveloper, async (req, res) => {
    const result = await syncStoreToSupabase();
    res.json(result);
  });

  app.get('/api/supabase/refresh', requireLoggedInAuthorizedMember, async (req, res) => {
    await refreshLocalMemoryFromSupabase();
    res.json({ success: true });
  });

  app.get('/api/supabase/diagnose', requireAdminOrDeveloper, async (req, res) => {
    const diag = await diagnoseSupabase();
    res.json(diag);
  });

  // ==========================================
  // BACKUP & RESTORE ROUTES
  // ==========================================
  app.get('/api/backup/export', requireAdminOrDeveloper, async (req, res) => {
    try {
      const data = await exportFullDatabaseBackup();
      if (req.query.download === '1') {
        const stamp = getIstDateTimeStr().replace(/[: ]/g, '-');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="Deganga_CADPFSCS_DB_Backup_${stamp}.json"`
        );
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Database export failed' });
    }
  });

  app.get('/api/backup/export-sql', requireAdminOrDeveloper, async (req, res) => {
    try {
      const sql = await exportFullDatabaseSql();
      const stamp = getIstDateTimeStr().replace(/[: ]/g, '-');
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Deganga_CADPFSCS_DB_Backup_${stamp}.sql"`
      );
      res.send(sql);
    } catch (e) {
      res.status(500).json({ error: 'SQL backup export failed' });
    }
  });

  app.get('/api/backup/snapshots', requireAdminOrDeveloper, async (req, res) => {
    try {
      const [live, snapshots] = await Promise.all([
        exportFullDatabaseBackup(),
        Promise.resolve(listServerBackupSnapshots()),
      ]);
      res.json({
        source: live.source,
        counts: live.counts,
        snapshots,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load backup status' });
    }
  });

  app.post('/api/backup/snapshot', requireAdminOrDeveloper, async (req, res) => {
    try {
      const snapshot = await createServerBackupSnapshot();
      res.status(201).json({ success: true, snapshot });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || 'Failed to create snapshot' });
    }
  });

  app.get('/api/backup/snapshots/:filename', requireAdminOrDeveloper, (req, res) => {
    const filePath = resolveSafeBackupFile(req.params.filename);
    if (!filePath) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    res.download(filePath, req.params.filename);
  });

  app.delete('/api/backup/snapshots/:filename', requireAdminOrDeveloper, (req, res) => {
    const deleted = deleteServerBackupSnapshot(req.params.filename);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Snapshot not found' });
    }
    res.json({ success: true });
  });

  app.post('/api/backup/restore', requireAdminOrDeveloper, async (req, res) => {
    try {
      const payload = req.body;
      if (payload?.snapshotFilename) {
        return res.status(400).json({
          success: false,
          message: 'Local server snapshot files are disabled. All data is stored directly in Supabase.',
        });
      }
      const result = await restoreDatabaseFromBackup(payload);
      res.status(result.success ? 200 : 400).json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || 'Restore failed' });
    }
  });

  // ==========================================
  // ADMIN DIRECT DATABASE TABLE VIEWER ROUTES
  // ==========================================
  app.get('/api/admin/db-tables', requireAdminOrDeveloper, async (req, res) => {
    try {
      const overview = await getDatabaseTablesOverview();
      res.json(overview);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to load database tables' });
    }
  });

  app.get('/api/admin/db-tables/:tableName', requireAdminOrDeveloper, async (req, res) => {
    try {
      const tableName = decodeURIComponent(req.params.tableName);
      const result = await getDatabaseTableRows(tableName);
      if (!result) {
        return res.status(400).json({ error: `Table "${tableName}" is not permitted` });
      }
      if (result.error) {
        return res.status(500).json(result);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to load table rows' });
    }
  });

  app.post('/api/admin/prune-categories', requireAdminOrDeveloper, async (req, res) => {
    try {
      const allowedCategories = Array.isArray(req.body?.allowedCategories)
        ? req.body.allowedCategories
        : ['Fertilizer', 'Pestiside'];
      const result = await pruneStoreToCategories(allowedCategories);
      res.json(result);
    } catch (e: any) {
      console.error('Error pruning categories:', e);
      res.status(500).json({ success: false, error: e?.message || 'Failed to prune categories' });
    }
  });

  // ==========================================
  // USER GUIDE WORD (.DOCX) DOWNLOAD ROUTE
  // ==========================================
  app.get('/api/user-guide/download', async (req, res) => {
    try {
      const buffer = await buildUserGuideBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Deganga_CADPFSCS_User_Guide.docx"'
      );
      res.send(buffer);
    } catch (e: any) {
      console.error('Error generating user guide docx:', e);
      res.status(500).json({ error: e?.message || 'Failed to generate Word user guide' });
    }
  });

  // ==========================================
  // PRODUCTS API ROUTES
  // ==========================================
  app.get('/api/products', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllProducts();
      res.json(data);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const created = await createProduct(req.body);
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const result = await updateProduct(parseInt(req.params.id, 10), req.body);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error('Error updating product:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteProduct(parseInt(req.params.id, 10));
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // ==========================================
  // SALES LEDGER API ROUTES
  // ==========================================
  app.get('/api/ledger/next-invoice', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const invoiceNo = await getNextInvoiceNumberFromStore();
      res.json({ invoiceNo });
    } catch (error) {
      console.error('Error generating next invoice number:', error);
      res.status(500).json({ error: 'Failed to generate next invoice number' });
    }
  });

  app.get('/api/ledger', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllLedger();
      res.json(data);
    } catch (error) {
      console.error('Error fetching ledger:', error);
      res.status(500).json({ error: 'Failed to fetch ledger' });
    }
  });

  app.post('/api/ledger', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const result = await addLedgerItems(req.body);
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('Error recording transaction:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to record transaction' });
    }
  });

  // ==========================================
  // PURCHASE TRANSACTIONS API ROUTES
  // ==========================================
  app.get('/api/purchases', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllPurchaseTransactions();
      res.json(data);
    } catch (error) {
      console.error('Error fetching purchase transactions:', error);
      res.status(500).json({ error: 'Failed to fetch purchase transactions' });
    }
  });

  app.post('/api/purchases', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const { productName, addedQuantity, entryType } = req.body || {};
      const qty = Number(addedQuantity ?? 0);
      const invalidQty = entryType === 'NEW_PRODUCT' ? qty < 0 : qty <= 0;
      if (!productName || !Number.isFinite(qty) || invalidQty) {
        return res.status(400).json({
          success: false,
          error: 'Product name and valid added quantity are required.',
        });
      }
      const result = await addPurchaseTransaction(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error saving purchase transaction:', error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to record purchase transaction',
      });
    }
  });

  // ==========================================
  // GOVT GST PAYMENTS (CHALLAN PMT-06) API ROUTES
  // ==========================================
  app.get('/api/gst-payments', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllGstPayments();
      res.json(data);
    } catch (error) {
      console.error('Error fetching govt GST payments:', error);
      res.status(500).json({ error: 'Failed to fetch govt GST payments' });
    }
  });

  app.post('/api/gst-payments', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const { cgstPaid, sgstPaid, interestOrFee } = req.body || {};
      const total = Number(cgstPaid || 0) + Number(sgstPaid || 0) + Number(interestOrFee || 0);
      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid CGST, SGST, or fee payment amount greater than 0 is required.',
        });
      }
      const result = await addGstPayment(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error saving govt GST payment:', error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to save govt GST payment',
      });
    }
  });

  app.delete('/api/gst-payments/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteGstPayment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting govt GST payment:', error);
      res.status(500).json({ error: 'Failed to delete govt GST payment' });
    }
  });

  // ==========================================
  // NON-INVENTORY ACCOUNT LEDGER VOUCHERS (EXPENSE / OTHER INCOME)
  // ==========================================
  app.get('/api/account-vouchers', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllAccountVouchers();
      res.json(data);
    } catch (error) {
      console.error('Error fetching account vouchers:', error);
      res.status(500).json({ error: 'Failed to fetch account vouchers' });
    }
  });

  app.post('/api/account-vouchers', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const { amount, ledgerHead } = req.body || {};
      const numAmt = Number(amount ?? 0);
      if (!ledgerHead || !String(ledgerHead).trim() || !Number.isFinite(numAmt) || numAmt <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid ledger head and voucher amount greater than 0 are required.',
        });
      }
      const result = await addAccountVoucher(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error saving account voucher:', error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to save account voucher',
      });
    }
  });

  app.delete('/api/account-vouchers/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteAccountVoucher(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting account voucher:', error);
      res.status(500).json({ error: 'Failed to delete account voucher' });
    }
  });

  // ==========================================
  // PARTY ACCOUNTS (SUPPLIERS & MEMBERS), RETURNS, FIXED ASSETS, DRAWER Z-REPORT
  // ==========================================
  app.get('/api/parties', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      res.json(await getAllPartyAccounts());
    } catch (error) {
      console.error('Error fetching party accounts:', error);
      res.status(500).json({ error: 'Failed to fetch party accounts' });
    }
  });

  app.post('/api/parties', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      if (!req.body?.name || !String(req.body.name).trim()) {
        return res.status(400).json({ success: false, error: 'Party name is required.' });
      }
      res.status(201).json(await upsertPartyAccount(req.body));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to save party account' });
    }
  });

  app.delete('/api/parties/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deletePartyAccount(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete party account' });
    }
  });

  app.get('/api/return-notes', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      res.json(await getAllReturnNotes());
    } catch {
      res.status(500).json({ error: 'Failed to fetch return notes' });
    }
  });

  app.post('/api/return-notes', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const { quantity, totalAmount } = req.body || {};
      if (Number(quantity || 0) <= 0 || Number(totalAmount || 0) <= 0) {
        return res.status(400).json({ success: false, error: 'Quantity and amount must be greater than 0.' });
      }
      res.status(201).json(await addReturnNote(req.body));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to save return note' });
    }
  });

  app.delete('/api/return-notes/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteReturnNote(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete return note' });
    }
  });

  app.get('/api/fixed-assets', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      res.json(await getAllFixedAssets());
    } catch {
      res.status(500).json({ error: 'Failed to fetch fixed assets' });
    }
  });

  app.post('/api/fixed-assets', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const cost = Number(req.body?.costValue ?? req.body?.purchaseCost ?? 0);
      if (!req.body?.assetName || cost <= 0) {
        return res.status(400).json({ success: false, error: 'Asset name and cost value are required.' });
      }
      res.status(201).json(await upsertFixedAsset(req.body));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to save fixed asset' });
    }
  });

  app.put('/api/fixed-assets/:id', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const cost = Number(req.body?.costValue ?? req.body?.purchaseCost ?? 0);
      if (!req.body?.assetName || cost <= 0) {
        return res.status(400).json({ success: false, error: 'Asset name and cost value are required.' });
      }
      res.json(await upsertFixedAsset({ ...req.body, id: req.params.id }));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to update fixed asset' });
    }
  });

  app.delete('/api/fixed-assets/:id', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteFixedAsset(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete fixed asset' });
    }
  });

  app.get('/api/drawer-closings', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      res.json(await getAllDrawerClosings());
    } catch {
      res.status(500).json({ error: 'Failed to fetch drawer closings' });
    }
  });

  app.post('/api/drawer-closings', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      res.status(201).json(await addDrawerClosing(req.body));
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to save drawer closing' });
    }
  });

  app.delete('/api/drawer-closings/:id', requireAdminOrDeveloper, requireCloudStorageActive, async (req, res) => {
    try {
      await deleteDrawerClosing(req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete drawer closing' });
    }
  });

  // ==========================================
  // CASHIERS API ROUTES
  // ==========================================
  app.get('/api/cashiers', async (req, res) => {
    try {
      const data = await getAllCashiers();
      res.json(
        data
          .filter((c) => c.role !== 'Developer')
          .map((c) => {
            const safe = sanitizeCashierForClient(c);
            delete safe.email;
            delete safe.isDeveloper;
            return safe;
          })
      );
    } catch (error) {
      console.error('Error fetching cashiers:', error);
      res.status(500).json({ error: 'Failed to fetch cashiers' });
    }
  });

  app.post('/api/cashiers', requireAdminOrDeveloper, async (req, res) => {
    try {
      const payload = { ...(req.body || {}) };
      if (payload.role === 'Developer') {
        payload.role = 'POS Cashier';
      }
      const created = await createCashier(payload);
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating cashier:', error);
      res.status(500).json({ error: 'Failed to create cashier' });
    }
  });

  app.put('/api/cashiers/:id', requireAdminOrDeveloper, async (req, res) => {
    try {
      const all = await getAllCashiers();
      const target = all.find((c) => c.id === req.params.id);
      if (target?.role === 'Developer') {
        return res.status(403).json({ error: 'Developer account is managed exclusively via Developer Tab.' });
      }
      const updates = { ...(req.body || {}) };
      if (updates.role === 'Developer') delete updates.role;
      await updateCashier(req.params.id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating cashier:', error);
      res.status(500).json({ error: 'Failed to update cashier' });
    }
  });

  app.delete('/api/cashiers/:id', requireAdminOrDeveloper, async (req, res) => {
    try {
      const all = await getAllCashiers();
      const target = all.find((c) => c.id === req.params.id);
      if (target?.role === 'Developer') {
        return res.status(403).json({ error: 'Developer account cannot be removed from Admin Center.' });
      }
      await deleteCashier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting cashier:', error);
      res.status(500).json({ error: 'Failed to delete cashier' });
    }
  });

  // ==========================================
  // ADMIN SETTINGS API ROUTES
  // ==========================================
  app.get('/api/settings', async (req, res) => {
    try {
      const data = await getAdminSettings();
      res.json(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', requireAdminOrDeveloper, async (req, res) => {
    try {
      await updateAdminSettings(req.body);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // ==========================================
  // CATEGORIES API ROUTES
  // ==========================================
  app.get('/api/categories', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllCategories();
      res.json(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  app.post('/api/categories', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      await addCategory(req.body.name);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Error adding category:', error);
      res.status(500).json({ error: 'Failed to add category' });
    }
  });

  app.put('/api/categories', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      await renameCategory(req.body.oldName, req.body.newName);
      res.json({ success: true });
    } catch (error) {
      console.error('Error renaming category:', error);
      res.status(500).json({ error: 'Failed to rename category' });
    }
  });

  // ==========================================
  // AUDIT LOGS API ROUTES
  // ==========================================
  app.get('/api/audit-logs', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllAuditLogs();
      res.json(data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  app.post('/api/audit-logs', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      await addAuditLogEntry(req.body);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Error saving audit log:', error);
      res.status(500).json({ error: 'Failed to save audit log' });
    }
  });

  // ==========================================
  // LOOSE PACKETS API ROUTES
  // ==========================================
  app.get('/api/loose-packets', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      const data = await getAllLoosePackets();
      res.json(data);
    } catch (error) {
      console.error('Error fetching loose packets:', error);
      res.status(500).json({ error: 'Failed to fetch loose packets' });
    }
  });

  app.post('/api/loose-packets', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const packets = Array.isArray(req.body) ? req.body : [req.body];
      const errors = [];

      for (const pk of packets) {
        const result = await saveLoosePacketRecord(pk);
        if (!result.success) {
          errors.push(result.error);
        }
      }

      if (errors.length > 0) {
        res.status(400).json({ success: false, error: 'Failed to save some loose packets', errors });
      } else {
        res.status(201).json({ success: true });
      }
    } catch (error) {
      console.error('Error saving loose packet:', error);
      res.status(500).json({ error: 'Failed to save loose packet' });
    }
  });

  app.put('/api/loose-packets/:barcode', requireLoggedInAuthorizedMember, requireCloudStorageActive, async (req, res) => {
    try {
      const { status, soldAtInvoiceNo, soldDate } = req.body;
      await updateLoosePacketStatus(req.params.barcode, status, soldAtInvoiceNo, soldDate);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating loose packet:', error);
      res.status(500).json({ error: 'Failed to update loose packet' });
    }
  });

  app.delete('/api/loose-packets/:id', requireLoggedInAuthorizedMember, async (req, res) => {
    try {
      await deleteLoosePacketRecord(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting loose packet:', error);
      res.status(500).json({ error: 'Failed to delete loose packet' });
    }
  });

  // Return clean JSON 404 for unknown API paths instead of SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  const distDir = path.join(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
  const serveProductionDist = process.env.NODE_ENV !== 'development' && hasDist;

  if (serveProductionDist) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
    console.log('Serving production build from dist');
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
