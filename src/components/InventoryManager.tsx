import React, { useState } from 'react';
import {
  Package,
  AlertTriangle,
  Search,
  Plus,
  QrCode,
  Edit2,
  TrendingUp,
  Boxes,
  CheckCircle,
  Filter,
  Barcode,
  Trash2,
  X,
  AlertCircle,
  ShieldAlert,
  PackagePlus,
  Receipt,
  FileSpreadsheet,
  Lock,
  Building2,
} from 'lucide-react';
import {
  Product,
  SocietyProfile,
  AdminStoreSettings,
  PurchaseTransaction,
  PurchaseEntryType,
  PartyAccount,
  AccountLedgerVoucher,
  ReturnNote,
} from '../types';
import { CATEGORIES } from '../data/initialData';
import { ProductFormModal, NewProductPurchaseMeta } from './ProductFormModal';
import { FillExistingProductModal, FillExistingOptions } from './FillExistingProductModal';
import { SupplierSaveResult } from './SupplierFormModal';
import {
  BulkExcelImportModal,
  BulkImportRowInput,
  BulkImportSummary,
} from './BulkExcelImportModal';
import { getTransactionMode, isPurchaseEnabled } from '../utils/transactionControl';
import { exportPurchaseTransactionsToCsv } from '../utils/csvExporter';

function getExpiryStatus(expiryDate?: string): {
  status: 'OK' | 'EXPIRED' | 'EXPIRING_30' | 'EXPIRING_60';
  daysLeft: number;
} {
  if (!expiryDate || !String(expiryDate).trim()) {
    return { status: 'OK', daysLeft: 999 };
  }
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) {
    return { status: 'OK', daysLeft: 999 };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { status: 'EXPIRED', daysLeft };
  if (daysLeft <= 30) return { status: 'EXPIRING_30', daysLeft };
  if (daysLeft <= 60) return { status: 'EXPIRING_60', daysLeft };
  return { status: 'OK', daysLeft };
}

interface InventoryManagerProps {
  products: Product[];
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Omit<Product, 'id'>, purchaseMeta?: NewProductPurchaseMeta) => void;
  onDeleteProduct?: (productId: number) => void;
  onFillExistingProduct?: (
    product: Product,
    addedQuantity: number,
    options?: FillExistingOptions & { entryType?: PurchaseEntryType }
  ) => Promise<boolean> | void;
  onBulkImportProducts?: (rows: BulkImportRowInput[]) => Promise<BulkImportSummary>;
  purchaseTransactions?: PurchaseTransaction[];
  isAdmin?: boolean;
  onOpenProductQr: (product: Product) => void;
  onOpenBarcodePrint: (product?: Product | null) => void;
  society: SocietyProfile;
  categories?: string[];
  onAddCategory?: (category: string) => void;
  onRenameCategory?: (oldCategory: string, newCategory: string) => void;
  adminSettings?: AdminStoreSettings;
  suppliers?: PartyAccount[];
  accountVouchers?: AccountLedgerVoucher[];
  returnNotes?: ReturnNote[];
  onSaveSupplier?: (supplier: PartyAccount) => Promise<SupplierSaveResult>;
  onOpenSupplierMaster?: () => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  products,
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  onFillExistingProduct,
  onBulkImportProducts,
  purchaseTransactions = [],
  isAdmin = false,
  onOpenProductQr,
  onOpenBarcodePrint,
  society,
  categories = CATEGORIES.filter((c) => c !== 'All Items'),
  onAddCategory,
  onRenameCategory,
  adminSettings,
  suppliers = [],
  accountVouchers = [],
  returnNotes = [],
  onSaveSupplier,
  onOpenSupplierMaster,
}) => {
  const [activeInventoryTab, setActiveInventoryTab] = useState<'catalog' | 'purchases'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Items');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'exp60' | 'exp30' | 'expired'>('all');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState<'ALL' | PurchaseEntryType>('ALL');
  
  // Product Form Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Fill Existing Product Modal state
  const [isFillModalOpen, setIsFillModalOpen] = useState(false);
  const [fillTargetProduct, setFillTargetProduct] = useState<Product | null>(null);

  // TEMPORARY FEATURE: Bulk Excel Import Modal state
  const [isBulkExcelOpen, setIsBulkExcelOpen] = useState(false);

  // Delete confirmation state
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin || !deleteConfirmProduct) return;
    setIsDeleting(true);

    try {
      if (onDeleteProduct) {
        await onDeleteProduct(deleteConfirmProduct.id);
      }
      showToast(`Product "${deleteConfirmProduct.name}" deleted successfully.`);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmProduct(null);
    }
  };

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'All Items' || p.category === selectedCategory;
    const q = (searchQuery || '').toLowerCase();
    const matchesSearch =
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q) ||
      p.id?.toString() === q;

    let matchesStock = true;
    const exp = getExpiryStatus(p.expiryDate);
    if (stockFilter === 'low') {
      matchesStock = p.stock <= p.minStockLevel && p.stock > 0;
    } else if (stockFilter === 'out') {
      matchesStock = p.stock <= 0;
    } else if (stockFilter === 'expired') {
      matchesStock = exp.status === 'EXPIRED';
    } else if (stockFilter === 'exp30') {
      matchesStock = exp.status === 'EXPIRING_30';
    } else if (stockFilter === 'exp60') {
      matchesStock = exp.status === 'EXPIRING_30' || exp.status === 'EXPIRING_60';
    }

    return matchesCat && matchesSearch && matchesStock;
  });

  // Filtered purchase transactions
  const filteredPurchases = purchaseTransactions.filter((tx) => {
    const matchesType =
      purchaseTypeFilter === 'ALL' || tx.entryType === purchaseTypeFilter;
    const q = purchaseSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (tx.productName || '').toLowerCase().includes(q) ||
      (tx.purchaseRef || '').toLowerCase().includes(q) ||
      (tx.barcode || '').toLowerCase().includes(q) ||
      (tx.category || '').toLowerCase().includes(q) ||
      (tx.supplierNote || '').toLowerCase().includes(q) ||
      (tx.supplierName || '').toLowerCase().includes(q) ||
      (tx.supplierInvoiceNo || '').toLowerCase().includes(q) ||
      (tx.paymentStatus || '').toLowerCase().includes(q) ||
      (tx.performedBy || '').toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  // Inventory stats
  const totalItems = products.length;
  const totalValuation = products.reduce((acc, p) => acc + p.stock * p.costPrice, 0);
  const totalRetailValuation = products.reduce((acc, p) => acc + p.stock * p.sellingPrice, 0);
  const lowStockCount = products.filter((p) => p.stock <= p.minStockLevel && p.stock > 0).length;
  const outOfStockCount = products.filter((p) => p.stock <= 0).length;
  const expiredCount = products.filter((p) => getExpiryStatus(p.expiryDate).status === 'EXPIRED').length;
  const exp30Count = products.filter((p) => getExpiryStatus(p.expiryDate).status === 'EXPIRING_30').length;
  const exp60Count = products.filter((p) => {
    const st = getExpiryStatus(p.expiryDate).status;
    return st === 'EXPIRING_30' || st === 'EXPIRING_60';
  }).length;

  const txMode = getTransactionMode(adminSettings);
  const purchaseAllowed = isPurchaseEnabled(adminSettings);

  // Quick adjust stock (+5 / +20 saves separate purchase transaction; -1 is Admin-only)
  const handleQuickAdjust = async (product: Product, delta: number) => {
    if (!purchaseAllowed) return;
    if (delta < 0) {
      if (!isAdmin) return;
      const updated = {
        ...product,
        stock: Math.max(0, Number((product.stock + delta).toFixed(3))),
      };
      onUpdateProduct(updated);
      showToast(`Admin adjusted stock for "${product.name}" (${delta} ${product.unit}).`);
      return;
    }

    if (onFillExistingProduct) {
      const ok = await onFillExistingProduct(product, delta, {
        purchasePrice: product.costPrice,
        gstPercent: product.gstPercent ?? 0,
        batchNo: product.batchNo,
        supplierNote: `Quick Restock (+${delta} ${product.unit})`,
        entryType: 'QUICK_RESTOCK',
      });
      if (ok === false) {
        showToast(`Failed to update stock for "${product.name}" in database. Please retry.`, true);
      } else {
        showToast(`Added +${delta} ${product.unit} to "${product.name}" · Saved Purchase Transaction.`);
      }
    } else {
      const updated = {
        ...product,
        stock: Math.max(0, Number((product.stock + delta).toFixed(3))),
      };
      onUpdateProduct(updated);
    }
  };

  // Open modal for new product
  const handleOpenAddModal = () => {
    if (!purchaseAllowed) return;
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  // Open modal for filling/adding stock to existing product
  const handleOpenFillModal = (product?: Product | null) => {
    if (!purchaseAllowed) return;
    setFillTargetProduct(product || null);
    setIsFillModalOpen(true);
  };

  // Open modal for editing existing product (Admin only)
  const handleOpenEditModal = (product: Product) => {
    if (!isAdmin || !purchaseAllowed) return;
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  // Unified save handler from ProductFormModal
  const handleSaveProduct = (
    productData: Omit<Product, 'id'>,
    existingId?: number,
    purchaseMeta?: NewProductPurchaseMeta
  ) => {
    if (!purchaseAllowed) return;
    if (existingId !== undefined) {
      if (!isAdmin) return;
      const updated: Product = {
        ...productData,
        id: existingId,
      };
      onUpdateProduct(updated);
      showToast(`Updated product "${productData.name}" details.`);
    } else {
      onAddProduct(productData, purchaseMeta);
      const modeLabel =
        purchaseMeta?.paymentStatus === 'CASH'
          ? 'Paid Cash'
          : purchaseMeta?.paymentStatus === 'BANK_UPI'
          ? 'Paid Bank/UPI'
          : 'On Credit (Sundry Creditors)';
      showToast(
        `Added "${productData.name}" (${productData.stock} ${productData.unit}) · Purchase saved (${modeLabel}).`
      );
    }
  };

  const handleFillExistingSubmit = async (
    product: Product,
    addedQuantity: number,
    options?: FillExistingOptions
  ) => {
    if (!purchaseAllowed) return;
    if (onFillExistingProduct) {
      const displayUnit = options?.unit && options.unit !== '0' ? options.unit : product.unit;
      const ok = await onFillExistingProduct(product, addedQuantity, {
        ...options,
        entryType: 'FILL_EXISTING',
      });
      if (ok === false) {
        showToast(
          `Database sync failed for "${product.name}". Stock was not updated — please retry.`,
          true
        );
      } else {
        showToast(
          `Filled +${addedQuantity} ${displayUnit} to "${product.name}" · Saved Purchase Transaction.`
        );
      }
    }
  };

  // Get active categories list including any custom ones present in catalog
  const allActiveCategories = Array.from(
    new Set([...categories, ...products.map((p) => p.category)])
  ).filter(Boolean);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Purchase Restriction Banner when Stop Transaction or Only Sell is active */}
      {!purchaseAllowed && (
        <div
          className={`p-4 border-2 rounded-2xl flex items-center justify-between gap-3 shadow-sm animate-fadeIn ${
            txMode === 'ONLY_SELL'
              ? 'bg-amber-50 border-amber-500 text-amber-950'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <ShieldAlert
              className={`w-6 h-6 flex-shrink-0 ${
                txMode === 'ONLY_SELL' ? 'text-amber-600' : 'text-rose-600'
              }`}
            />
            <div>
              <h4 className="font-extrabold text-sm">
                {txMode === 'ONLY_SELL'
                  ? 'Purchases & Stock Additions Paused — ONLY SELL Category Active'
                  : 'All Store Transactions STOPPED by Admin'}
              </h4>
              <p className="text-xs opacity-85 mt-0.5">
                {adminSettings?.haltReason ||
                  'Adding new products, purchase entries, and stock adjustments are paused by Society Administration.'}
              </p>
            </div>
          </div>
          <span
            className={`text-xs font-mono-code font-bold px-2.5 py-1 rounded-lg ${
              txMode === 'ONLY_SELL' ? 'bg-amber-200 text-amber-950' : 'bg-rose-200 text-rose-900'
            }`}
          >
            {txMode === 'ONLY_SELL' ? 'ONLY SELL' : 'STOP TRANSACTION'}
          </span>
        </div>
      )}

      {/* Top Banner: Inventory overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Catalog SKUs
            </span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono-code">
              {totalItems}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Active Products</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Stock Retail Value
            </span>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono-code">
              ₹{totalRetailValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cost: ₹{totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Low Stock Warnings
            </span>
            <div className="text-2xl font-extrabold text-amber-600 mt-1 font-mono-code">
              {lowStockCount}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">At or below threshold</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Out of Stock
            </span>
            <div className="text-2xl font-extrabold text-rose-600 mt-1 font-mono-code">
              {outOfStockCount}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Require immediate indent</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <Package className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Stock Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-lg text-slate-900">
                Cooperative Society Inventory &amp; Stock Details
              </h3>
              <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span>Real-time stock balance, unique barcode mapping, and separate purchase entries</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    <Lock className="w-3 h-3" />
                    Edit &amp; Delete available only in Admin login
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* TEMPORARY FEATURE: Bulk Excel Category & Product Importer Button */}
              {onBulkImportProducts && (
                <button
                  onClick={() => setIsBulkExcelOpen(true)}
                  disabled={!purchaseAllowed}
                  title={
                    purchaseAllowed
                      ? 'Temporary Tool: Download Excel sheet & bulk add categories/products with ZERO defaults'
                      : 'Paused by Admin transaction control'
                  }
                  className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs border transition-colors ${
                    purchaseAllowed
                      ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-300 cursor-pointer'
                      : 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>Excel Bulk Setup (Temp)</span>
                </button>
              )}
              {onOpenSupplierMaster && (
                <button
                  type="button"
                  onClick={onOpenSupplierMaster}
                  className="flex-1 sm:flex-none px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs border border-blue-200 transition-colors cursor-pointer"
                  title="Open Supplier / Company Master & Ledgers"
                >
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Supplier Master ({suppliers.length})</span>
                </button>
              )}
              <button
                onClick={() => onOpenBarcodePrint(null)}
                className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition-colors border border-slate-700 cursor-pointer"
                title="Print Barcode stickers with option to include/skip items"
              >
                <Barcode className="w-4 h-4 text-emerald-400" />
                <span>Print Barcodes / Stickers</span>
              </button>
              <button
                onClick={() => handleOpenFillModal(null)}
                disabled={!purchaseAllowed || products.length === 0}
                title={
                  purchaseAllowed
                    ? 'Fill / add stock to an existing product & record purchase transaction'
                    : 'Paused by Admin transaction control'
                }
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition-colors ${
                  purchaseAllowed && products.length > 0
                    ? 'bg-teal-600 hover:bg-teal-500 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                <PackagePlus className="w-4 h-4" />
                <span>{purchaseAllowed ? 'Fill / Add Existing Product' : 'Purchases Paused'}</span>
              </button>
              <button
                onClick={handleOpenAddModal}
                disabled={!purchaseAllowed}
                title={purchaseAllowed ? 'Add new purchased product to inventory' : 'Paused by Admin transaction control'}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition-colors ${
                  purchaseAllowed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{purchaseAllowed ? 'Add New Product' : 'Purchases Paused'}</span>
              </button>
            </div>
          </div>

          {/* Sub-navigation: Stock Catalog vs Purchase Transactions Log */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveInventoryTab('catalog')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeInventoryTab === 'catalog'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                <span>Stock Catalog ({products.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveInventoryTab('purchases')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeInventoryTab === 'purchases'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-teal-600" />
                <span>Purchase Transactions ({purchaseTransactions.length})</span>
              </button>
            </div>

            {activeInventoryTab === 'purchases' && (
              <button
                type="button"
                onClick={() => exportPurchaseTransactionsToCsv(filteredPurchases, society.name)}
                disabled={filteredPurchases.length === 0}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Purchase Log CSV</span>
              </button>
            )}
          </div>

          {/* Search, category filter and stock status filters (Catalog tab) */}
          {activeInventoryTab === 'catalog' ? (
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search SKU, name, or barcode..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Category Dropdown */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
                >
                  <option value="All Items">All Categories ({products.length})</option>
                  {allActiveCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} ({products.filter((p) => p.category === cat).length})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1">
                <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                  <Filter className="w-3.5 h-3.5" />
                  Filter:
                </span>
                <button
                  onClick={() => setStockFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                    stockFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({products.length})
                </button>
                <button
                  onClick={() => setStockFilter('low')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                    stockFilter === 'low'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Low Stock ({lowStockCount})
                </button>
                <button
                  onClick={() => setStockFilter('out')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                    stockFilter === 'out'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  Out of Stock ({outOfStockCount})
                </button>
                <button
                  onClick={() => setStockFilter('exp60')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                    stockFilter === 'exp60'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  Exp ≤ 60d ({exp60Count})
                </button>
                <button
                  onClick={() => setStockFilter('exp30')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                    stockFilter === 'exp30'
                      ? 'bg-amber-700 text-white'
                      : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  Exp ≤ 30d ({exp30Count})
                </button>
                <button
                  onClick={() => setStockFilter('expired')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                    stockFilter === 'expired'
                      ? 'bg-red-700 text-white'
                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  Expired ({expiredCount})
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  placeholder="Search purchase ref, product, supplier, staff..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <select
                value={purchaseTypeFilter}
                onChange={(e) => setPurchaseTypeFilter(e.target.value as 'ALL' | PurchaseEntryType)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700"
              >
                <option value="ALL">All Purchase Types ({purchaseTransactions.length})</option>
                <option value="NEW_PRODUCT">New Product Additions</option>
                <option value="FILL_EXISTING">Fill Existing Stock</option>
                <option value="QUICK_RESTOCK">Quick Stock Restocks</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Detailed Stock Table */}
        {activeInventoryTab === 'catalog' && (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Product Details</th>
                <th className="py-3 px-4">Barcode / SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Selling Price-WT GST</th>
                <th className="py-3 px-4 text-center">Available Stock</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Quick Stock Adjust</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-sm">No products found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting your search query, category filter, or add a new product.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const inStock = p.stock > 0;
                  const isLow = p.stock <= p.minStockLevel && inStock;
                  const expInfo = getExpiryStatus(p.expiryDate);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name Details */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm leading-tight flex flex-wrap items-center gap-1.5">
                              <span>{p.name}</span>
                              {expInfo.status === 'EXPIRED' && (
                                <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase">
                                  EXPIRED
                                </span>
                              )}
                              {expInfo.status === 'EXPIRING_30' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black uppercase">
                                  Exp {expInfo.daysLeft}d
                                </span>
                              )}
                              {expInfo.status === 'EXPIRING_60' && (
                                <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300 text-[9px] font-bold">
                                  Exp {expInfo.daysLeft}d
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 font-mono-code">
                              HSN: {p.hsnCode || (p.category.toLowerCase().includes('pesti') ? '3808' : '3105')} · Batch: {p.batchNo} {p.expiryDate ? `· Exp: ${p.expiryDate}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Barcode */}
                      <td className="py-3 px-4">
                        <div className="font-mono-code font-bold text-slate-900">
                          {p.barcode}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono-code">SKU ID: {p.id}</div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {p.category}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-extrabold font-mono-code text-slate-900 text-sm">
                          ₹{(p.sellingPriceWithGst || p.sellingPrice).toFixed(2)}
                        </div>
                        {p.sellingPriceWD !== undefined && p.sellingPriceWD !== (p.sellingPriceWithGst || p.sellingPrice) && (
                          <div className="text-[10px] text-slate-500 font-mono-code">
                            Base: ₹{p.sellingPriceWD.toFixed(2)} {p.gstPercent ? `+ ${p.gstPercent}% GST` : ''}
                          </div>
                        )}
                        <div className={`text-[10px] font-mono-code ${
                          p.costPrice > (p.sellingPriceWD ?? p.sellingPrice)
                            ? 'text-red-600 font-bold'
                            : 'text-slate-400'
                        }`}>
                          Purchase (WD): ₹{p.costPrice.toFixed(2)} / {p.unit}
                          {p.costPrice > (p.sellingPriceWD ?? p.sellingPrice) ? ' ⚠️' : ''}
                        </div>
                      </td>

                      {/* Stock available */}
                      <td className="py-3 px-4 text-center">
                        <div className="font-extrabold text-sm font-mono-code text-slate-900">
                          {p.stock.toFixed(1)} {p.unit}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono-code">Min: {p.minStockLevel} {p.unit}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold font-mono-code ${
                            !inStock
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {!inStock ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'IN STOCK'}
                        </span>
                      </td>

                      {/* Quick Adjust buttons (-1 only in Admin login; +5/+20 record separate Purchase Transactions) */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          {isAdmin && (
                            <button
                              onClick={() => handleQuickAdjust(p, -1)}
                              disabled={!purchaseAllowed || p.stock <= 0}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs disabled:opacity-30 cursor-pointer"
                              title={purchaseAllowed ? 'Admin: Reduce 1 unit' : 'Stock adjustment paused by Admin'}
                            >
                              -1
                            </button>
                          )}
                          <button
                            onClick={() => handleQuickAdjust(p, 5)}
                            disabled={!purchaseAllowed}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs disabled:opacity-30 cursor-pointer"
                            title={purchaseAllowed ? 'Fill +5 units (saved as Purchase Transaction)' : 'Purchases paused by Admin'}
                          >
                            +5
                          </button>
                          <button
                            onClick={() => handleQuickAdjust(p, 20)}
                            disabled={!purchaseAllowed}
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs disabled:opacity-30 cursor-pointer"
                            title={purchaseAllowed ? 'Restock +20 units (saved as Purchase Transaction)' : 'Purchases paused by Admin'}
                          >
                            +20
                          </button>
                        </div>
                      </td>

                      {/* Actions (Edit & Delete available ONLY in Admin login) */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenFillModal(p)}
                            disabled={!purchaseAllowed}
                            className={`p-1.5 rounded-lg transition-colors ${
                              purchaseAllowed
                                ? 'bg-teal-50 hover:bg-teal-100 text-teal-700 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed'
                            }`}
                            title={purchaseAllowed ? 'Fill / Add stock to this existing product' : 'Purchases paused by Admin'}
                          >
                            <PackagePlus className="w-4 h-4 text-teal-600" />
                          </button>
                          <button
                            onClick={() => onOpenBarcodePrint(p)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
                            title="Print Barcode &amp; QR Sticker"
                          >
                            <Barcode className="w-4 h-4 text-emerald-600" />
                          </button>
                          <button
                            onClick={() => onOpenProductQr(p)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="View / Print QR Code Shelf Card"
                          >
                            <QrCode className="w-4 h-4 text-emerald-600" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                disabled={!purchaseAllowed}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  purchaseAllowed
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'
                                    : 'bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed'
                                }`}
                                title={purchaseAllowed ? 'Admin: Edit product details' : 'Purchases & stock edits paused by Admin'}
                              >
                                <Edit2 className="w-4 h-4 text-slate-600" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmProduct(p)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Admin: Delete product permanently"
                              >
                                <Trash2 className="w-4 h-4 text-rose-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Tab 2: Separate Purchase Transactions Log */}
        {activeInventoryTab === 'purchases' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Purchase Ref &amp; Date</th>
                  <th className="py-3 px-4">Entry Type</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4 text-center">Stock Change</th>
                  <th className="py-3 px-4 text-right">Purchase Rate</th>
                  <th className="py-3 px-4 text-right">Total Purchase</th>
                  <th className="py-3 px-4">Supplier &amp; Payment Mode</th>
                  <th className="py-3 px-4">Entered By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-600 text-sm">No purchase transactions recorded yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Every new product addition or existing product stock fill will be saved separately here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((tx) => {
                    const badgeClass =
                      tx.entryType === 'NEW_PRODUCT'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : tx.entryType === 'QUICK_RESTOCK'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-teal-100 text-teal-800 border-teal-200';
                    const typeLabel =
                      tx.entryType === 'NEW_PRODUCT'
                        ? 'NEW PRODUCT'
                        : tx.entryType === 'QUICK_RESTOCK'
                        ? 'QUICK RESTOCK'
                        : 'FILL EXISTING';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono-code font-bold text-slate-900">
                            {tx.purchaseRef}
                          </div>
                          <div className="text-[11px] font-mono-code text-slate-500 mt-0.5">
                            {tx.purchaseDate}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold font-mono-code border ${badgeClass}`}
                          >
                            {typeLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 text-sm">{tx.productName}</div>
                          <div className="text-[11px] text-slate-500 font-mono-code">
                            {tx.category} · #{tx.barcode} {tx.batchNo ? `· Batch: ${tx.batchNo}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono-code">
                          <div className="font-black text-teal-700 text-sm">
                            +{tx.addedQuantity} {tx.unit}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {tx.previousStock} → <strong className="text-slate-800">{tx.newStock}</strong> {tx.unit}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-code">
                          <div className="font-bold text-slate-800">
                            ₹{Number(tx.purchasePrice || 0).toFixed(2)} / {tx.unit}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            WD GST · +{tx.gstPercent}% (₹{Number(tx.totalGstAmount || 0).toFixed(2)})
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-code">
                          <div className="font-extrabold text-slate-900 text-sm">
                            ₹{Number(tx.totalAmount || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Base: ₹{Number(tx.baseAmount || 0).toFixed(2)}
                          </div>
                          {Number(tx.commissionAmount || 0) > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9.5px] font-bold"
                                title={tx.commissionNote || 'Company Commission / Rebate'}
                              >
                                Comm: ₹{Number(tx.commissionAmount || 0).toFixed(2)}
                                {Number(tx.commissionPercent || 0) > 0
                                  ? ` (${Number(tx.commissionPercent).toFixed(1)}%)`
                                  : ''}
                              </span>
                              {(tx.commissionMode || 'DEDUCT_BILL') === 'DEDUCT_BILL' && (
                                <div className="text-[10px] font-bold text-slate-700">
                                  Net: ₹
                                  {Number(
                                    tx.netPayableAmount !== undefined
                                      ? tx.netPayableAmount
                                      : Math.max(0, Number(tx.totalAmount || 0) - Number(tx.commissionAmount || 0))
                                  ).toFixed(2)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-[230px]">
                          {(() => {
                            const payStatus = tx.paymentStatus || 'CREDIT';
                            const payBadge =
                              payStatus === 'CASH'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : payStatus === 'BANK_UPI'
                                ? 'bg-sky-100 text-sky-800 border-sky-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300';
                            const payLabel =
                              payStatus === 'CASH'
                                ? 'PAID · CASH'
                                : payStatus === 'BANK_UPI'
                                ? 'PAID · BANK/UPI'
                                : 'ON CREDIT (DUE)';
                            const resolvedSupplier =
                              tx.supplierName ||
                              (tx.supplierId
                                ? suppliers.find((s) => s.id === tx.supplierId)?.name
                                : undefined);
                            return (
                              <div className="space-y-1">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold font-mono-code border ${payBadge}`}
                                >
                                  {payLabel}
                                </span>
                                {resolvedSupplier && (
                                  <div className="text-xs font-bold text-slate-800 truncate" title={resolvedSupplier}>
                                    {resolvedSupplier}
                                  </div>
                                )}
                                {tx.supplierInvoiceNo && (
                                  <div className="text-[10px] font-mono-code text-slate-500 truncate">
                                    Bill: {tx.supplierInvoiceNo}
                                  </div>
                                )}
                                {tx.supplierNote && (
                                  <div className="text-[11px] text-slate-500 truncate" title={tx.supplierNote}>
                                    {tx.supplierNote}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {tx.performedBy}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast Feedback Message */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 border px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-fadeIn ${
            toastMessage.isError
              ? 'bg-rose-950 text-rose-200 border-rose-700'
              : 'bg-slate-900 text-emerald-400 border-slate-700'
          }`}
        >
          {toastMessage.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Delete Confirmation Modal (Admin only) */}
      {isAdmin && deleteConfirmProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Delete Product Confirmation</h3>
                  <p className="text-xs text-slate-500 font-medium">Remove item permanently from inventory</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Summary Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 shrink-0 font-bold">
                <Package className="w-5 h-5 text-slate-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-slate-900 truncate">{deleteConfirmProduct.name}</h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span className="font-mono text-slate-700 bg-slate-200/70 px-1.5 py-0.5 rounded font-bold">
                    {deleteConfirmProduct.barcode}
                  </span>
                  <span>·</span>
                  <span className="font-semibold">{deleteConfirmProduct.category}</span>
                </div>
                <div className="text-xs font-bold text-slate-800 mt-1">
                  Stock: <span className="text-emerald-700">{deleteConfirmProduct.stock} {deleteConfirmProduct.unit}</span> · Selling Price: <span className="text-slate-900">₹{deleteConfirmProduct.sellingPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Warning Callout */}
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Warning:</strong> Are you sure you want to delete <strong className="text-slate-900">{deleteConfirmProduct.name}</strong>? This item will be removed from your store catalog and database. This action cannot be undone.
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel / Keep Product
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Product Form Modal */}
      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        productToEdit={editingProduct}
        existingProducts={products}
        categories={allActiveCategories}
        suppliers={suppliers}
        onSaveSupplier={onSaveSupplier}
        onSaveProduct={handleSaveProduct}
        onFillExistingProduct={(prod, qty, opts) => {
          handleFillExistingSubmit(prod, qty, opts);
        }}
        onAddNewCategory={onAddCategory}
        onRenameCategory={onRenameCategory}
      />

      {/* Fill / Add Existing Product Modal */}
      <FillExistingProductModal
        isOpen={isFillModalOpen}
        onClose={() => {
          setIsFillModalOpen(false);
          setFillTargetProduct(null);
        }}
        products={products}
        categories={allActiveCategories}
        suppliers={suppliers}
        purchaseTransactions={purchaseTransactions}
        accountVouchers={accountVouchers}
        returnNotes={returnNotes}
        onSaveSupplier={onSaveSupplier}
        initialProduct={fillTargetProduct}
        onFillExistingProduct={handleFillExistingSubmit}
      />

      {/* TEMPORARY FEATURE: Bulk Excel Category & Product Import Modal */}
      {onBulkImportProducts && (
        <BulkExcelImportModal
          isOpen={isBulkExcelOpen}
          onClose={() => setIsBulkExcelOpen(false)}
          existingProducts={products}
          categories={allActiveCategories}
          onBulkImport={async (rows) => {
            const summary = await onBulkImportProducts(rows);
            showToast(
              `Excel Bulk Import: +${summary.addedCategories} categories, +${summary.createdCount} new (0), ${summary.resetCount} adjusted to 0.`
            );
            return summary;
          }}
        />
      )}
    </div>
  );
};
