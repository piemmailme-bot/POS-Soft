import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Barcode,
  Search,
  CheckCircle2,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  PackageCheck,
  AlertCircle,
  Percent
} from 'lucide-react';
import { Product, CartItem, LoosePacket } from '../types';
import { playScannerBeep } from '../utils/audio';
import { parseLooseBarcode, formatQuantityWithSubunit } from '../utils/looseBarcode';

function getExGstSellingPrice(product: Product): number {
  if (product.sellingPriceWD && product.sellingPriceWD > 0) {
    return Number(product.sellingPriceWD);
  }
  const gstPct = Number(product.gstPercent || 0);
  const rawSp = Number(product.sellingPrice || 0);
  if (gstPct > 0 && product.sellingPriceWithGst && product.sellingPriceWithGst > 0) {
    return Number((product.sellingPriceWithGst / (1 + gstPct / 100)).toFixed(2));
  }
  return rawSp;
}

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentCart: CartItem[];
  loosePackets?: LoosePacket[];
  onProductScanned: (product: Product, quantity?: number, packetBarcode?: string) => void;
  onUpdateCartItem: (productId: number, quantity: number) => void;
  onRemoveCartItem: (productId: number) => void;
  onProceedToCheckout?: () => void;
  discountMode?: 'AMOUNT' | 'PERCENT';
  setDiscountMode?: (mode: 'AMOUNT' | 'PERCENT') => void;
  discountValue?: string;
  setDiscountValue?: (val: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  currentCart,
  loosePackets,
  onProductScanned,
  onUpdateCartItem,
  onRemoveCartItem,
  onProceedToCheckout,
  discountMode = 'AMOUNT',
  setDiscountMode,
  discountValue = '',
  setDiscountValue,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [recentlyScannedId, setRecentlyScannedId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error', duration = 2500) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), duration);
  };

  // Normalize query (strip leading # so #890100765964 matches 890100765964)
  const trimmedQuery = manualCode.trim();
  const normalizedQuery = trimmedQuery.replace(/^#+/, '').trim().toLowerCase();
  const textQuery = trimmedQuery.toLowerCase();

  // Matching loose packets by unique/base barcode
  const matchingLooseProductIds = new Set<number>();
  if (trimmedQuery && loosePackets && loosePackets.length > 0) {
    for (const lp of loosePackets) {
      const uniqueCode = (lp.uniqueBarcode || '').toLowerCase();
      const baseCode = (lp.baseBarcode || '').toLowerCase();
      if (
        normalizedQuery &&
        (uniqueCode.includes(normalizedQuery) || baseCode.includes(normalizedQuery))
      ) {
        matchingLooseProductIds.add(lp.productId);
      }
    }
  }

  // Filter products: empty input shows all products as default; non-empty shows only matches (or empty array if none match)
  const filteredProducts = !trimmedQuery
    ? products
    : products.filter((p) => {
        const barcodeLower = (p.barcode || '').toLowerCase();
        const nameLower = (p.name || '').toLowerCase();
        const categoryLower = (p.category || '').toLowerCase();

        return (
          (normalizedQuery.length > 0 && barcodeLower.includes(normalizedQuery)) ||
          (normalizedQuery.length > 0 && p.id.toString() === normalizedQuery) ||
          nameLower.includes(textQuery) ||
          (normalizedQuery.length > 0 && nameLower.includes(normalizedQuery)) ||
          categoryLower.includes(textQuery) ||
          matchingLooseProductIds.has(p.id)
        );
      });

  // Calculate bill totals matching Active Sales Bill (Excl.-GST Base + Discount + Output GST + Round Off)
  const rawExGstSubtotal = currentCart.reduce(
    (sum, item) => sum + getExGstSellingPrice(item.product) * item.quantity,
    0
  );
  const parsedDiscountNum = Math.max(0, Number(discountValue || 0) || 0);
  const billDiscountAmt =
    rawExGstSubtotal > 0 && parsedDiscountNum > 0
      ? discountMode === 'PERCENT'
        ? Number(((rawExGstSubtotal * Math.min(100, parsedDiscountNum)) / 100).toFixed(2))
        : Number(Math.min(rawExGstSubtotal, parsedDiscountNum).toFixed(2))
      : 0;
  const discFactor =
    rawExGstSubtotal > 0 ? Math.max(0, (rawExGstSubtotal - billDiscountAmt) / rawExGstSubtotal) : 1;
  const taxableSubtotal = Number(Math.max(0, rawExGstSubtotal - billDiscountAmt).toFixed(2));
  const totalGst = currentCart.reduce((sum, item) => {
    const gstPct = Number(item.product.gstPercent || 0);
    const itemBaseAfterDisc = getExGstSellingPrice(item.product) * discFactor * item.quantity;
    return sum + (itemBaseAfterDisc * gstPct) / 100;
  }, 0);
  const rawTotal = Math.max(0, Number((taxableSubtotal + totalGst).toFixed(2)));
  const grandTotal = Math.ceil(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));
  const totalItemUnits = currentCart.reduce((sum, item) => sum + item.quantity, 0);

  // Handle scanned barcode / text
  const handleBarcodeDetection = (decodedText: string) => {
    const rawText = decodedText.trim();
    const cleanText = rawText.replace(/^#+/, '').trim();
    if (!cleanText) return;

    // Check loose barcode parser first (supports loose suffix e.g. BASECODE-250G and EAN-13 scale codes)
    const looseResult = parseLooseBarcode(cleanText, products, loosePackets);

    if (looseResult) {
      const { product, quantityInBaseUnit, weightText, calculatedPrice, alreadySold, alreadySoldInfo, packet } = looseResult;

      if (alreadySold) {
        showNotification(alreadySoldInfo || `Package #${cleanText} was ALREADY SOLD!`, 'error', 4500);
        return;
      }

      if (product.stock <= 0) {
        showNotification(`${product.name} is OUT OF STOCK.`, 'error', 3000);
        return;
      }

      playScannerBeep();
      onProductScanned(product, quantityInBaseUnit, packet?.uniqueBarcode);
      setRecentlyScannedId(product.id);
      showNotification(`Added to Bill: ${product.name} (${weightText} - ₹${calculatedPrice.toFixed(2)})`, 'success', 2500);
      setTimeout(() => setRecentlyScannedId(null), 1800);
      return;
    }

    const cleanLower = cleanText.toLowerCase();

    // Direct match by barcode, substring, ID, or exact/unique product name
    const found =
      products.find((p) => (p.barcode || '').toLowerCase() === cleanLower) ||
      products.find((p) => p.barcode && cleanLower.includes(p.barcode.toLowerCase())) ||
      products.find((p) => p.id.toString() === cleanText) ||
      products.find((p) => (p.name || '').trim().toLowerCase() === cleanLower) ||
      (filteredProducts.length === 1 && rawText === trimmedQuery ? filteredProducts[0] : undefined);

    if (found) {
      if (found.stock <= 0) {
        showNotification(`${found.name} is OUT OF STOCK.`, 'error', 3000);
        return;
      }

      playScannerBeep();
      onProductScanned(found, 1);
      setRecentlyScannedId(found.id);
      showNotification(`Added to Bill: ${found.name}`, 'success', 2500);
      setTimeout(() => setRecentlyScannedId(null), 1800);
    } else {
      showNotification(`No matching product found for "${rawText}".`, 'error', 3000);
    }
  };

  // Handle manual or USB barcode gun input
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeDetection(manualCode);
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/40 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Product Barcode & QR Reader</h3>
              <p className="text-xs text-slate-400">
                Scan with USB gun or click items to instantly add them to the bill on the right
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Close Window (or press Esc key)"
          >
            <X className="w-4 h-4 text-rose-400 group-hover:text-white transition-colors" />
            <span>Close ✕</span>
          </button>
        </div>

        {/* 2-Column Main Layout: Left = Scanner & Products | Right = Added Items */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT SIDE: USB SCANNER & QUICK DATABASE PRODUCTS */}
          <div className="lg:col-span-7 space-y-3.5">
            {notification && (
              <div
                className={`p-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold border animate-fadeIn ${
                  notification.type === 'error'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {notification.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                )}
                <span>{notification.message}</span>
              </div>
            )}

            {/* Barcode Gun / Manual Input */}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Type barcode or product name (e.g. 890100765964)..."
                  className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code font-bold"
                  autoFocus
                />
                {manualCode && (
                  <button
                    type="button"
                    onClick={() => setManualCode('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
                    title="Clear search to show all products"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Scan / Add</span>
              </button>
            </form>

            {/* Quick-Scan Attached Database Products List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {trimmedQuery
                    ? filteredProducts.length > 0
                      ? `Matching Database Products (${filteredProducts.length} Found — Click to Add)`
                      : 'No Matching Product Found'
                    : `Database Products (${products.length} — Click to Beep & Add to Bill)`}
                </span>
                <span className="text-[10px] text-slate-400">
                  {trimmedQuery ? 'Live Database Match' : 'Instant 1-Click Scan'}
                </span>
              </div>

              {/* Compact product grid */}
              {filteredProducts.length === 0 ? (
                <div className="py-12 px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-center">
                  <Barcode className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold text-slate-700">
                    No product matched &ldquo;{trimmedQuery}&rdquo;
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Only matching database products appear while searching. Clear the box to view all products.
                  </p>
                  <button
                    type="button"
                    onClick={() => setManualCode('')}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors"
                  >
                    Clear Search &amp; Show All Products
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                  {filteredProducts.map((item) => {
                    const isRecentlyAdded = recentlyScannedId === item.id;
                    const inCartItem = currentCart.find((c) => c.product.id === item.id);
                    const hasBatch = item.batchNo && item.batchNo !== '0';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleBarcodeDetection(item.barcode)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between group ${
                          isRecentlyAdded
                            ? 'border-emerald-500 bg-emerald-100/70 ring-2 ring-emerald-500'
                            : inCartItem
                            ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/60'
                            : 'border-slate-200 bg-white hover:border-emerald-500 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 leading-snug line-clamp-1 block">
                              {item.name}
                            </span>
                            {trimmedQuery && (
                              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                                {item.category}
                                {hasBatch ? ` · Batch: ${item.batchNo}` : ''}
                                {item.gstPercent ? ` · GST ${item.gstPercent}%` : ''}
                              </span>
                            )}
                          </div>
                          {inCartItem && (
                            <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.5 rounded font-mono-code flex-shrink-0">
                              {inCartItem.quantity} in bill
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                          <div className="font-mono-code text-slate-500 text-[10px] truncate max-w-[140px]">
                            #{item.barcode}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono-code">
                            <span className="font-bold text-emerald-800 text-xs">
                              ₹{(item.sellingPriceWithGst && item.sellingPriceWithGst > 0 ? item.sellingPriceWithGst : item.sellingPrice).toFixed(2)}/{item.unit}
                            </span>
                            <span
                              className={`text-[9px] px-1 rounded font-semibold ${
                                item.stock > item.minStockLevel
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.stock} left
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: ADDED ITEMS LIST */}
          <div className="lg:col-span-5 bg-slate-50 rounded-2xl border-2 border-emerald-500/40 p-4 flex flex-col justify-between h-full min-h-[460px]">
            <div>
              {/* Added Items Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-sm text-slate-900">
                    Added Items in Bill
                  </h4>
                </div>
                <span className="text-xs font-bold font-mono-code px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {currentCart.length} {currentCart.length === 1 ? 'item' : 'items'} ({totalItemUnits} units)
                </span>
              </div>

              {/* Items List */}
              <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1 divide-y divide-slate-200/60">
                {currentCart.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <PackageCheck className="w-10 h-10 mx-auto mb-2 text-slate-300 opacity-70" />
                    <p className="text-xs font-semibold text-slate-600">No items added yet</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                      Scan or tap any product on the left to add it to this bill.
                    </p>
                  </div>
                ) : (
                  currentCart.map((item) => {
                    const itemGstPct = Number(item.product.gstPercent || 0);
                    const itemBaseUnit = getExGstSellingPrice(item.product);
                    const itemLineWithGst = Number(
                      (itemBaseUnit * item.quantity * (1 + itemGstPct / 100)).toFixed(2)
                    );
                    return (
                    <div
                      key={item.product.id}
                      className="pt-2 pb-1 flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {item.product.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono-code flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span>Base ₹{itemBaseUnit.toFixed(2)}/{item.product.unit}</span>
                          {itemGstPct > 0 && <span className="text-emerald-700 font-semibold">+{itemGstPct}% GST</span>}
                          <span>·</span>
                          <span className="text-slate-400">{item.product.barcode}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex items-center border border-slate-300 rounded-lg bg-white shadow-xs overflow-hidden">
                          <button
                            type="button"
                            onClick={() => onUpdateCartItem(item.product.id, item.quantity - 1)}
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 text-xs font-bold"
                            title="Decrease"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-900 font-mono-code min-w-[20px] text-center">
                            {formatQuantityWithSubunit(item.quantity, item.product.unit)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity < item.product.stock) {
                                onUpdateCartItem(item.product.id, item.quantity + 1);
                              }
                            }}
                            disabled={item.quantity >= item.product.stock}
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 text-xs font-bold disabled:opacity-30"
                            title="Increase"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right min-w-[60px]">
                          <span className="font-mono-code font-bold text-xs text-emerald-800">
                            ₹{itemLineWithGst.toFixed(2)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveCartItem(item.product.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </div>

            {/* Bill Summary, Discount & Primary Action Buttons (Synced with Active Sales Bill) */}
            <div className="pt-3 border-t border-slate-300 space-y-2.5">
              {currentCart.length > 0 && setDiscountValue && setDiscountMode && (
                <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Percent className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Discount</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-[10px] font-extrabold">
                      <button
                        type="button"
                        onClick={() => setDiscountMode('AMOUNT')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                          discountMode === 'AMOUNT'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ₹
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountMode('PERCENT')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                          discountMode === 'PERCENT'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        %
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={discountMode === 'PERCENT' ? 100 : undefined}
                      step="any"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      className="w-20 px-2 py-1 text-right text-xs font-mono-code font-bold bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {billDiscountAmt > 0 && (
                      <button
                        type="button"
                        onClick={() => setDiscountValue('')}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Clear discount"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {currentCart.length > 0 && (
                <div className="space-y-1 text-xs">
                  {billDiscountAmt > 0 && (
                    <>
                      <div className="flex justify-between text-slate-500">
                        <span>Gross Value (Excl. GST):</span>
                        <span className="font-mono-code">₹{rawExGstSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-bold">
                        <span>
                          - Discount Allowed ({discountMode === 'PERCENT' ? `${Math.min(100, parsedDiscountNum)}%` : 'Flat'}):
                        </span>
                        <span className="font-mono-code">-₹{billDiscountAmt.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Base (Excl. GST):</span>
                    <span className="font-mono-code font-bold text-slate-800">₹{taxableSubtotal.toFixed(2)}</span>
                  </div>
                  {totalGst > 0 && (
                    <div className="flex justify-between text-emerald-800 font-bold">
                      <span>+ Output GST (CGST + SGST):</span>
                      <span className="font-mono-code">₹{totalGst.toFixed(2)}</span>
                    </div>
                  )}
                  {roundOff !== 0 && (
                    <div className="flex justify-between text-slate-500 font-semibold">
                      <span>+ Round Off Adjustment:</span>
                      <span className="font-mono-code">
                        {roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-baseline border-t border-slate-200 pt-2">
                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Net Payable (Rounded):
                </span>
                <span className="text-2xl font-extrabold text-emerald-700 font-mono-code">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition-colors text-center"
                >
                  Return to POS
                </button>

                {onProceedToCheckout ? (
                  <button
                    type="button"
                    disabled={currentCart.length === 0}
                    onClick={onProceedToCheckout}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition-all"
                  >
                    <span>Proceed to Pay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition-all"
                  >
                    <span>Save & Close</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Connected: USB Barcode Scanner & Quick Tap Reader</span>
          <span>Fast scan: Click or point USB scanner to add items</span>
        </div>
      </div>
    </div>
  );
};
