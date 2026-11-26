/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  CloudOff,
  Database,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  INITIAL_PRODUCTS,
  INITIAL_LEDGER,
  INITIAL_CASHIERS,
  INITIAL_ADMIN_SETTINGS,
  INITIAL_AUDIT_LOGS,
  SOCIETY_INFO,
  CATEGORIES,
} from './data/initialData';
import {
  Product,
  CartItem,
  SaleTransactionItem,
  CompleteInvoice,
  PaymentMode,
  SocietyProfile,
  CashierUser,
  AdminStoreSettings,
  AdminAuditLog,
  LoosePacket,
  PurchaseTransaction,
  PurchaseEntryType,
  GstGovtPayment,
  AccountLedgerVoucher,
  PartyAccount,
  ReturnNote,
  FixedAsset,
  DailyDrawerClosing,
  HeldCartBill,
} from './types';
import { getStoredLoosePackets, saveLoosePackets } from './utils/looseBarcode';
import { getIstDateStr, getIstTimeStr, getIstDateTimeStr } from './utils/dateUtils';
import { Navbar } from './components/Navbar';
import { RightSidebar, AppTabId } from './components/RightSidebar';
import { PosTerminal } from './components/PosTerminal';
import { InventoryManager } from './components/InventoryManager';
import { DayCashierSummary } from './components/DayCashierSummary';
import { CashDrawerSummary } from './components/CashDrawerSummary';
import { QrScannerModal } from './components/QrScannerModal';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptModal } from './components/ReceiptModal';
import { ProductQrModal } from './components/ProductQrModal';
import { BarcodePrintModal } from './components/BarcodePrintModal';
import { CashierLogin } from './components/CashierLogin';
import { AdminControlPanel } from './components/AdminControlPanel';
import { LooseWeighingModal } from './components/LooseWeighingModal';
import { BackupModal } from './components/BackupModal';
import { InvoiceManager } from './components/InvoiceManager';
import { PurchaseSummaryManager } from './components/PurchaseSummaryManager';
import { BalanceSheetManager } from './components/BalanceSheetManager';
import { FixedAssetRegisterManager } from './components/FixedAssetRegisterManager';
import { GstAnalysisManager } from './components/GstAnalysisManager';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { SplashScreen } from './components/SplashScreen';
import { FillExistingOptions } from './components/FillExistingProductModal';
import { BulkImportRowInput, BulkImportSummary } from './components/BulkExcelImportModal';
import { generateUniqueBarcode } from './utils/productImages';
import {
  api,
  authFetch,
  fetchWithWakeupRetry,
  clearSessionToken,
  getSessionToken,
  onSessionInvalidated,
} from './utils/api';
import {
  getTransactionMode,
  isPurchaseEnabled,
  isSellEnabled,
} from './utils/transactionControl';

const STORAGE_KEYS = {
  PRODUCTS: 'nabkul_coop_products_v1',
  LEDGER: 'nabkul_coop_ledger_v1',
  CASHIERS: 'nabkul_coop_cashiers_v1',
  CASHIER: 'nabkul_logged_cashier_v1',
  ADMIN_SETTINGS: 'nabkul_admin_settings_v1',
  AUDIT_LOGS: 'nabkul_audit_logs_v1',
  CATEGORIES: 'nabkul_coop_categories_v1',
  LOOSE_PACKETS: 'nabkul_coop_loose_packets_v1',
  PURCHASES: 'nabkul_coop_purchases_v1',
  GST_PAYMENTS: 'nabkul_coop_gst_payments_v1',
  ACCOUNT_VOUCHERS: 'nabkul_coop_account_vouchers_v1',
  PARTIES: 'nabkul_coop_parties_v1',
  RETURN_NOTES: 'nabkul_coop_return_notes_v1',
  FIXED_ASSETS: 'nabkul_coop_fixed_assets_v1',
  DRAWER_CLOSINGS: 'nabkul_coop_drawer_closings_v1',
  HELD_BILLS: 'nabkul_coop_held_bills_v1',
  SYNC_PING: 'nabkul_coop_sync_ping_v1',
};

function getExGstSellingPrice(product: Product): number {
  const wd = Number(product.sellingPriceWD || 0);
  if (wd > 0) return Number(wd.toFixed(2));
  const gstPct = Number(product.gstPercent || 0);
  const withGst = Number(product.sellingPriceWithGst || 0);
  const rawSell = Number(product.sellingPrice || 0);
  if (withGst > 0 && rawSell > 0 && Math.abs(withGst - rawSell) > 0.01) {
    return Number(rawSell.toFixed(2));
  }
  if (withGst > 0 && gstPct > 0) {
    return Number((withGst / (1 + gstPct / 100)).toFixed(2));
  }
  return Number((rawSell || withGst || 0).toFixed(2));
}

const SYNC_CHANNEL_NAME = 'nabkul_pos_sync_channel_v1';

export default function App() {
  // 8-second opening splash screen with society emblem
  const [showSplash, setShowSplash] = useState(true);
  const [isRefreshingStore, setIsRefreshingStore] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState<{
    type: 'success' | 'warning';
    message: string;
    time: string;
  } | null>(null);
  const isRefreshingRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<AppTabId>('pos');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // All database state is loaded directly from Supabase tables (no localStorage or temporary cache)
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [products, setProducts] = useState<Product[]>([]);
  const [ledger, setLedger] = useState<SaleTransactionItem[]>([]);
  const [cashiers, setCashiers] = useState<CashierUser[]>(INITIAL_CASHIERS);
  const [adminSettings, setAdminSettings] = useState<AdminStoreSettings>(INITIAL_ADMIN_SETTINGS);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loosePackets, setLoosePackets] = useState<LoosePacket[]>([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState<PurchaseTransaction[]>([]);
  const [gstPayments, setGstPayments] = useState<GstGovtPayment[]>([]);
  const [accountVouchers, setAccountVouchers] = useState<AccountLedgerVoucher[]>([]);
  const [partyAccounts, setPartyAccounts] = useState<PartyAccount[]>([]);
  const [returnNotes, setReturnNotes] = useState<ReturnNote[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [drawerClosings, setDrawerClosings] = useState<DailyDrawerClosing[]>([]);
  const [heldBills, setHeldBills] = useState<HeldCartBill[]>([]);

  // Auth state: always require verified active logged-in session (no localStorage auto-login bypass)
  const [currentCashier, setCurrentCashier] = useState<CashierUser | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const currentCashierRef = useRef<CashierUser | null>(null);
  useEffect(() => {
    currentCashierRef.current = currentCashier;
  }, [currentCashier]);

  const [society, setSociety] = useState<SocietyProfile>(SOCIETY_INFO);
  const pendingSaleItemsRef = useRef<Map<string, SaleTransactionItem[]>>(new Map());

  // Live Cloud Storage Status — when connected === false, ALL transactions are strictly blocked and a big centered screen alert is displayed
  const [cloudStatus, setCloudStatus] = useState<{
    connected: boolean;
    checked: boolean;
    message: string;
    reconnecting: boolean;
  }>({
    connected: true,
    checked: false,
    message: 'Verifying live Cloud Storage connection...',
    reconnecting: false,
  });

  const checkCloudStorageStatus = useCallback(async (reconnect = false): Promise<boolean> => {
    try {
      if (reconnect) {
        setCloudStatus((prev) => ({ ...prev, reconnecting: true }));
      }
      const res = await fetchWithWakeupRetry(
        `/api/supabase/status${reconnect ? '?reconnect=1' : ''}`,
        { cache: 'no-store' },
        2
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const isConnected = Boolean(data?.connected);
      setCloudStatus({
        connected: isConnected,
        checked: true,
        message: String(
          data?.message ||
            (isConnected
              ? 'Connected to Cloud Storage'
              : 'Cloud Storage is disconnected or unreachable.')
        ),
        reconnecting: false,
      });
      return isConnected;
    } catch {
      setCloudStatus({
        connected: false,
        checked: true,
        message: 'Unable to reach Cloud Storage server.',
        reconnecting: false,
      });
      return false;
    }
  }, []);

  useEffect(() => {
    checkCloudStorageStatus(false);
    const interval = window.setInterval(() => {
      checkCloudStorageStatus(false);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [checkCloudStorageStatus]);

  const ensureCloudStorageActive = useCallback((): boolean => {
    if (!cloudStatus.connected) {
      checkCloudStorageStatus(false);
      return false;
    }
    return true;
  }, [cloudStatus.connected, checkCloudStorageStatus]);

  const notifyOtherWindows = useCallback((reason: string, syncCloud = false) => {
    const payload = { reason, syncCloud, ts: Date.now() };
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
        ch.postMessage(payload);
        ch.close();
      }
    } catch {}
  }, []);

  // Data Fetching from Database Backend API
  const reloadStoreData = useCallback(async (options?: { syncCloud?: boolean }): Promise<boolean> => {
    await checkCloudStorageStatus(false);
    if (!getSessionToken()) return false;
    try {
      if (options?.syncCloud) {
        await authFetch('/api/supabase/refresh', { cache: 'no-store' }).catch(() => null);
      }

      const [
        dataProducts,
        dataLedger,
        dataCashiers,
        dataSettings,
        dataCategories,
        dataAuditLogs,
        dataLoosePackets,
        dataPurchases,
        dataGstPayments,
        dataAccountVouchers,
        dataParties,
        dataReturnNotes,
        dataFixedAssets,
        dataDrawerClosings,
      ] = await Promise.all([
        api.get<Product[]>('/products').catch(() => null),
        api.get<SaleTransactionItem[]>('/ledger').catch(() => null),
        api.get<CashierUser[]>('/cashiers').catch(() => null),
        api.get<AdminStoreSettings>('/settings').catch(() => null),
        api.get<string[]>('/categories').catch(() => null),
        api.get<AdminAuditLog[]>('/audit-logs').catch(() => null),
        api.get<LoosePacket[]>('/loose-packets').catch(() => null),
        api.get<PurchaseTransaction[]>('/purchases').catch(() => null),
        api.get<GstGovtPayment[]>('/gst-payments').catch(() => null),
        api.get<AccountLedgerVoucher[]>('/account-vouchers').catch(() => null),
        api.get<PartyAccount[]>('/parties').catch(() => null),
        api.get<ReturnNote[]>('/return-notes').catch(() => null),
        api.get<FixedAsset[]>('/fixed-assets').catch(() => null),
        api.get<DailyDrawerClosing[]>('/drawer-closings').catch(() => null),
      ]);

      if (Array.isArray(dataProducts)) {
        setProducts(dataProducts);
        const productById = new Map<number, Product>(
          dataProducts.map((p) => [Number(p.id), p])
        );
        setCart((prevCart) =>
          prevCart.map((item) => {
            const latest = productById.get(Number(item.product.id));
            return latest ? { ...item, product: latest } : item;
          })
        );
      }
      if (Array.isArray(dataLedger)) {
        let finalLedger = dataLedger;

        // Preserve any in-flight checkout invoices while /api/ledger finishes syncing
        const seenFinalInv = new Set(finalLedger.map((it) => String(it.invoiceNo || '')));
        const pendingExtras: SaleTransactionItem[] = [];
        pendingSaleItemsRef.current.forEach((itemsList, invKey) => {
          if (!seenFinalInv.has(invKey)) {
            pendingExtras.push(...itemsList);
          }
        });
        if (pendingExtras.length > 0) {
          finalLedger = [...pendingExtras, ...finalLedger];
        }

        const sorted = [...finalLedger].sort((a, b) => {
          const dateCmp = String(b.saleDate || '').localeCompare(String(a.saleDate || ''));
          if (dateCmp !== 0) return dateCmp;
          return Number(b.saleItemId || 0) - Number(a.saleItemId || 0);
        });
        setLedger(sorted);
      }
      if (dataCashiers && Array.isArray(dataCashiers) && dataCashiers.length > 0) {
        setCashiers(dataCashiers);
      }
      if (dataSettings && typeof dataSettings === 'object' && Object.keys(dataSettings).length > 0) {
        setAdminSettings(dataSettings);
      }
      if (Array.isArray(dataCategories)) {
        setCategories(dataCategories);
      }
      if (Array.isArray(dataAuditLogs)) {
        setAuditLogs(dataAuditLogs);
      }
      if (Array.isArray(dataLoosePackets)) {
        setLoosePackets(dataLoosePackets);
      }
      if (Array.isArray(dataPurchases)) {
        const sortedPurchases = [...dataPurchases].sort((a, b) => {
          const cmp = String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || ''));
          return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
        });
        setPurchaseTransactions(sortedPurchases);
      }
      if (Array.isArray(dataGstPayments)) {
        const sortedGst = [...dataGstPayments].sort((a, b) => {
          const cmp = String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''));
          return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
        });
        setGstPayments(sortedGst);
      }
      if (Array.isArray(dataAccountVouchers)) {
        const sortedVouchers = [...dataAccountVouchers].sort((a, b) => {
          const cmp = String(b.voucherDate || '').localeCompare(String(a.voucherDate || ''));
          return cmp !== 0 ? cmp : String(b.id).localeCompare(String(a.id));
        });
        setAccountVouchers(sortedVouchers);
      }
      if (Array.isArray(dataParties)) {
        setPartyAccounts(dataParties);
      }
      if (Array.isArray(dataReturnNotes)) {
        setReturnNotes(dataReturnNotes);
      }
      if (Array.isArray(dataFixedAssets)) {
        setFixedAssets(dataFixedAssets);
      }
      if (Array.isArray(dataDrawerClosings)) {
        setDrawerClosings(dataDrawerClosings);
      }

      setRefreshNonce((prev) => prev + 1);
      return Boolean(Array.isArray(dataProducts) || Array.isArray(dataLedger));
    } catch (error) {
      console.warn('Backend API notice:', error);
      return false;
    }
  }, [checkCloudStorageStatus]);

  const handleAddGstPayment = useCallback(
    async (paymentInput: Omit<GstGovtPayment, 'id' | 'performedBy'>): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      const performedBy = currentCashier
        ? `${currentCashier.name} (${currentCashier.staffCode})`
        : 'SYSTEM ADMIN';
      const newEntry: GstGovtPayment = {
        ...paymentInput,
        id: `gstpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        performedBy,
      };
      try {
        const res = await authFetch('/api/gst-payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEntry),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: GstGovtPayment = data?.payment || newEntry;
        setGstPayments((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
        notifyOtherWindows('GST_PAYMENT_ADDED', false);
        return true;
      } catch (e) {
        console.error('Failed to record Govt GST payment:', e);
        return false;
      }
    },
    [currentCashier, notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleDeleteGstPayment = useCallback(
    async (id: string): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch(`/api/gst-payments/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        setGstPayments((prev) => prev.filter((p) => p.id !== id));
        notifyOtherWindows('GST_PAYMENT_DELETED', false);
        return true;
      } catch (e) {
        console.error('Failed to delete Govt GST payment:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleAddAccountVoucher = useCallback(
    async (
      voucherInput: Omit<AccountLedgerVoucher, 'id' | 'performedBy'>
    ): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      const performedBy = currentCashier
        ? `${currentCashier.name} (${currentCashier.staffCode})`
        : 'SYSTEM ADMIN';
      const newEntry: AccountLedgerVoucher = {
        ...voucherInput,
        id: `acctv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        performedBy,
      };
      try {
        const res = await authFetch('/api/account-vouchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEntry),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: AccountLedgerVoucher = data?.voucher || newEntry;
        setAccountVouchers((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
        notifyOtherWindows('ACCOUNT_VOUCHER_ADDED', false);
        return true;
      } catch (e) {
        console.error('Failed to record account ledger voucher:', e);
        return false;
      }
    },
    [currentCashier, notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleDeleteAccountVoucher = useCallback(
    async (id: string): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch(`/api/account-vouchers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        setAccountVouchers((prev) => prev.filter((v) => v.id !== id));
        notifyOtherWindows('ACCOUNT_VOUCHER_DELETED', false);
        return true;
      } catch (e) {
        console.error('Failed to delete account ledger voucher:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleAddParty = useCallback(
    async (partyInput: Omit<PartyAccount, 'id' | 'createdAt'>): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch('/api/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partyInput),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: PartyAccount = data?.party;
        if (saved) {
          setPartyAccounts((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
        }
        notifyOtherWindows('PARTY_ADDED', false);
        return true;
      } catch (e) {
        console.error('Failed to add party:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleSavePartyAccount = useCallback(
    async (partyInput: PartyAccount): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch('/api/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partyInput),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: PartyAccount = data?.party;
        if (saved) {
          setPartyAccounts((prev) => [...prev.filter((p) => p.id !== saved.id), saved]);
        }
        notifyOtherWindows('PARTY_UPDATED', false);
        return true;
      } catch (e) {
        console.error('Failed to save party account:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleDeleteParty = useCallback(
    async (id: string): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch(`/api/parties/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        setPartyAccounts((prev) => prev.filter((p) => p.id !== id));
        notifyOtherWindows('PARTY_DELETED', false);
        return true;
      } catch (e) {
        console.error('Failed to delete party:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleAddReturnNote = useCallback(
    async (noteInput: Omit<ReturnNote, 'id' | 'performedBy'>): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      const performedBy = currentCashier
        ? `${currentCashier.name} (${currentCashier.staffCode})`
        : 'SYSTEM ADMIN';
      try {
        const res = await authFetch('/api/return-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...noteInput, performedBy }),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: ReturnNote = data?.note;
        if (saved) {
          setReturnNotes((prev) => [saved, ...prev.filter((n) => n.id !== saved.id)]);
        }
        await reloadStoreData({ syncCloud: false });
        notifyOtherWindows('RETURN_NOTE_ADDED', false);
        return true;
      } catch (e) {
        console.error('Failed to add return note:', e);
        return false;
      }
    },
    [currentCashier, reloadStoreData, notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleDeleteReturnNote = useCallback(
    async (id: string): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch(`/api/return-notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        setReturnNotes((prev) => prev.filter((n) => n.id !== id));
        await reloadStoreData({ syncCloud: false });
        notifyOtherWindows('RETURN_NOTE_DELETED', false);
        return true;
      } catch (e) {
        console.error('Failed to delete return note:', e);
        return false;
      }
    },
    [reloadStoreData, notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleAddFixedAsset = useCallback(
    async (assetInput: Omit<FixedAsset, 'id'> & { id?: string }): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch('/api/fixed-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assetInput),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: FixedAsset = data?.asset;
        if (saved) {
          setFixedAssets((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
        }
        notifyOtherWindows('FIXED_ASSET_SAVED', false);
        return true;
      } catch (e) {
        console.error('Failed to save fixed asset:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleDeleteFixedAsset = useCallback(
    async (id: string): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch(`/api/fixed-assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        setFixedAssets((prev) => prev.filter((a) => a.id !== id));
        notifyOtherWindows('FIXED_ASSET_DELETED', false);
        return true;
      } catch (e) {
        console.error('Failed to delete fixed asset:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleSaveDrawerClosing = useCallback(
    async (closingInput: Omit<DailyDrawerClosing, 'id' | 'closedAt'>): Promise<boolean> => {
      if (!ensureCloudStorageActive()) return false;
      try {
        const res = await authFetch('/api/drawer-closings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(closingInput),
        });
        if (res.status === 503) {
          checkCloudStorageStatus(false);
          return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const saved: DailyDrawerClosing = data?.closing;
        if (saved) {
          setDrawerClosings((prev) => [saved, ...prev.filter((c) => c.closingDate !== saved.closingDate)]);
        }
        notifyOtherWindows('DRAWER_CLOSING_SAVED', false);
        return true;
      } catch (e) {
        console.error('Failed to save drawer closing:', e);
        return false;
      }
    },
    [notifyOtherWindows, ensureCloudStorageActive, checkCloudStorageStatus]
  );

  const handleGlobalRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshingStore(true);
    try {
      const ok = await reloadStoreData({ syncCloud: true });
      notifyOtherWindows('MANUAL_REFRESH', false);
      const timeStr = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setRefreshNotice({
        type: ok ? 'success' : 'warning',
        message: ok
          ? 'Database & all windows synchronized with latest data'
          : 'Could not reach server; showing latest cached data',
        time: timeStr,
      });
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => {
        setRefreshNotice(null);
      }, 4000);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshingStore(false);
    }
  }, [reloadStoreData, notifyOtherWindows]);

  // Pre-login public bootstrap: fetch staff selector list and store transaction notice without bypassing auth
  useEffect(() => {
    if (currentCashier) return;
    let active = true;
    Promise.all([
      fetchWithWakeupRetry('/api/cashiers', { cache: 'no-store' }, 2)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchWithWakeupRetry('/api/settings', { cache: 'no-store' }, 2)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([dataCashiers, dataSettings]) => {
      if (!active) return;
      if (Array.isArray(dataCashiers) && dataCashiers.length > 0) {
        setCashiers(dataCashiers);
      }
      if (dataSettings && typeof dataSettings === 'object' && Object.keys(dataSettings).length > 0) {
        setAdminSettings(dataSettings);
      }
    });
    return () => {
      active = false;
    };
  }, [currentCashier]);

  // Authenticated workspace bootstrap + live email-authorization & logged-in position enforcement
  useEffect(() => {
    if (!currentCashier) return;
    reloadStoreData({ syncCloud: true });

    const forceSignOutWithReason = (reason?: string) => {
      clearSessionToken();
      setCurrentCashier(null);
      setActiveTab('pos');
      setSessionNotice(
        reason ||
          'Sorry You are Not Authorised to open This, please connect with 7602496460.'
      );
    };

    const unsubscribe = onSessionInvalidated(forceSignOutWithReason);

    const checkSession = async () => {
      const token = getSessionToken();
      if (!token) {
        forceSignOutWithReason('Session token missing. Please sign in.');
        return;
      }
      try {
        const res = await authFetch('/api/auth/session', { cache: 'no-store' });
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          forceSignOutWithReason(data?.error);
        }
      } catch {
        // ignore transient network glitches
      }
    };

    const timer = window.setInterval(checkSession, 30000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [currentCashier, reloadStoreData]);

  // Listen for sync pings from other open windows/tabs via BroadcastChannel (no localStorage)
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.onmessage = (event) => {
          if (!currentCashierRef.current) return;
          const data = event?.data;
          reloadStoreData({ syncCloud: Boolean(data?.syncCloud) });
        };
      }
    } catch {}

    return () => {
      if (channel) {
        try {
          channel.close();
        } catch {}
      }
    };
  }, [reloadStoreData]);

  // Cart & Active Sale
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('Walk-in Customer');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [buyerGstin, setBuyerGstin] = useState<string>('');
  const [discountMode, setDiscountMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState<string>('');

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isWeighingStationOpen, setIsWeighingStationOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [paymentModeForModal, setPaymentModeForModal] = useState<PaymentMode>('UPI');
  const [currentReceiptInvoice, setCurrentReceiptInvoice] = useState<CompleteInvoice | null>(null);
  const [selectedProductForQr, setSelectedProductForQr] = useState<Product | null>(null);
  const [isBarcodePrintOpen, setIsBarcodePrintOpen] = useState(false);
  const [barcodePrintSelectedProduct, setBarcodePrintSelectedProduct] = useState<Product | null>(null);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);

  const handleOpenBarcodePrint = (product?: Product | null) => {
    setBarcodePrintSelectedProduct(product || null);
    setIsBarcodePrintOpen(true);
  };

  const addAuditLog = (action: string, details: string) => {
    const timestamp = getIstDateTimeStr();
    const newLog: AdminAuditLog = {
      id: `audit-${Date.now()}`,
      timestamp,
      action,
      performedBy: currentCashier ? `${currentCashier.name} (${currentCashier.staffCode})` : 'SYSTEM ADMIN',
      details,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    api.post('/audit-logs', newLog).catch((err) => console.warn('Audit log API notice:', err));
  };

  const handleLoginSuccess = (cashier: CashierUser, counter: string) => {
    setSessionNotice(null);
    setCurrentCashier(cashier);
    setSociety((prev) => ({
      ...prev,
      cashierName: `${cashier.name} (${cashier.staffCode})`,
      counterId: counter,
    }));
    const isUserAdmin = cashier.role === 'System Admin' || cashier.loginId === 'admin';
    setActiveTab(isUserAdmin ? 'admin' : 'pos');
  };

  const handleLogout = async () => {
    try {
      if (getSessionToken()) {
        await authFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // ignore network logout failure
    } finally {
      clearSessionToken();
      setCurrentCashier(null);
      setActiveTab('pos');
    }
  };

  // All persistence is handled directly via Supabase tables through backend API routes (zero browser localStorage caching)

  // Category management handlers
  const handleAddCategory = (newCat: string) => {
    if (!ensureCloudStorageActive()) return;
    const trimmed = newCat.trim();
    if (!trimmed) return;
    setCategories((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    api.post('/categories', { name: trimmed }).catch((err) => console.warn('Category API notice:', err));
    addAuditLog('CATEGORY_ADDED', `Created new product category "${trimmed}"`);
  };

  const handleRenameCategory = (oldCat: string, newCat: string) => {
    if (!ensureCloudStorageActive()) return;
    const trimmedOld = oldCat.trim();
    const trimmedNew = newCat.trim();
    if (!trimmedNew || trimmedOld === trimmedNew) return;
    setCategories((prev) => prev.map((c) => (c === trimmedOld ? trimmedNew : c)));
    setProducts((prev) =>
      prev.map((p) => (p.category === trimmedOld ? { ...p, category: trimmedNew } : p))
    );
    api.put('/categories', { oldName: trimmedOld, newName: trimmedNew }).catch((err) => console.warn('Category API notice:', err));
    addAuditLog('CATEGORY_RENAMED', `Renamed category "${trimmedOld}" to "${trimmedNew}"`);
  };

  // Cashier staff management
  const handleAddCashier = (newCashierData: Omit<CashierUser, 'id'>) => {
    const newId = `cashier-${Date.now()}`;
    const newCashier: CashierUser = {
      ...newCashierData,
      id: newId,
    };
    setCashiers((prev) => [...prev, newCashier]);
    api.post('/cashiers', newCashier).catch((err) => console.warn('Cashier API notice:', err));
    addAuditLog(
      'CASHIER_CREATED',
      `Registered new staff ${newCashier.name} (${newCashier.staffCode}), login: "${newCashier.loginId}", counter: ${newCashier.assignedCounter}`
    );
  };

  const handleRemoveCashier = (cashierId: string) => {
    const target = cashiers.find((c) => c.id === cashierId);
    if (!target) return;
    setCashiers((prev) => prev.filter((c) => c.id !== cashierId));
    api.delete(`/cashiers/${cashierId}`).catch((err) => console.warn('Cashier API notice:', err));
    addAuditLog(
      'CASHIER_REMOVED',
      `Deleted cashier profile: ${target.name} (${target.staffCode}, ID: ${target.loginId})`
    );
  };

  const handleToggleCashierStatus = (cashierId: string) => {
    const target = cashiers.find((c) => c.id === cashierId);
    if (!target) return;
    const nextStatus = !target.isActive;
    setCashiers((prev) =>
      prev.map((c) => (c.id === cashierId ? { ...c, isActive: nextStatus } : c))
    );
    api.put(`/cashiers/${cashierId}`, { isActive: nextStatus }).catch((err) => console.warn('Cashier API notice:', err));
    addAuditLog(
      nextStatus ? 'CASHIER_ACTIVATED' : 'CASHIER_DEACTIVATED',
      `${nextStatus ? 'Activated' : 'Deactivated'} staff login for ${target.name} (${target.staffCode})`
    );
  };

  const handlePasswordUpdated = (updatedCashier: CashierUser) => {
    setCashiers((prev) => prev.map((c) => (c.id === updatedCashier.id ? updatedCashier : c)));
    if (currentCashier && currentCashier.id === updatedCashier.id) {
      setCurrentCashier(updatedCashier);
    }
    reloadStoreData();
  };

  const handleResetPassword = (cashierId: string, newPass: string) => {
    const target = cashiers.find((c) => c.id === cashierId);
    if (!target) return;
    const updatedUser = { ...target, passwordHash: newPass };
    setCashiers((prev) => prev.map((c) => (c.id === cashierId ? updatedUser : c)));
    if (currentCashier && currentCashier.id === cashierId) {
      setCurrentCashier(updatedUser);
    }
    api.put(`/cashiers/${cashierId}`, { passwordHash: newPass }).catch((err) => console.warn('Cashier API notice:', err));
    addAuditLog(
      'PASSWORD_RESET',
      `Updated credentials for ${target.name} (${target.staffCode})`
    );
  };

  const handleUpdateAdminSettings = async (newSettings: AdminStoreSettings) => {
    const prevMode = getTransactionMode(adminSettings);
    const nextMode = getTransactionMode(newSettings);
    const normalizedSettings: AdminStoreSettings = {
      ...newSettings,
      transactionMode: nextMode,
      transactionsEnabled: nextMode === 'BOTH' || nextMode === 'ONLY_SELL',
    };
    setAdminSettings(normalizedSettings);

    try {
      await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedSettings),
      });
    } catch (error) {
      console.error('Failed to sync settings to SQL server:', error);
    }

    if (prevMode !== nextMode) {
      if (nextMode === 'STOP_ALL') {
        addAuditLog(
          'TRANSACTIONS_HALTED',
          `Transaction Category set to STOP TRANSACTION (All Sell & Purchase halted). Reason: ${normalizedSettings.haltReason || 'Administrative freeze'}`
        );
      } else if (nextMode === 'ONLY_SELL') {
        addAuditLog(
          'TRANSACTION_MODE_ONLY_SELL',
          `Transaction Category set to ONLY SELL (POS Sales active; Stock Purchases paused).`
        );
      } else if (nextMode === 'ONLY_PURCHASE') {
        addAuditLog(
          'TRANSACTION_MODE_ONLY_PURCHASE',
          `Transaction Category set to ONLY PURCHASE (Stock Purchases active; POS Sales paused).`
        );
      } else {
        addAuditLog(
          'TRANSACTIONS_RESUMED',
          'Transaction Category set to BOTH (Sell & Purchase transactions active across store).'
        );
      }
    } else {
      addAuditLog('SETTINGS_UPDATED', 'Updated store administrative settings and payment channels.');
    }
  };

  // Next Financial-Year-aware Invoice Number generator
  const getNextInvoiceNo = () => {
    const fyRaw = adminSettings?.financialYear || '2026-27';
    const fyShort = fyRaw.replace(/^20(\d{2})-(\d{2})$/, '$1-$2');
    const existingNumbers = ledger
      .map((item) => {
        const match = String(item.invoiceNo || '').match(/(?:POS-2026-|POS\/\d{2}-\d{2}\/)(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(Boolean);
    const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 3;
    const nextNum = maxNum + 1;
    return `POS/${fyShort}/${nextNum.toString().padStart(4, '0')}`;
  };

  // Cart operations (ex-GST unit base price so GST is applied cleanly once)
  const addToCart = (
    product: Product,
    quantity = 1,
    packetBarcode?: string,
    barcodeMode: 'WITH_BARCODE' | 'WITHOUT_BARCODE' = 'WITH_BARCODE',
    measuredWeightText?: string
  ) => {
    if (!ensureCloudStorageActive()) {
      return;
    }
    if (!isSellEnabled(adminSettings)) {
      return;
    }
    const effectiveSellingPrice = getExGstSellingPrice(product);

    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          (item.barcodeMode || 'WITH_BARCODE') === barcodeMode &&
          (!packetBarcode || item.packetBarcode === packetBarcode)
      );
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((item) =>
          item === existing
            ? {
                ...item,
                quantity: newQty,
                sellingPrice: effectiveSellingPrice,
                lineTotal: Number((newQty * effectiveSellingPrice).toFixed(2)),
                measuredWeightText: measuredWeightText || item.measuredWeightText,
              }
            : item
        );
      } else {
        const qty = Math.min(product.stock, quantity);
        return [
          ...prev,
          {
            product,
            quantity: qty,
            sellingPrice: effectiveSellingPrice,
            lineTotal: Number((qty * effectiveSellingPrice).toFixed(2)),
            packetBarcode,
            barcodeMode,
            saleType: barcodeMode === 'WITHOUT_BARCODE' ? 'DIRECT_LOOSE' : 'BARCODE',
            measuredWeightText,
          },
        ];
      }
    });
  };

  const updateQuantity = (
    productId: number,
    qty: number,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    packetBarcode?: string
  ) => {
    if (qty <= 0) {
      removeFromCart(productId, barcodeMode, packetBarcode);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        const matches =
          item.product.id === productId &&
          (!barcodeMode || (item.barcodeMode || 'WITH_BARCODE') === barcodeMode) &&
          (!packetBarcode || item.packetBarcode === packetBarcode);
        if (matches) {
          const clampedQty = Math.min(item.product.stock, qty);
          return {
            ...item,
            quantity: clampedQty,
            lineTotal: clampedQty * item.sellingPrice,
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (
    productId: number,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    packetBarcode?: string
  ) => {
    setCart((prev) =>
      prev.filter((item) => {
        if (barcodeMode) {
          return !(
            item.product.id === productId &&
            (item.barcodeMode || 'WITH_BARCODE') === barcodeMode &&
            (!packetBarcode || item.packetBarcode === packetBarcode)
          );
        }
        return item.product.id !== productId;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer('Walk-in Customer');
    setSelectedMemberId('');
    setBuyerGstin('');
    setDiscountValue('');
  };

  // Scanned item handler from the QR / Barcode reader modal
  const handleProductScanned = (product: Product, quantity = 1, packetBarcode?: string) => {
    addToCart(product, quantity, packetBarcode);
    setActiveTab('pos');
  };

  // Hold / Park Bill handlers (in-memory only, no localStorage)
  const handleHoldCurrentBill = () => {
    if (cart.length === 0) return;
    const newHeld: HeldCartBill = {
      id: `hold-${Date.now()}`,
      heldAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      customerName: selectedCustomer || 'Walk-in Customer',
      customerId: selectedMemberId || undefined,
      buyerGstin: buyerGstin || undefined,
      items: [...cart],
    };
    setHeldBills((prev) => [newHeld, ...prev]);
    setCart([]);
    setSelectedCustomer('Walk-in Customer');
    setSelectedMemberId('');
    setBuyerGstin('');
    setDiscountValue('');
  };

  const handleResumeHeldBill = (billId: string) => {
    const target = heldBills.find((b) => b.id === billId);
    if (!target) return;
    setCart(target.items);
    setSelectedCustomer(target.customerName);
    setSelectedMemberId(target.customerId || '');
    setBuyerGstin(target.buyerGstin || '');
    setDiscountValue('');
    setHeldBills((prev) => prev.filter((b) => b.id !== billId));
  };

  const handleDiscardHeldBill = (billId: string) => {
    setHeldBills((prev) => prev.filter((b) => b.id !== billId));
  };

  // Initiate Payment
  const handleProceedToPayment = (mode: PaymentMode) => {
    if (!ensureCloudStorageActive()) {
      return;
    }
    if (!isSellEnabled(adminSettings)) {
      return;
    }
    if (cart.length === 0) return;
    setPaymentModeForModal(mode);
    setIsPaymentOpen(true);
  };

  // Complete Payment & Finalize Invoice
  const handlePaymentComplete = async (details: {
    paymentMode: PaymentMode;
    customerName: string;
    customerId?: string;
    buyerGstin?: string;
    tenderedCash?: number;
    changeDue?: number;
    upiTxnRef?: string;
    cashPaid?: number;
    upiPaid?: number;
    creditDue?: number;
  }) => {
    const isLiveCloudActive = await checkCloudStorageStatus(false);
    if (!isLiveCloudActive) {
      setIsPaymentOpen(false);
      return;
    }
    if (!isSellEnabled(adminSettings)) {
      setIsPaymentOpen(false);
      return;
    }

    const invNo = getNextInvoiceNo();
    const dateFormatted = getIstDateTimeStr();

    const rawCartSubtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
    const parsedDiscInput = Math.max(0, Number(discountValue || 0) || 0);
    const memberDiscountAmt =
      rawCartSubtotal > 0 && parsedDiscInput > 0
        ? discountMode === 'PERCENT'
          ? Number(((rawCartSubtotal * Math.min(100, parsedDiscInput)) / 100).toFixed(2))
          : Number(Math.min(rawCartSubtotal, parsedDiscInput).toFixed(2))
        : 0;
    const discFactor =
      rawCartSubtotal > 0 ? Math.max(0, (rawCartSubtotal - memberDiscountAmt) / rawCartSubtotal) : 1;

    // Max sale item id and sale id from existing ledger
    const maxSaleItemId = ledger.reduce((max, it) => Math.max(max, it.saleItemId), 9000);
    const maxSaleId = ledger.reduce((max, it) => Math.max(max, it.saleId), 8000);
    const nextSaleId = maxSaleId + 1;

    // Calculate complete GST, CGST, SGST, and Base breakdowns (Ex-GST Base + GST)
    let totalInvoiceBase = 0;
    let totalInvoiceGst = 0;

    const newLedgerItems: SaleTransactionItem[] = cart.map((item, idx) => {
      const p = item.product;
      const purchaseCost = Number(p.costPrice || 0);
      const gstPct = Number(p.gstPercent || 0);
      const halfGstPct = gstPct > 0 ? gstPct / 2 : 0;
      const hsnCode =
        p.hsnCode || ((p.category || '').toLowerCase().includes('pesti') ? '3808' : '3105');

      const unitExGst = Number((getExGstSellingPrice(p) * discFactor).toFixed(2));
      const itemBase = Number((unitExGst * item.quantity).toFixed(2));
      const lineCgst = Number(((itemBase * halfGstPct) / 100).toFixed(2));
      const lineSgst = lineCgst;
      const lineGst = Number((lineCgst + lineSgst).toFixed(2));
      const lineTotalWithGst = Number((itemBase + lineGst).toFixed(2));

      totalInvoiceBase += itemBase;
      totalInvoiceGst += lineGst;

      const isWithoutBarcode = item.barcodeMode === 'WITHOUT_BARCODE';
      const barcodeValue = isWithoutBarcode
        ? (item.packetBarcode || 'WITHOUT_BARCODE')
        : (item.packetBarcode || item.product.barcode);

      return {
        saleItemId: maxSaleItemId + idx + 1,
        saleId: nextSaleId,
        invoiceNo: invNo,
        saleDate: dateFormatted,
        customerName: details.customerName,
        customerId: details.customerId || selectedMemberId || undefined,
        buyerGstin: details.buyerGstin || buyerGstin || undefined,
        paymentMode: details.paymentMode,
        productId: item.product.id,
        productName: item.product.name,
        barcode: barcodeValue,
        hsnCode,
        quantity: item.quantity,
        unitType: item.product.unit,
        sellingPrice: unitExGst,
        lineTotal: lineTotalWithGst,
        costPrice: purchaseCost,
        sellingPriceWD: unitExGst,
        gstPercent: gstPct,
        cgstPercent: halfGstPct,
        sgstPercent: halfGstPct,
        cgstAmount: lineCgst,
        sgstAmount: lineSgst,
        totalGstAmount: lineGst,
        baseAmount: itemBase,
        cashierName: currentCashier?.name || 'Subrata Roy',
        barcodeMode: isWithoutBarcode ? 'WITHOUT_BARCODE' : 'WITH_BARCODE',
        saleType: isWithoutBarcode ? 'DIRECT_LOOSE' : 'BARCODE',
        measuredWeightText: item.measuredWeightText,
        tenderedCash: details.tenderedCash,
        changeDue: details.changeDue,
        upiTxnRef: details.upiTxnRef,
        cashPaid: details.cashPaid,
        upiPaid: details.upiPaid,
        creditDue: details.creditDue,
        memberDiscount: idx === 0 ? memberDiscountAmt : 0,
      };
    });

    const rawInvoiceTotal = Number((totalInvoiceBase + totalInvoiceGst).toFixed(2));
    const grandTotal = Math.ceil(rawInvoiceTotal);
    const roundOff = Number((grandTotal - rawInvoiceTotal).toFixed(2));
    const totalInvoiceCgst = Number(
      newLedgerItems.reduce((sum, it) => sum + Number(it.cgstAmount || 0), 0).toFixed(2)
    );
    const totalInvoiceSgst = Number(
      newLedgerItems.reduce((sum, it) => sum + Number(it.sgstAmount || 0), 0).toFixed(2)
    );

    // Deduct stock accurately summing all quantities of each product sold (whether barcode or loose)
    const productSoldQtyMap = new Map<number, number>();
    cart.forEach((c) => {
      productSoldQtyMap.set(c.product.id, (productSoldQtyMap.get(c.product.id) || 0) + c.quantity);
    });

    // Local state updates for responsiveness
    setProducts((prev) =>
      prev.map((prod) => {
        const totalSold = productSoldQtyMap.get(prod.id);
        if (totalSold !== undefined && totalSold > 0) {
          return {
            ...prod,
            stock: Math.max(0, Number((prod.stock - totalSold).toFixed(3))),
          };
        }
        return prod;
      })
    );

    setLedger((prev) => [...newLedgerItems, ...prev]);

    // Build complete invoice object for receipt
    const completeInvoice: CompleteInvoice = {
      saleId: nextSaleId,
      invoiceNo: invNo,
      saleDate: dateFormatted,
      customerName: details.customerName,
      customerId: details.customerId || selectedMemberId || undefined,
      buyerGstin: details.buyerGstin || buyerGstin || undefined,
      paymentMode: details.paymentMode,
      items: newLedgerItems.map((c) => ({
        productId: c.productId,
        productName: c.productName,
        barcode: c.barcode,
        hsnCode: c.hsnCode,
        quantity: c.quantity,
        unitType: c.unitType,
        purchasePrice: c.costPrice,
        sellingPriceWD: c.sellingPriceWD,
        gstPercent: c.gstPercent,
        cgstPercent: c.cgstPercent,
        sgstPercent: c.sgstPercent,
        cgstAmount: c.cgstAmount,
        sgstAmount: c.sgstAmount,
        totalGstAmount: c.totalGstAmount,
        baseAmount: c.baseAmount,
        sellingPrice: c.sellingPrice,
        lineTotal: c.lineTotal,
        barcodeMode: c.barcodeMode,
        saleType: c.saleType,
        measuredWeightText: c.measuredWeightText,
      })),
      baseAmount: Number(totalInvoiceBase.toFixed(2)),
      totalGst: Number(totalInvoiceGst.toFixed(2)),
      cgstAmount: Number(totalInvoiceCgst.toFixed(2)),
      sgstAmount: Number(totalInvoiceSgst.toFixed(2)),
      roundOff,
      subtotal: Number(totalInvoiceBase.toFixed(2)),
      discount: memberDiscountAmt,
      memberDiscount: memberDiscountAmt,
      grandTotal,
      cashier: society.cashierName,
      tenderedCash: details.tenderedCash,
      changeDue: details.changeDue,
      upiTxnRef: details.upiTxnRef,
      cashPaid: details.cashPaid,
      upiPaid: details.upiPaid,
      creditDue: details.creditDue,
    };

    // Track as in-flight & open receipt immediately so checkout and reports update with zero 2s lag
    pendingSaleItemsRef.current.set(invNo, newLedgerItems);

    const soldCartSnapshot = [...cart];
    setIsPaymentOpen(false);
    setCart([]);
    setSelectedCustomer('Walk-in Customer');
    setSelectedMemberId('');
    setBuyerGstin('');
    setDiscountValue('');
    setCurrentReceiptInvoice(completeInvoice);

    // SYNC TO SERVER (Saved as 1 row per transaction in Supabase "Invoice Analytics")
    try {
      const invoicePayload = {
        saleId: nextSaleId,
        invoiceNo: invNo,
        saleDate: dateFormatted,
        customerName: details.customerName || 'Walk-in Customer',
        customerId: details.customerId || selectedMemberId || undefined,
        buyerGstin: details.buyerGstin || buyerGstin || undefined,
        paymentMode: details.paymentMode,
        cashierName: currentCashier?.name || society.cashierName || 'Society Administrator',
        totalAmount: grandTotal,
        baseAmount: Number(totalInvoiceBase.toFixed(2)),
        totalGst: Number(totalInvoiceGst.toFixed(2)),
        cgstAmount: Number(totalInvoiceCgst.toFixed(2)),
        sgstAmount: Number(totalInvoiceSgst.toFixed(2)),
        gstSummary: totalInvoiceGst > 0
          ? `Total GST: ₹${totalInvoiceGst.toFixed(2)} (CGST: ₹${totalInvoiceCgst.toFixed(2)}, SGST: ₹${totalInvoiceSgst.toFixed(2)})`
          : 'GST Exempt (0%)',
        totalProducts: soldCartSnapshot.length,
        productsSummary: soldCartSnapshot.map(c => `${c.product.name} (${c.quantity} ${c.product.unit})`).join(', '),
        itemsDetail: newLedgerItems.map((c) => ({
          productId: c.productId,
          productName: c.productName,
          barcode: c.barcode,
          hsnCode: c.hsnCode,
          quantity: c.quantity,
          unitType: c.unitType,
          purchasePrice: c.costPrice,
          sellingPriceWD: c.sellingPriceWD,
          gstPercent: c.gstPercent,
          cgstPercent: c.cgstPercent,
          sgstPercent: c.sgstPercent,
          cgstAmount: c.cgstAmount,
          sgstAmount: c.sgstAmount,
          totalGstAmount: c.totalGstAmount,
          baseAmount: c.baseAmount,
          sellingPrice: c.sellingPrice,
          lineTotal: c.lineTotal,
          barcodeMode: c.barcodeMode,
          saleType: c.saleType,
          measuredWeightText: c.measuredWeightText,
          memberDiscount: c.memberDiscount || 0,
        })),
        tenderedCash: details.tenderedCash || 0,
        changeDue: details.changeDue || 0,
        upiTxnRef: details.upiTxnRef || '',
        cashPaid: details.cashPaid,
        upiPaid: details.upiPaid,
        creditDue: details.creditDue,
        memberDiscount: memberDiscountAmt,
        commitStock: true,
        items: newLedgerItems,
      };

      const ledgerRes = await authFetch('/api/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload),
      });

      const ledgerResData = await ledgerRes.json().catch(() => ({}));

      if (!ledgerRes.ok) {
        const errMsg =
          ledgerResData?.error || 'Invoice recorded locally, but server stock/ledger sync failed.';
        console.warn('[Ledger Sync Notice]', errMsg);
        setRefreshNotice({
          type: 'warning',
          message: errMsg,
          time: getIstTimeStr(),
        });
        if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = window.setTimeout(() => {
          setRefreshNotice(null);
        }, 6000);
      } else if (ledgerResData?.updatedStocks && typeof ledgerResData.updatedStocks === 'object') {
        const stockPatch = ledgerResData.updatedStocks as Record<string, number>;
        setProducts((prev) =>
          prev.map((prod) => {
            const authoritative = stockPatch[String(prod.id)];
            return typeof authoritative === 'number'
              ? { ...prod, stock: authoritative }
              : prod;
          })
        );
      }
    } catch (error) {
      console.warn('Network sync notice:', error);
      setRefreshNotice({
        type: 'warning',
        message: 'Network sync warning: bill saved locally; please refresh before closing counter.',
        time: getIstTimeStr(),
      });
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => {
        setRefreshNotice(null);
      }, 6000);
    } finally {
      pendingSaleItemsRef.current.delete(invNo);
    }

    // Mark any scanned unique loose packets as SOLD in Loose Packet Registry and MySQL
    setLoosePackets((prev) =>
      prev.map((pk) => {
        const matchingCartItem = soldCartSnapshot.find((c) => c.packetBarcode === pk.uniqueBarcode);
        if (matchingCartItem) {
          api.put(`/loose-packets/${pk.uniqueBarcode}`, {
            status: 'SOLD',
            soldAtInvoiceNo: invNo,
            soldDate: dateFormatted,
          }).catch((err) => console.warn('Loose packet status sync:', err));

          return {
            ...pk,
            status: 'SOLD',
            soldAtInvoiceNo: invNo,
            soldDate: dateFormatted,
          };
        }
        return pk;
      })
    );

    addAuditLog(
      'SALE_COMPLETED',
      `Completed Invoice #${invNo} (${details.paymentMode}) by ${society.cashierName} - Total: ₹${grandTotal.toFixed(2)}`
    );

    notifyOtherWindows('SALE_COMPLETED', false);
  };

  const isAdmin =
    currentCashier?.role === 'System Admin' ||
    currentCashier?.loginId === 'admin';

  // Helper to record every product addition / stock fill as a separate purchase transaction
  const recordPurchaseTransaction = async (params: {
    entryType: PurchaseEntryType;
    product: Product;
    previousStock: number;
    addedQuantity: number;
    newStock: number;
    purchasePrice?: number;
    gstPercent?: number;
    batchNo?: string;
    supplierNote?: string;
    supplierId?: string;
    supplierName?: string;
    supplierInvoiceNo?: string;
    paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
  }) => {
    const now = new Date();
    const purchaseDate = getIstDateTimeStr(now);
    const unitPriceWD = Number(
      params.purchasePrice !== undefined ? params.purchasePrice : params.product.costPrice || 0
    );
    const gstPct = Number(
      params.gstPercent !== undefined ? params.gstPercent : params.product.gstPercent ?? 0
    );
    const addedQty = Number(params.addedQuantity || 0);
    const baseAmount = Number((addedQty * unitPriceWD).toFixed(2));
    const totalGstAmount = Number(((baseAmount * gstPct) / 100).toFixed(2));
    const totalAmount = Number((baseAmount + totalGstAmount).toFixed(2));
    const halfGst = Number((totalGstAmount / 2).toFixed(2));
    const dateStamp = getIstDateStr(now).replace(/-/g, '');
    const seq = String(purchaseTransactions.length + 1).padStart(4, '0');

    const tx: PurchaseTransaction = {
      id: `pur-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      purchaseRef: `PUR-${dateStamp}-${seq}`,
      purchaseDate,
      entryType: params.entryType,
      productId: params.product.id,
      productName: params.product.name,
      category: params.product.category,
      barcode: params.product.barcode,
      hsnCode: params.product.hsnCode,
      unit: params.product.unit,
      previousStock: Number(params.previousStock.toFixed(3)),
      addedQuantity: Number(addedQty.toFixed(3)),
      newStock: Number(params.newStock.toFixed(3)),
      purchasePrice: Number(unitPriceWD.toFixed(2)),
      gstPercent: Number(gstPct.toFixed(2)),
      baseAmount,
      cgstAmount: halfGst,
      sgstAmount: halfGst,
      totalGstAmount,
      totalAmount,
      supplierNote: params.supplierNote || '',
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      supplierInvoiceNo: params.supplierInvoiceNo,
      paymentStatus: params.paymentStatus,
      batchNo: params.batchNo || params.product.batchNo || '',
      performedBy: currentCashier
        ? `${currentCashier.name} (${currentCashier.staffCode})`
        : 'SYSTEM ADMIN',
    };

    setPurchaseTransactions((prev) => [tx, ...prev]);

    try {
      await authFetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      notifyOtherWindows('PURCHASE_TRANSACTION', false);
    } catch (err) {
      console.error('Failed to sync purchase transaction:', err);
    }
  };

  // Inventory update handlers
  const handleUpdateProduct = async (updated: Product) => {
    if (!isAdmin) return; // Edit option available strictly in Admin login
    if (!ensureCloudStorageActive()) return;
    if (!isPurchaseEnabled(adminSettings)) {
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    try {
      const res = await authFetch(`/api/products/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.status === 503) {
        checkCloudStorageStatus(false);
        return;
      }
      addAuditLog(
        'PRODUCT_UPDATED',
        `Admin updated product "${updated.name}" (Stock: ${updated.stock} ${updated.unit}, Selling: ₹${updated.sellingPrice.toFixed(2)})`
      );
    } catch (error) {
      console.error('Failed to sync product update to server:', error);
    }
  };

  const handleAddProduct = async (
    newProd: Omit<Product, 'id'>,
    purchaseMeta?: {
      supplierId?: string;
      supplierName?: string;
      supplierInvoiceNo?: string;
      paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
      supplierNote?: string;
    }
  ) => {
    if (!ensureCloudStorageActive()) return;
    if (!isPurchaseEnabled(adminSettings)) {
      return;
    }
    const nextId = products.reduce((max, p) => Math.max(max, p.id), 100) + 1;
    const prodWithId: Product = { ...newProd, id: nextId };
    setProducts((prev) => [...prev, prodWithId]);

    let finalSavedProduct: Product = prodWithId;
    try {
      const res = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProd),
      });
      if (res.status === 503) {
        setProducts((prev) => prev.filter((p) => p.id !== nextId));
        checkCloudStorageStatus(false);
        return;
      }
      if (res.ok) {
        const saved = (await res.json()) as Product;
        finalSavedProduct = saved;
        // Update with actual DB ID if different
        setProducts((prev) => prev.map((p) => (p.id === nextId ? saved : p)));
      }
    } catch (error) {
      console.error('Failed to sync new product to server:', error);
    }

    const matchedSupplier = purchaseMeta?.supplierId
      ? partyAccounts.find((p) => p.id === purchaseMeta.supplierId)
      : undefined;

    await recordPurchaseTransaction({
      entryType: 'NEW_PRODUCT',
      product: finalSavedProduct,
      previousStock: 0,
      addedQuantity: Number(finalSavedProduct.stock || 0),
      newStock: Number(finalSavedProduct.stock || 0),
      purchasePrice: finalSavedProduct.costPrice,
      gstPercent: finalSavedProduct.gstPercent ?? 0,
      batchNo: finalSavedProduct.batchNo,
      supplierId: purchaseMeta?.supplierId,
      supplierName: purchaseMeta?.supplierName || matchedSupplier?.name,
      supplierInvoiceNo: purchaseMeta?.supplierInvoiceNo,
      paymentStatus: purchaseMeta?.paymentStatus || 'BANK_UPI',
      supplierNote: purchaseMeta?.supplierNote || 'New product addition',
    });
  };

  const handleFillExistingProduct = async (
    product: Product,
    addedQuantity: number,
    options?: FillExistingOptions & { entryType?: PurchaseEntryType }
  ): Promise<boolean> => {
    if (!ensureCloudStorageActive()) return false;
    if (!isPurchaseEnabled(adminSettings)) return false;
    if (!Number.isFinite(addedQuantity) || addedQuantity <= 0) return false;

    const previousStock = Number(product.stock || 0);
    const newStock = Number((previousStock + addedQuantity).toFixed(3));
    const nextCostPrice =
      options?.purchasePrice !== undefined ? Number(options.purchasePrice) : product.costPrice;
    const nextGstPercent =
      options?.gstPercent !== undefined ? Number(options.gstPercent) : product.gstPercent ?? 0;
    const nextBatch = options?.batchNo || product.batchNo;
    const nextExpiry = options?.expiryDate ?? product.expiryDate;
    const nextUnit = options?.unit && options.unit !== '0' ? options.unit : product.unit;
    const nextMinStockLevel =
      options?.minStockLevel !== undefined ? Number(options.minStockLevel) : product.minStockLevel;
    const nextSellingPriceWD =
      options?.sellingPriceWD !== undefined ? Number(options.sellingPriceWD) : product.sellingPriceWD;
    const nextSellingPriceWithGst =
      options?.sellingPriceWithGst !== undefined
        ? Number(options.sellingPriceWithGst)
        : product.sellingPriceWithGst;
    const nextSellingPrice =
      options?.sellingPrice !== undefined ? Number(options.sellingPrice) : product.sellingPrice;

    const nextHsn = options?.hsnCode || product.hsnCode;

    const updatedProduct: Product = {
      ...product,
      stock: newStock,
      costPrice: Number.isFinite(nextCostPrice) ? nextCostPrice : product.costPrice,
      gstPercent: Number.isFinite(nextGstPercent) ? nextGstPercent : product.gstPercent ?? 0,
      batchNo: nextBatch,
      expiryDate: nextExpiry,
      unit: nextUnit,
      hsnCode: nextHsn,
      minStockLevel: Number.isFinite(nextMinStockLevel) ? nextMinStockLevel : product.minStockLevel,
      sellingPrice: Number.isFinite(nextSellingPrice) ? nextSellingPrice : product.sellingPrice,
      sellingPriceWD: Number.isFinite(nextSellingPriceWD) ? nextSellingPriceWD : product.sellingPriceWD,
      sellingPriceWithGst: Number.isFinite(nextSellingPriceWithGst)
        ? nextSellingPriceWithGst
        : product.sellingPriceWithGst,
    };

    setProducts((prev) => prev.map((p) => (p.id === product.id ? updatedProduct : p)));

    const updatePayload = {
      stock: updatedProduct.stock,
      costPrice: updatedProduct.costPrice,
      gstPercent: updatedProduct.gstPercent,
      batchNo: updatedProduct.batchNo,
      expiryDate: updatedProduct.expiryDate || '',
      unit: updatedProduct.unit,
      hsnCode: updatedProduct.hsnCode || '',
      minStockLevel: updatedProduct.minStockLevel,
      sellingPrice: updatedProduct.sellingPrice,
      sellingPriceWD: updatedProduct.sellingPriceWD,
      sellingPriceWithGst: updatedProduct.sellingPriceWithGst,
    };

    let syncedOk = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const putRes = await authFetch(`/api/products/${product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        if (putRes.status === 503) {
          checkCloudStorageStatus(false);
          break;
        }
        if (putRes.ok) {
          const json = await putRes.json().catch(() => ({ success: true }));
          if (json?.success !== false) {
            syncedOk = true;
            break;
          }
        }
      } catch (error) {
        console.error(`Stock fill sync attempt ${attempt + 1} failed:`, error);
      }
    }

    if (!syncedOk) {
      // Revert optimistic product update so Stock Catalog and Purchase Log never desync
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
      console.error('Failed to sync existing product stock fill to database.');
      return false;
    }

    await recordPurchaseTransaction({
      entryType: options?.entryType || 'FILL_EXISTING',
      product: updatedProduct,
      previousStock,
      addedQuantity,
      newStock,
      purchasePrice: updatedProduct.costPrice,
      gstPercent: updatedProduct.gstPercent,
      batchNo: nextBatch,
      supplierNote:
        options?.supplierNote || `Added +${addedQuantity} ${nextUnit} to existing stock`,
      supplierId: options?.supplierId,
      supplierName: options?.supplierName,
      supplierInvoiceNo: options?.supplierInvoiceNo,
      paymentStatus: options?.paymentStatus,
    });
    return true;
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!isAdmin) return; // Delete option available strictly in Admin login
    if (!ensureCloudStorageActive()) return;
    const targetProd = products.find((p) => p.id === productId);
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    try {
      const res = await authFetch(`/api/products/${productId}`, {
        method: 'DELETE',
      });
      if (res.status === 503) {
        checkCloudStorageStatus(false);
        return;
      }
      if (targetProd) {
        addAuditLog(
          'PRODUCT_DELETED',
          `Deleted product "${targetProd.name}" (Barcode: ${targetProd.barcode}, ID: ${targetProd.id}) by ${society.cashierName}`
        );
      }
    } catch (error) {
      console.error('Failed to delete product from server:', error);
    }
  };

  // TEMPORARY FEATURE: Bulk Excel Category & Product Importer (defaults/resets other fields to ZERO)
  const handleBulkImportProducts = async (
    rows: BulkImportRowInput[]
  ): Promise<BulkImportSummary> => {
    if (!ensureCloudStorageActive()) {
      return { addedCategories: 0, createdCount: 0, resetCount: 0 };
    }
    if (!isPurchaseEnabled(adminSettings) || rows.length === 0) {
      return { addedCategories: 0, createdCount: 0, resetCount: 0 };
    }

    const existingCatMap = new Map<string, string>();
    categories.forEach((c) => {
      const clean = (c || '').trim();
      if (clean && clean !== 'All Items') {
        existingCatMap.set(clean.toLowerCase(), clean);
      }
    });
    products.forEach((p) => {
      const clean = (p.category || '').trim();
      if (clean && !existingCatMap.has(clean.toLowerCase())) {
        existingCatMap.set(clean.toLowerCase(), clean);
      }
    });

    const newCategoriesToAdd: string[] = [];
    rows.forEach((r) => {
      const catClean = r.category.trim();
      if (catClean && !existingCatMap.has(catClean.toLowerCase())) {
        existingCatMap.set(catClean.toLowerCase(), catClean);
        newCategoriesToAdd.push(catClean);
      }
    });

    if (newCategoriesToAdd.length > 0) {
      setCategories((prev) => {
        const merged = [...prev];
        newCategoriesToAdd.forEach((cat) => {
          if (!merged.some((m) => m.toLowerCase() === cat.toLowerCase())) {
            merged.push(cat);
          }
        });
        return merged;
      });
      await Promise.all(
        newCategoriesToAdd.map((cat) =>
          api.post('/categories', { name: cat }).catch((err) => console.warn('Category bulk API notice:', err))
        )
      );
    }

    let nextId = products.reduce((max, p) => Math.max(max, p.id), 100) + 1;
    const workingCatalog: Product[] = [...products];
    const existingByName = new Map<string, Product>();
    products.forEach((p) => {
      const key = (p.name || '').trim().toLowerCase();
      if (key) existingByName.set(key, p);
    });

    const resetProducts: Product[] = [];
    const createdProducts: { tempId: number; payload: Omit<Product, 'id'>; fullProduct: Product }[] = [];
    const updatedMap = new Map<number, Product>();

    rows.forEach((row) => {
      const cleanName = row.name.trim();
      const rawCat = row.category.trim();
      if (!cleanName || !rawCat) return;

      const resolvedCategory = existingCatMap.get(rawCat.toLowerCase()) || rawCat;
      const matched = existingByName.get(cleanName.toLowerCase());

      if (matched) {
        const zeroed: Product = {
          ...matched,
          category: resolvedCategory,
          unit: '0',
          sellingPrice: 0,
          sellingPriceWD: 0,
          costPrice: 0,
          gstPercent: 0,
          sellingPriceWithGst: 0,
          stock: 0,
          minStockLevel: 0,
          batchNo: '0',
          expiryDate: '',
          description: '0',
        };
        updatedMap.set(matched.id, zeroed);
        resetProducts.push(zeroed);
      } else {
        const uniqueBarcode = generateUniqueBarcode(workingCatalog);
        const tempId = nextId++;
        const payload: Omit<Product, 'id'> = {
          name: cleanName,
          category: resolvedCategory,
          barcode: uniqueBarcode,
          unit: '0',
          sellingPrice: 0,
          sellingPriceWD: 0,
          costPrice: 0,
          gstPercent: 0,
          sellingPriceWithGst: 0,
          stock: 0,
          minStockLevel: 0,
          batchNo: '0',
          expiryDate: '',
          image: '',
          description: '0',
        };
        const fullProduct: Product = { ...payload, id: tempId };
        workingCatalog.push(fullProduct);
        existingByName.set(cleanName.toLowerCase(), fullProduct);
        createdProducts.push({ tempId, payload, fullProduct });
      }
    });

    setProducts((prev) => [
      ...prev.map((p) => updatedMap.get(p.id) || p),
      ...createdProducts.map((c) => c.fullProduct),
    ]);

    // Sync matched existing zero-adjusted products to backend
    for (const zeroed of resetProducts) {
      try {
        await authFetch(`/api/products/${zeroed.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(zeroed),
        });
      } catch (err) {
        console.error('Failed to sync zero-adjusted product:', err);
      }
    }

    // Sync newly created products to backend
    for (const item of createdProducts) {
      try {
        const res = await authFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          const saved = (await res.json()) as Product;
          setProducts((prev) => prev.map((p) => (p.id === item.tempId ? saved : p)));
        }
      } catch (err) {
        console.error('Failed to sync bulk imported product:', err);
      }
    }

    addAuditLog(
      'BULK_EXCEL_IMPORT',
      `Bulk Excel import applied by ${society.cashierName}: +${newCategoriesToAdd.length} categories, +${createdProducts.length} new products (defaults = 0), ${resetProducts.length} existing products adjusted to 0.`
    );

    return {
      addedCategories: newCategoriesToAdd.length,
      createdCount: createdProducts.length,
      resetCount: resetProducts.length,
    };
  };

  // Low stock count for navbar badge
  const lowStockCount = products.filter((p) => p.stock <= p.minStockLevel).length;

  // Active totals with ex-GST base + Optional Checkout Discount (Anyone) + GST + Math.ceil rounding
  const rawExGstSubtotal = cart.reduce(
    (sum, item) => sum + getExGstSellingPrice(item.product) * item.quantity,
    0
  );
  const parsedDiscountInput = Math.max(0, Number(discountValue || 0) || 0);
  const discount =
    rawExGstSubtotal > 0 && parsedDiscountInput > 0
      ? discountMode === 'PERCENT'
        ? Number(((rawExGstSubtotal * Math.min(100, parsedDiscountInput)) / 100).toFixed(2))
        : Number(Math.min(rawExGstSubtotal, parsedDiscountInput).toFixed(2))
      : 0;
  const activeDiscFactor =
    rawExGstSubtotal > 0 ? Math.max(0, (rawExGstSubtotal - discount) / rawExGstSubtotal) : 1;
  const subtotal = Number(Math.max(0, rawExGstSubtotal - discount).toFixed(2));
  const totalGst = cart.reduce((sum, item) => {
    const gstPct = Number(item.product.gstPercent || 0);
    const baseAfterDisc = getExGstSellingPrice(item.product) * activeDiscFactor * item.quantity;
    return sum + (baseAfterDisc * gstPct) / 100;
  }, 0);
  const rawTotal = Number((subtotal + totalGst).toFixed(2));
  const grandTotal = Math.ceil(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  // Security guard: Redirect unauthorized tabs back to POS
  useEffect(() => {
    if (currentCashier && !isAdmin && activeTab === 'admin') {
      setActiveTab('pos');
    }
  }, [currentCashier, isAdmin, activeTab]);

  // Keep active window synchronized with live DB whenever tab changes
  useEffect(() => {
    if (!currentCashier) return;
    if (
      activeTab === 'pos' ||
      activeTab === 'inventory' ||
      activeTab === 'ledger' ||
      activeTab === 'invoices' ||
      activeTab === 'purchase_summary' ||
      activeTab === 'balance_sheet' ||
      activeTab === 'fixed_assets' ||
      activeTab === 'gst_analysis' ||
      activeTab === 'admin'
    ) {
      reloadStoreData({
        syncCloud:
          activeTab === 'balance_sheet' ||
          activeTab === 'fixed_assets' ||
          activeTab === 'gst_analysis' ||
          activeTab === 'invoices' ||
          activeTab === 'admin',
      });
    }
  }, [activeTab, currentCashier, reloadStoreData]);

  const isCloudLocked = Boolean(currentCashier) && cloudStatus.checked && !cloudStatus.connected;

  // When Cloud Storage is not active, close active checkout/scanner modals, blur active inputs, and block any keyboard/barcode/submit events in background windows
  useEffect(() => {
    if (!isCloudLocked) return;

    setIsPaymentOpen(false);
    setIsScannerOpen(false);
    setIsWeighingStationOpen(false);

    const isInsideAllowedOverlay = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      const lockOverlay = document.getElementById('cloud-lock-overlay');
      const backupOverlay = document.getElementById('backup-modal-overlay');
      return Boolean(
        (lockOverlay && lockOverlay.contains(target)) ||
          (backupOverlay && backupOverlay.contains(target))
      );
    };

    if (
      document.activeElement instanceof HTMLElement &&
      !isInsideAllowedOverlay(document.activeElement)
    ) {
      document.activeElement.blur();
    }

    const blockEvent = (e: Event) => {
      if (!isInsideAllowedOverlay(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', blockEvent, true);
    window.addEventListener('keypress', blockEvent, true);
    window.addEventListener('keyup', blockEvent, true);
    window.addEventListener('submit', blockEvent, true);
    window.addEventListener('mousedown', blockEvent, true);
    window.addEventListener('click', blockEvent, true);

    return () => {
      window.removeEventListener('keydown', blockEvent, true);
      window.removeEventListener('keypress', blockEvent, true);
      window.removeEventListener('keyup', blockEvent, true);
      window.removeEventListener('submit', blockEvent, true);
      window.removeEventListener('mousedown', blockEvent, true);
      window.removeEventListener('click', blockEvent, true);
    };
  }, [isCloudLocked]);

  const handleSplashComplete = React.useCallback(() => {
    setShowSplash(false);
  }, []);

  if (showSplash) {
    return (
      <SplashScreen
        societyName={society.name}
        address="Village : Berachampa · Dist. North 24 Parganas"
        durationMs={1800}
        onComplete={handleSplashComplete}
      />
    );
  }

  if (!currentCashier) {
    return (
      <CashierLogin
        cashiers={cashiers}
        society={society}
        onLoginSuccess={handleLoginSuccess}
        adminSettings={adminSettings}
        onPasswordUpdated={handlePasswordUpdated}
        sessionNotice={sessionNotice}
        cloudOffline={cloudStatus.checked && !cloudStatus.connected}
        cloudMessage={cloudStatus.message}
        onRetryCloud={() => checkCloudStorageStatus(true)}
      />
    );
  }

  const handleReconnectCloudStorage = async () => {
    const reconnected = await checkCloudStorageStatus(true);
    if (reconnected) {
      await reloadStoreData({ syncCloud: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans relative">
      {/* Entire Workspace & Active Windows Wrapper — completely disabled (inert + pointer-events-none) when Cloud Storage is Not Active */}
      <div
        inert={isCloudLocked ? true : undefined}
        aria-hidden={isCloudLocked}
        className={`min-h-screen flex flex-col flex-1 ${
          isCloudLocked ? 'pointer-events-none select-none overflow-hidden' : ''
        }`}
      >
        {/* Top Navbar (only attached menus kept: Smart POS & Billing, Scan QR / Barcode, Refresh) */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          society={society}
          cartCount={cart.reduce((sum, i) => sum + i.quantity, 0)}
          onOpenScanner={() => {
            if (!ensureCloudStorageActive()) return;
            setIsScannerOpen(true);
          }}
          currentCashier={currentCashier}
          adminSettings={adminSettings}
          onOpenCloudBackup={isAdmin ? () => setIsBackupOpen(true) : undefined}
          onRefreshAll={handleGlobalRefresh}
          isRefreshingAll={isRefreshingStore}
          refreshNonce={refreshNonce}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          cloudStatus={{ connected: cloudStatus.connected, message: cloudStatus.message }}
          onCloudStatusChange={(next) =>
            setCloudStatus((prev) => ({
              ...prev,
              connected: next.connected,
              checked: true,
              message: next.message || prev.message,
            }))
          }
        />

        {/* Workspace Body: Main Content (Left) + Categorized Right Sidebar */}
        <div className="flex-1 flex items-start min-h-0 relative">
          <main className={`flex-1 min-w-0 print:pb-0 ${activeTab === 'pos' ? 'pb-2' : 'pb-16'}`}>
          {activeTab === 'pos' && (
            <PosTerminal
              products={products}
              cart={cart}
              loosePackets={loosePackets}
              addToCart={addToCart}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              clearCart={clearCart}
              onOpenScanner={() => {
                if (!ensureCloudStorageActive()) return;
                setIsScannerOpen(true);
              }}
              onOpenWeighingStation={() => {
                if (!ensureCloudStorageActive()) return;
                setIsWeighingStationOpen(true);
              }}
              onOpenProductQr={(product) => setSelectedProductForQr(product)}
              onProceedToPayment={handleProceedToPayment}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              selectedMemberId={selectedMemberId}
              setSelectedMemberId={setSelectedMemberId}
              buyerGstin={buyerGstin}
              setBuyerGstin={setBuyerGstin}
              discountMode={discountMode}
              setDiscountMode={setDiscountMode}
              discountValue={discountValue}
              setDiscountValue={setDiscountValue}
              members={partyAccounts.filter((p) => p.partyType === 'MEMBER')}
              heldBills={heldBills}
              onHoldCurrentBill={handleHoldCurrentBill}
              onResumeHeldBill={handleResumeHeldBill}
              onDiscardHeldBill={handleDiscardHeldBill}
              society={society}
              adminSettings={adminSettings}
              categories={categories}
              onRefreshAll={handleGlobalRefresh}
              isRefreshingAll={isRefreshingStore}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryManager
              products={products}
              onUpdateProduct={handleUpdateProduct}
              onAddProduct={handleAddProduct}
              onDeleteProduct={handleDeleteProduct}
              onFillExistingProduct={handleFillExistingProduct}
              purchaseTransactions={purchaseTransactions}
              suppliers={partyAccounts.filter((p) => p.partyType === 'SUPPLIER')}
              isAdmin={isAdmin}
              onOpenProductQr={(product) => setSelectedProductForQr(product)}
              onOpenBarcodePrint={handleOpenBarcodePrint}
              society={society}
              categories={categories.filter((c) => c !== 'All Items')}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onBulkImportProducts={handleBulkImportProducts}
              adminSettings={adminSettings}
            />
          )}

          {activeTab === 'ledger' && (
            <DayCashierSummary
              ledger={ledger}
              cashiers={cashiers}
              onViewInvoice={(inv) => setCurrentReceiptInvoice(inv)}
              societyName={society.name}
            />
          )}

          {activeTab === 'drawer' && (
            <CashDrawerSummary
              ledger={ledger}
              society={society}
              accountVouchers={accountVouchers}
              returnNotes={returnNotes}
              purchaseTransactions={purchaseTransactions}
              gstPayments={gstPayments}
              drawerClosings={drawerClosings}
              adminSettings={adminSettings}
              currentCashierName={society.cashierName}
              onSaveDrawerClosing={handleSaveDrawerClosing}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoiceManager 
              ledger={ledger}
              onViewInvoice={(inv) => setCurrentReceiptInvoice(inv)}
              societyName={society.name}
              onRefreshData={handleGlobalRefresh}
            />
          )}

          {activeTab === 'purchase_summary' && (
            <PurchaseSummaryManager
              products={products}
              ledger={ledger}
              categories={categories}
              purchaseTransactions={purchaseTransactions}
              onViewInvoice={(inv) => setCurrentReceiptInvoice(inv)}
            />
          )}

          {activeTab === 'balance_sheet' && (
            <BalanceSheetManager
              products={products}
              ledger={ledger}
              purchaseTransactions={purchaseTransactions}
              gstPayments={gstPayments}
              accountVouchers={accountVouchers}
              partyAccounts={partyAccounts}
              returnNotes={returnNotes}
              fixedAssets={fixedAssets}
              adminSettings={adminSettings}
              onUpdateAdminSettings={handleUpdateAdminSettings}
              society={society}
              onRefreshData={handleGlobalRefresh}
              onAddAccountVoucher={handleAddAccountVoucher}
              onDeleteAccountVoucher={handleDeleteAccountVoucher}
              onSavePartyAccount={handleSavePartyAccount}
              onAddParty={handleAddParty}
              onDeleteParty={handleDeleteParty}
              onAddReturnNote={handleAddReturnNote}
              onDeleteReturnNote={handleDeleteReturnNote}
              onSaveFixedAsset={handleAddFixedAsset}
              onAddFixedAsset={handleAddFixedAsset}
              onDeleteFixedAsset={handleDeleteFixedAsset}
            />
          )}

          {activeTab === 'fixed_assets' && (
            <FixedAssetRegisterManager
              fixedAssets={fixedAssets}
              society={society}
              onSaveFixedAsset={handleAddFixedAsset}
              onAddFixedAsset={handleAddFixedAsset}
              onDeleteFixedAsset={handleDeleteFixedAsset}
              onRefreshData={handleGlobalRefresh}
            />
          )}

          {activeTab === 'gst_analysis' && (
            <GstAnalysisManager
              products={products}
              ledger={ledger}
              purchaseTransactions={purchaseTransactions}
              gstPayments={gstPayments}
              returnNotes={returnNotes}
              adminSettings={adminSettings}
              onUpdateAdminSettings={handleUpdateAdminSettings}
              society={society}
              onViewInvoice={(inv) => setCurrentReceiptInvoice(inv)}
              onRefreshData={handleGlobalRefresh}
              onAddGstPayment={handleAddGstPayment}
              onDeleteGstPayment={handleDeleteGstPayment}
            />
          )}

          {activeTab === 'admin' && isAdmin && (
            <AdminControlPanel
              cashiers={cashiers}
              currentCashier={currentCashier}
              adminSettings={adminSettings}
              auditLogs={auditLogs}
              onAddCashier={handleAddCashier}
              onRemoveCashier={handleRemoveCashier}
              onToggleCashierStatus={handleToggleCashierStatus}
              onResetPassword={handleResetPassword}
              onUpdateAdminSettings={handleUpdateAdminSettings}
              society={society}
              onExitAdminToPos={() => setActiveTab('pos')}
              onOpenCloudBackup={() => setIsBackupOpen(true)}
              onOpenResetPassword={() => setIsResetPasswordOpen(true)}
              refreshNonce={refreshNonce}
            />
          )}

          </main>

          {/* Right Side Categorized Navigation Sidebar */}
          <RightSidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            lowStockCount={lowStockCount}
            currentCashier={currentCashier}
            society={society}
            adminSettings={adminSettings}
            onOpenWeighingStation={() => {
              if (!ensureCloudStorageActive()) return;
              setIsWeighingStationOpen(true);
            }}
            onOpenBarcodePrint={() => handleOpenBarcodePrint(null)}
            onOpenCloudBackup={isAdmin ? () => setIsBackupOpen(true) : undefined}
            onOpenResetPassword={() => setIsResetPasswordOpen(true)}
            onLogout={handleLogout}
            isMobileOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
        </div>

        {/* Modals inside disabled wrapper so they are also frozen when Cloud Storage is inactive */}
        <ResetPasswordModal
          isOpen={isResetPasswordOpen}
          onClose={() => setIsResetPasswordOpen(false)}
          cashiers={cashiers}
          initialAccountType={isAdmin ? 'admin' : 'user'}
          initialLoginId={currentCashier?.loginId || ''}
          lockAccountType={!isAdmin}
          onPasswordUpdated={handlePasswordUpdated}
        />
        <QrScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          products={products}
          currentCart={cart}
          loosePackets={loosePackets}
          onProductScanned={handleProductScanned}
          onUpdateCartItem={updateQuantity}
          onRemoveCartItem={removeFromCart}
          discountMode={discountMode}
          setDiscountMode={setDiscountMode}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          onProceedToCheckout={() => {
            setIsScannerOpen(false);
            setIsPaymentOpen(true);
          }}
        />

        <LooseWeighingModal
          isOpen={isWeighingStationOpen}
          onClose={() => setIsWeighingStationOpen(false)}
          products={products}
          society={society}
          loosePackets={loosePackets}
          setLoosePackets={setLoosePackets}
          onAddToCart={(product, qtyInBase, packetBarcode) => {
            addToCart(product, qtyInBase, packetBarcode);
          }}
        />

        <PaymentModal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          paymentMode={paymentModeForModal}
          cart={cart}
          grandTotal={grandTotal}
          discount={discount}
          invoiceNo={getNextInvoiceNo()}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          selectedMemberId={selectedMemberId}
          setSelectedMemberId={setSelectedMemberId}
          discountMode={discountMode}
          setDiscountMode={setDiscountMode}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          buyerGstin={buyerGstin}
          members={partyAccounts.filter((p) => p.partyType === 'MEMBER')}
          strictUpiValidation={adminSettings.strictUpiValidation}
          society={society}
          onPaymentComplete={handlePaymentComplete}
          onClearCart={() => {
            clearCart();
            setIsPaymentOpen(false);
          }}
        />

        <ReceiptModal
          isOpen={Boolean(currentReceiptInvoice)}
          onClose={() => setCurrentReceiptInvoice(null)}
          invoice={currentReceiptInvoice}
          society={{
            ...society,
            gstin:
              adminSettings.societyGstin && adminSettings.societyGstin !== '19AAAAD0000A1Z5'
                ? adminSettings.societyGstin
                : society.gstin || '19AAAAD9763A1ZS',
            stateCode: adminSettings.gstStateCode || society.stateCode || '19 - West Bengal',
          }}
          onNewSale={() => {
            setCurrentReceiptInvoice(null);
            setActiveTab('pos');
          }}
        />

        <ProductQrModal
          isOpen={Boolean(selectedProductForQr)}
          onClose={() => setSelectedProductForQr(null)}
          product={selectedProductForQr}
          society={society}
        />

        <BarcodePrintModal
          isOpen={isBarcodePrintOpen}
          onClose={() => {
            setIsBarcodePrintOpen(false);
            setBarcodePrintSelectedProduct(null);
          }}
          products={products}
          society={society}
          initialSelectedProduct={barcodePrintSelectedProduct}
        />

        {refreshNotice && (
          <div
            className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold transition-all ${
              refreshNotice.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/50'
                : 'bg-amber-950 text-amber-100 border-amber-500/50'
            }`}
            role="status"
            aria-live="polite"
          >
            {refreshNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div>
              <div>{refreshNotice.message}</div>
              <div className="text-[10px] opacity-75 font-mono-code">Synced at {refreshNotice.time}</div>
            </div>
            <button
              type="button"
              onClick={() => setRefreshNotice(null)}
              className="ml-1 p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close sync notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* BIG CENTERED SCREEN BLOCKING OVERLAY WHEN CLOUD STORAGE IS NOT ACTIVE — ALWAYS IN FRONT OF ALL WINDOWS & MODALS (z-[9990]) */}
      {isCloudLocked && (
        <div
          id="cloud-lock-overlay"
          className="fixed inset-0 z-[9990] bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 print:hidden"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cloud-offline-lock-title"
        >
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-rose-500/80 rounded-3xl shadow-2xl shadow-rose-950/70 overflow-hidden text-white">
            {/* Top Warning Stripe */}
            <div className="bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 px-6 py-3 flex items-center justify-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-widest text-white shadow-md">
              <ShieldAlert className="w-5 h-5 animate-bounce shrink-0" />
              <span>Cloud Storage Not Active · All Windows &amp; Transactions Disabled</span>
            </div>

            <div className="p-6 sm:p-10 text-center space-y-6">
              {/* Large Center Icon */}
              <div className="mx-auto w-24 h-24 rounded-full bg-rose-500/15 border-2 border-rose-500/50 flex items-center justify-center relative shadow-inner">
                <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
                <CloudOff className="w-12 h-12 text-rose-400 relative z-10" />
              </div>

              {/* Main Big Message */}
              <div className="space-y-2.5">
                <h2
                  id="cloud-offline-lock-title"
                  className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight"
                >
                  Cloud Storage Is Not Active
                </h2>
                <p className="text-base sm:text-xl font-extrabold text-rose-400">
                  No Transaction Is Allowed Until Cloud Storage Is Active
                </p>
                <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
                  All active windows, POS sales, billing, product additions, stock fills, and
                  accounting entries are strictly disabled while Cloud Storage is disconnected or
                  offline. All records are stored exclusively in the live Cloud Database with zero
                  local or temporary files.
                </p>
              </div>

              {/* Diagnostic Status Box */}
              <div className="bg-slate-950/90 border border-rose-500/30 rounded-2xl px-4 py-3.5 max-w-lg mx-auto text-left flex items-start gap-3">
                <Database className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                    Live Cloud Database Status
                  </div>
                  <div className="text-xs sm:text-sm font-mono-code text-slate-200 break-words mt-0.5">
                    {cloudStatus.message || 'Cloud Storage Disconnected'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleReconnectCloudStorage}
                  disabled={cloudStatus.reconnecting}
                  className="px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-extrabold text-sm flex items-center gap-2.5 shadow-lg shadow-emerald-950/60 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${cloudStatus.reconnecting ? 'animate-spin' : ''}`} />
                  <span>
                    {cloudStatus.reconnecting
                      ? 'Reconnecting Cloud Storage...'
                      : 'Reconnect Cloud Storage Now'}
                  </span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsBackupOpen(true)}
                    className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Database className="w-4 h-4 text-blue-400" />
                    <span>Cloud Storage Settings</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Cloud Storage Settings Modal (z-[9999] so Admin can configure/reconnect above the lock screen) */}
      {isAdmin && (
        <BackupModal
          isOpen={isBackupOpen}
          onClose={() => {
            setIsBackupOpen(false);
            checkCloudStorageStatus(false);
          }}
          onReload={() => {
            checkCloudStorageStatus(false);
            reloadStoreData();
          }}
        />
      )}
    </div>
  );
}
