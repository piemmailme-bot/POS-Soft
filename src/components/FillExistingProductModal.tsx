import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  PackagePlus,
  Search,
  Package,
  Receipt,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { Product, PartyAccount } from '../types';

export interface FillExistingOptions {
  purchasePrice?: number;
  weightedAverageCost?: number;
  gstPercent?: number;
  batchNo?: string;
  expiryDate?: string;
  hsnCode?: string;
  supplierId?: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
  supplierNote?: string;
  unit?: Product['unit'];
  minStockLevel?: number;
  sellingPrice?: number;
  sellingPriceWD?: number;
  sellingPriceWithGst?: number;
}

interface FillExistingProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  categories: string[];
  suppliers?: PartyAccount[];
  initialProduct?: Product | null;
  onFillExistingProduct: (
    product: Product,
    addedQuantity: number,
    options?: FillExistingOptions
  ) => void;
}

export const FillExistingProductModal: React.FC<FillExistingProductModalProps> = ({
  isOpen,
  onClose,
  products,
  categories,
  suppliers = [],
  initialProduct,
  onFillExistingProduct,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All Items');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [addedQuantity, setAddedQuantity] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [gstPercent, setGstPercent] = useState<string>('5');
  const [batchNo, setBatchNo] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [hsnCode, setHsnCode] = useState<string>('3105');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'CREDIT' | 'CASH' | 'BANK_UPI'>('BANK_UPI');
  const [useWeightedAverage, setUseWeightedAverage] = useState<boolean>(true);
  const [supplierNote, setSupplierNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCreditConfirm, setShowCreditConfirm] = useState<boolean>(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat =
        selectedCategory === 'All Items' || p.category === selectedCategory;
      const matchesSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        String(p.id) === q;
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Populate fields when modal opens or product changes
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setAddedQuantity('');
    setSupplierNote('');
    setSupplierId('');
    setSupplierInvoiceNo('');
    setPaymentStatus('BANK_UPI');
    setUseWeightedAverage(true);
    setShowCreditConfirm(false);

    if (initialProduct) {
      setSelectedCategory('All Items');
      setSearchQuery('');
      setSelectedProductId(initialProduct.id);
      setPurchasePrice(String(initialProduct.costPrice ?? 0));
      setGstPercent(String(initialProduct.gstPercent ?? 5));
      setBatchNo(initialProduct.batchNo || '');
      setExpiryDate(initialProduct.expiryDate || '');
      setHsnCode(
        initialProduct.hsnCode ||
          ((initialProduct.category || '').toLowerCase().includes('pesti') ? '3808' : '3105')
      );
    } else {
      setSelectedCategory('All Items');
      setSearchQuery('');
      const first = products[0] || null;
      if (first) {
        setSelectedProductId(first.id);
        setPurchasePrice(String(first.costPrice ?? 0));
        setGstPercent(String(first.gstPercent ?? 5));
        setBatchNo(first.batchNo || '');
        setExpiryDate(first.expiryDate || '');
        setHsnCode(
          first.hsnCode || ((first.category || '').toLowerCase().includes('pesti') ? '3808' : '3105')
        );
      } else {
        setSelectedProductId('');
        setPurchasePrice('');
        setGstPercent('5');
        setBatchNo('');
        setExpiryDate('');
        setHsnCode('3105');
      }
    }
  }, [isOpen, initialProduct, products]);

  // Update pricing/batch defaults when user switches selected product
  const handleSelectProduct = (prodId: number) => {
    const prod = products.find((p) => p.id === prodId);
    setSelectedProductId(prodId);
    setErrorMsg(null);
    if (prod) {
      setPurchasePrice(String(prod.costPrice ?? 0));
      setGstPercent(String(prod.gstPercent ?? 5));
      setBatchNo(prod.batchNo || '');
      setExpiryDate(prod.expiryDate || '');
      setHsnCode(
        prod.hsnCode || ((prod.category || '').toLowerCase().includes('pesti') ? '3808' : '3105')
      );
    }
  };

  if (!isOpen) return null;

  const qtyNum = Number(addedQuantity || 0);
  const priceNum = Number(purchasePrice || 0);
  const gstNum = Number(gstPercent || 0);
  const prevStock = selectedProduct ? Math.max(0, Number(selectedProduct.stock || 0)) : 0;
  const prevCost = selectedProduct ? Math.max(0, Number(selectedProduct.costPrice || 0)) : 0;
  const newStock = Number((prevStock + (qtyNum > 0 ? qtyNum : 0)).toFixed(3));
  const weightedAvgCost =
    newStock > 0 && qtyNum > 0
      ? Number(((prevStock * prevCost + qtyNum * priceNum) / newStock).toFixed(2))
      : priceNum;
  const unitPurchaseWithGst = Number((priceNum * (1 + gstNum / 100)).toFixed(2));
  const basePurchaseAmount = qtyNum > 0 ? Number((qtyNum * priceNum).toFixed(2)) : 0;
  const totalGstAmount = Number(((basePurchaseAmount * gstNum) / 100).toFixed(2));
  const totalPurchaseAmount = Number((basePurchaseAmount + totalGstAmount).toFixed(2));
  const halfGst = Number((totalGstAmount / 2).toFixed(2));

  const handleQuickQty = (val: number) => {
    const current = Number(addedQuantity || 0);
    setAddedQuantity(String(Number((current + val).toFixed(3))));
    setErrorMsg(null);
  };

  const executeFinalFill = () => {
    if (!selectedProduct) return;
    const selectedSup = suppliers.find((s) => s.id === supplierId);
    const combinedNote = [
      selectedSup ? selectedSup.name : '',
      supplierInvoiceNo.trim() ? `Inv #${supplierInvoiceNo.trim()}` : '',
      supplierNote.trim(),
    ]
      .filter(Boolean)
      .join(' · ');

    onFillExistingProduct(selectedProduct, qtyNum, {
      purchasePrice: priceNum,
      weightedAverageCost: useWeightedAverage ? weightedAvgCost : priceNum,
      gstPercent: Number.isFinite(gstNum) && gstNum >= 0 ? gstNum : selectedProduct.gstPercent ?? 5,
      batchNo: batchNo.trim() || selectedProduct.batchNo,
      expiryDate: expiryDate.trim() || undefined,
      hsnCode: hsnCode.trim() || selectedProduct.hsnCode || '3105',
      supplierId: supplierId || undefined,
      supplierName: selectedSup?.name || undefined,
      supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
      paymentStatus,
      supplierNote: combinedNote || undefined,
    });
    setShowCreditConfirm(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setErrorMsg('Please select an existing product first.');
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setErrorMsg('Please enter a valid quantity greater than 0 to fill/add.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setErrorMsg('Purchase price cannot be negative.');
      return;
    }

    if (paymentStatus === 'CREDIT') {
      setShowCreditConfirm(true);
      return;
    }

    executeFinalFill();
  };

  const allCategories = Array.from(
    new Set([...categories, ...products.map((p) => p.category)])
  ).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Fill / Add Existing Product Stock</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Increment stock on an existing catalog item &amp; save as a separate purchase transaction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Product Selector Filter & Dropdown */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                1. Select Existing Product *
              </label>
              <span className="text-[11px] font-mono-code font-semibold text-slate-500">
                {filteredProducts.length} matching items
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product name or barcode..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700"
              >
                <option value="All Items">All Categories ({products.length})</option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={selectedProductId}
              onChange={(e) => handleSelectProduct(Number(e.target.value))}
              className="w-full px-3 py-2.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900"
              required
            >
              {filteredProducts.length === 0 ? (
                <option value="">No existing products match your search</option>
              ) : (
                filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · [{p.category}] · #{p.barcode} · Current: {p.stock} {p.unit}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Selected Product Live Status Card */}
          {selectedProduct && (
            <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-slate-900 truncate">
                    {selectedProduct.name}
                  </div>
                  <div className="text-[11px] font-mono-code text-slate-600 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>Barcode: #{selectedProduct.barcode}</span>
                    <span>·</span>
                    <span>Cat: {selectedProduct.category}</span>
                    <span>·</span>
                    <span>Selling: ₹{(selectedProduct.sellingPriceWithGst || selectedProduct.sellingPrice).toFixed(2)}/{selectedProduct.unit}</span>
                  </div>
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0 bg-white px-3 py-2 rounded-lg border border-teal-200">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">
                  Current Stock
                </span>
                <span className="text-sm font-black font-mono-code text-teal-800">
                  {selectedProduct.stock} {selectedProduct.unit}
                </span>
              </div>
            </div>
          )}

          {/* Quantity & Pricing Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quantity to Fill / Add ({selectedProduct?.unit || 'Unit'}) *
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="e.g. 25"
                value={addedQuantity}
                onChange={(e) => {
                  setAddedQuantity(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full px-3 py-2 text-sm border-2 border-teal-400 bg-teal-50/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono-code font-black text-slate-900"
                required
                autoFocus
              />
              <div className="flex items-center gap-1 mt-1.5">
                {[5, 10, 25, 50].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuickQty(q)}
                    className="px-2 py-0.5 text-[10px] font-bold font-mono-code bg-slate-100 hover:bg-teal-100 text-slate-700 hover:text-teal-800 rounded border border-slate-200 transition-colors cursor-pointer"
                  >
                    +{q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Purchase Price-WD GST / {selectedProduct?.unit || 'Unit'} (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono-code font-bold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 block mt-1 font-mono-code">
                Without GST · WT GST: ₹{unitPurchaseWithGst.toFixed(2)}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                GST Charge (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono-code font-bold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                CGST {(gstNum / 2).toFixed(2)}% + SGST {(gstNum / 2).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* HSN, Batch, Expiry, Weighted Average Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                HSN / SAC Code
              </label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="3105 / 3808"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono-code font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Batch Number (Optional)
              </label>
              <input
                type="text"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. B-2026-105"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono-code"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Supplier, Invoice No, Payment Mode & Chalan Note */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Supplier Ledger (Optional)
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">General / Unspecified Supplier</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} {sup.gstin ? `(${sup.gstin})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Supplier Bill / Chalan No.
                </label>
                <input
                  type="text"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-2026-412"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono-code focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Purchase Settlement Mode *
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => {
                    setPaymentStatus(e.target.value as 'CREDIT' | 'CASH' | 'BANK_UPI');
                    setShowCreditConfirm(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg font-bold focus:outline-none focus:ring-2 ${
                    paymentStatus === 'CREDIT'
                      ? 'bg-amber-100/80 border-amber-400 text-amber-950 focus:ring-amber-500'
                      : paymentStatus === 'BANK_UPI'
                      ? 'bg-white border-sky-400 text-sky-950 focus:ring-sky-500'
                      : 'bg-white border-emerald-400 text-emerald-950 focus:ring-emerald-500'
                  }`}
                >
                  <option value="BANK_UPI">Paid via Bank / NEFT / UPI (Default)</option>
                  <option value="CASH">Paid via Cash Drawer</option>
                  <option value="CREDIT">On Credit (Sundry Creditors)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center pt-1">
              <input
                type="text"
                value={supplierNote}
                onChange={(e) => setSupplierNote(e.target.value)}
                placeholder="Additional remarks (e.g. IFFCO Truck Delivery)..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useWeightedAverage}
                  onChange={(e) => setUseWeightedAverage(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  Use Weighted-Avg Cost (₹{weightedAvgCost.toFixed(2)}/{selectedProduct?.unit || 'Unit'})
                </span>
              </label>
            </div>
          </div>

          {/* Live Purchase Transaction Breakdown */}
          {selectedProduct && qtyNum > 0 && purchasePrice !== '' && priceNum > 0 && gstPercent !== '' && gstNum >= 0 && (
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2.5">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                <span className="font-bold text-teal-300 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4" />
                  <span>Total Purchase Transaction Summary</span>
                </span>
                <span className="text-[10px] font-mono-code text-slate-400">
                  {qtyNum} {selectedProduct.unit} × ₹{priceNum.toFixed(2)} (WD GST) + {gstNum}% GST
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-code">
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">New Total Stock</span>
                  <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {newStock} {selectedProduct.unit}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({prevStock} + {qtyNum > 0 ? qtyNum : 0})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Total Price-WD GST (₹)</span>
                  <span className="text-sm font-bold text-white">₹{basePurchaseAmount.toFixed(2)}</span>
                  <span className="text-[9.5px] text-slate-400 block">Without GST</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Total GST to be Paid ({gstNum}%)</span>
                  <span className="text-sm font-bold text-amber-300">₹{totalGstAmount.toFixed(2)}</span>
                  <span className="text-[9.5px] text-slate-400 block">
                    C: ₹{halfGst.toFixed(2)} · S: ₹{halfGst.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">Total With GST (₹)</span>
                  <span className="text-base font-black text-teal-300">₹{totalPurchaseAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
              paymentStatus === 'CREDIT'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : paymentStatus === 'BANK_UPI'
                ? 'bg-sky-50 border-sky-300 text-sky-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            {paymentStatus === 'CREDIT'
              ? 'Mode: ON CREDIT (Sundry Creditors)'
              : paymentStatus === 'BANK_UPI'
              ? 'Mode: Bank / NEFT / UPI (Default)'
              : 'Mode: Cash Drawer'}
          </span>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedProduct || qtyNum <= 0}
              className={`px-5 py-2.5 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow transition-all cursor-pointer ${
                paymentStatus === 'CREDIT'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {paymentStatus === 'CREDIT'
                  ? 'Review Credit Purchase →'
                  : 'Save Fill & Record Purchase'}
              </span>
            </button>
          </div>
        </div>

        {/* Sundry Creditor (On Credit) Final Reconfirmation Dialog */}
        {showCreditConfirm && selectedProduct && (
          <div className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border-2 border-amber-400 overflow-hidden">
              <div className="px-5 py-3.5 bg-amber-600 text-white flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-extrabold text-sm">
                    Reconfirm Sundry Creditor (Credit) Purchase
                  </h4>
                  <p className="text-[11px] text-amber-100">
                    Please verify before recording this purchase on credit
                  </p>
                </div>
              </div>
              <div className="p-5 space-y-3.5 text-xs">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Product:</span>
                    <span className="font-bold text-slate-900 text-right">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Added Quantity:</span>
                    <span className="font-mono-code font-bold text-slate-900">
                      +{qtyNum} {selectedProduct.unit}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Total Bill (Incl. GST):</span>
                    <span className="font-mono-code font-black text-amber-900 text-sm">
                      ₹{totalPurchaseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Supplier (Creditor):</span>
                    <span className="font-bold text-slate-900 text-right">
                      {suppliers.find((s) => s.id === supplierId)?.name || 'General / Unspecified Supplier'}
                    </span>
                  </div>
                  {supplierInvoiceNo.trim() && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600 font-semibold">Bill / Chalan No.:</span>
                      <span className="font-mono-code font-bold text-slate-800">{supplierInvoiceNo.trim()}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11.5px] text-slate-700 leading-relaxed">
                  You selected <strong className="text-amber-800">On Credit (Sundry Creditors)</strong>.
                  This will <strong>NOT</strong> deduct from Bank/NEFT or Cash now — it will be added to{' '}
                  <strong>Sundry Creditors (Payable)</strong> on your Balance Sheet until you pay it back via{' '}
                  <strong>Accounts &amp; Balance Sheet → Pay Supplier</strong>.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCreditConfirm(false)}
                    className="px-3.5 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer"
                  >
                    Go Back / Change Mode
                  </button>
                  <button
                    type="button"
                    onClick={executeFinalFill}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm &amp; Save Credit Purchase</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
