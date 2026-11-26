import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Trash2,
  QrCode,
  Banknote,
  ShoppingCart,
  Tag,
  AlertTriangle,
  Barcode as BarcodeIcon,
  Package,
  ShieldAlert,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Split,
  Users,
  Percent,
} from 'lucide-react';
import {
  Product,
  CartItem,
  SocietyProfile,
  AdminStoreSettings,
  LoosePacket,
  PartyAccount,
  HeldCartBill,
  PaymentMode,
} from '../types';
import { CATEGORIES } from '../data/initialData';
import { playScannerBeep } from '../utils/audio';
import { parseLooseBarcode, formatQuantityWithSubunit } from '../utils/looseBarcode';
import { Scale, X as CloseIcon } from 'lucide-react';
import { DirectLooseScaleModal } from './DirectLooseScaleModal';
import { getTransactionMode, isSellEnabled } from '../utils/transactionControl';

export function getExGstSellingPrice(product: Product): number {
  if (product.sellingPriceWD !== undefined && Number(product.sellingPriceWD) > 0) {
    return Number(product.sellingPriceWD);
  }
  const gstPct = Number(product.gstPercent || 0);
  const wt = Number(product.sellingPriceWithGst || product.sellingPrice || 0);
  if (gstPct > 0 && wt > 0) {
    return Number((wt / (1 + gstPct / 100)).toFixed(4));
  }
  return wt;
}

export function getExpiryStatus(expiryDate?: string): 'EXPIRED' | 'EXPIRING_SOON' | 'OK' {
  if (!expiryDate || !String(expiryDate).trim()) return 'OK';
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) return 'OK';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= 30) return 'EXPIRING_SOON';
  return 'OK';
}

interface PosTerminalProps {
  products: Product[];
  cart: CartItem[];
  loosePackets?: LoosePacket[];
  addToCart: (
    product: Product,
    quantity?: number,
    packetBarcode?: string,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    measuredWeightText?: string
  ) => void;
  updateQuantity: (
    productId: number,
    qty: number,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    packetBarcode?: string
  ) => void;
  removeFromCart: (
    productId: number,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    packetBarcode?: string
  ) => void;
  clearCart: () => void;
  onOpenScanner: () => void;
  onOpenWeighingStation?: () => void;
  onOpenProductQr: (product: Product) => void;
  onProceedToPayment: (mode: PaymentMode) => void;
  selectedCustomer: string;
  setSelectedCustomer: (cust: string) => void;
  society: SocietyProfile;
  adminSettings?: AdminStoreSettings;
  categories?: string[];
  onRefreshAll?: () => void;
  isRefreshingAll?: boolean;
  parties?: PartyAccount[];
  members?: PartyAccount[];
  selectedMemberId?: string;
  setSelectedMemberId?: (id: string) => void;
  buyerGstin?: string;
  setBuyerGstin?: (gstin: string) => void;
  discountMode?: 'AMOUNT' | 'PERCENT';
  setDiscountMode?: (mode: 'AMOUNT' | 'PERCENT') => void;
  discountValue?: string;
  setDiscountValue?: (val: string) => void;
  heldBills?: HeldCartBill[];
  onHoldCurrentBill?: () => void;
  onResumeHeldBill?: (billId: string) => void;
  onDeleteHeldBill?: (billId: string) => void;
  onDiscardHeldBill?: (billId: string) => void;
}

export const PosTerminal: React.FC<PosTerminalProps> = ({
  products,
  cart,
  loosePackets,
  addToCart,
  updateQuantity,
  removeFromCart,
  clearCart,
  onOpenScanner,
  onOpenProductQr,
  onProceedToPayment,
  selectedCustomer,
  setSelectedCustomer,
  society,
  adminSettings,
  categories,
  onRefreshAll,
  isRefreshingAll = false,
  parties = [],
  members = [],
  selectedMemberId = '',
  setSelectedMemberId,
  setBuyerGstin,
  discountMode = 'AMOUNT',
  setDiscountMode,
  discountValue = '',
  setDiscountValue,
  heldBills = [],
  onHoldCurrentBill,
  onResumeHeldBill,
  onDeleteHeldBill: propOnDeleteHeldBill,
  onDiscardHeldBill,
}) => {
  const onDeleteHeldBill = propOnDeleteHeldBill || onDiscardHeldBill;
  const [selectedCategory, setSelectedCategory] = useState('All Items');
  const [searchQuery, setSearchQuery] = useState('');
  const [saleTypeFilter, setSaleTypeFilter] = useState<'ALL' | 'BARCODE' | 'DIRECT_LOOSE'>('ALL');
  const [catalogView, setCatalogView] = useState<'cards' | 'list'>('cards');
  const [selectedLooseProduct, setSelectedLooseProduct] = useState<Product | null>(null);
  const [customLooseGramInput, setCustomLooseGramInput] = useState<string>('250');
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [isDirectScaleOpen, setIsDirectScaleOpen] = useState(false);
  const [directScaleProductId, setDirectScaleProductId] = useState<number | undefined>(undefined);
  const [showHeldList, setShowHeldList] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const sourceParties = parties.length > 0 ? parties : members;
  const memberParties = sourceParties.filter((p) => p.partyType === 'MEMBER' && p.isActive !== false);

  const txMode = getTransactionMode(adminSettings);
  const sellAllowed = isSellEnabled(adminSettings);

  // Keyboard shortcuts: F2 Search, F4 Scanner, F8 UPI, F9 Cash
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        onOpenScanner();
      } else if (e.key === 'F8' && cart.length > 0 && sellAllowed) {
        e.preventDefault();
        onProceedToPayment('UPI');
      } else if (e.key === 'F9' && cart.length > 0 && sellAllowed) {
        e.preventDefault();
        onProceedToPayment('CASH');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cart.length, sellAllowed, onOpenScanner, onProceedToPayment]);

  // Handle barcode search / scan input change
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (val.trim()) {
      const looseResult = parseLooseBarcode(val.trim(), products, loosePackets);
      if (looseResult) {
        if (looseResult.alreadySold) {
          setSearchWarning(looseResult.alreadySoldInfo || `Package #${val.trim()} was ALREADY SOLD!`);
          setTimeout(() => setSearchWarning(null), 4000);
          return;
        }
        playScannerBeep();
        addToCart(looseResult.product, looseResult.quantityInBaseUnit, looseResult.packet?.uniqueBarcode, 'WITH_BARCODE');
        setSearchQuery('');
        return;
      }

      if (val.trim().length >= 8) {
        const exactMatch = products.find((p) => p.barcode === val.trim());
        if (exactMatch && exactMatch.stock > 0) {
          playScannerBeep();
          addToCart(exactMatch, 1, undefined, 'WITH_BARCODE');
          setSearchQuery('');
        }
      }
    }
  };

  // Helper to add loose quantity directly without barcode
  const addLooseQuantityToCart = (product: Product, gramsOrMl: number, isDirectWithoutBarcode = true) => {
    let qtyInBaseUnit = 1;
    let weightText = `${gramsOrMl} GM`;

    if (product.unit === 'KG') {
      qtyInBaseUnit = gramsOrMl / 1000;
      weightText = gramsOrMl >= 1000 ? `${(gramsOrMl / 1000).toFixed(3)} KG` : `${gramsOrMl} GM`;
    } else if (product.unit === 'LTR') {
      qtyInBaseUnit = gramsOrMl / 1000;
      weightText = gramsOrMl >= 1000 ? `${(gramsOrMl / 1000).toFixed(3)} LTR` : `${gramsOrMl} ML`;
    } else if (product.unit === 'GM') {
      qtyInBaseUnit = gramsOrMl;
      weightText = `${gramsOrMl} GM`;
    } else if (product.unit === 'ML') {
      qtyInBaseUnit = gramsOrMl;
      weightText = `${gramsOrMl} ML`;
    } else {
      qtyInBaseUnit = gramsOrMl;
      weightText = `${gramsOrMl} ${product.unit}`;
    }

    playScannerBeep();
    addToCart(
      product,
      qtyInBaseUnit,
      undefined,
      isDirectWithoutBarcode ? 'WITHOUT_BARCODE' : 'WITH_BARCODE',
      weightText
    );
    setSelectedLooseProduct(null);
  };

  // Filter products
  const filteredProducts = products.filter((item) => {
    const matchesCategory =
      selectedCategory === 'All Items' || item.category === selectedCategory;
    const q = (searchQuery || '').toLowerCase();
    const matchesSearch =
      (item.name || '').toLowerCase().includes(q) ||
      (item.barcode || '').includes(q) ||
      (item.hsnCode || '').toLowerCase().includes(q) ||
      item.id?.toString() === q ||
      (item.category || '').toLowerCase().includes(q);

    const isLooseItem = ['KG', 'LTR', 'GM', 'ML'].includes(item.unit);
    let matchesSaleType = true;
    if (saleTypeFilter === 'BARCODE') {
      matchesSaleType = !isLooseItem || Boolean(item.barcode);
    } else if (saleTypeFilter === 'DIRECT_LOOSE') {
      matchesSaleType = isLooseItem;
    }

    return matchesCategory && matchesSearch && matchesSaleType;
  });

  // Correct Excl.-GST Base + Optional Discount (Anyone) + GST + Round-off (Synced with App.tsx)
  const rawExGstSubtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const parsedDiscountNum = Math.max(0, Number(discountValue || 0) || 0);
  const billDiscountAmt =
    rawExGstSubtotal > 0 && parsedDiscountNum > 0
      ? discountMode === 'PERCENT'
        ? Number(((rawExGstSubtotal * Math.min(100, parsedDiscountNum)) / 100).toFixed(2))
        : Number(Math.min(rawExGstSubtotal, parsedDiscountNum).toFixed(2))
      : 0;
  const discFactor =
    rawExGstSubtotal > 0 ? Math.max(0, (rawExGstSubtotal - billDiscountAmt) / rawExGstSubtotal) : 1;
  const subtotal = Number(Math.max(0, rawExGstSubtotal - billDiscountAmt).toFixed(2));
  const totalGst = cart.reduce((sum, item) => {
    const gstPct = Number(item.product.gstPercent || 0);
    return sum + (item.lineTotal * discFactor * gstPct) / 100;
  }, 0);
  const rawTotal = Math.max(0, Number((subtotal + totalGst).toFixed(2)));
  const grandTotal = Math.ceil(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  const expiredInCart = cart.filter((it) => getExpiryStatus(it.product.expiryDate) === 'EXPIRED');

  return (
    <div className="w-full px-3 sm:px-4 lg:px-5 py-2">
      {!sellAllowed && (
        <div
          className={`mb-4 p-3.5 border-2 rounded-2xl flex items-center justify-between gap-3 shadow-sm animate-fadeIn ${
            txMode === 'ONLY_PURCHASE'
              ? 'bg-indigo-50 border-indigo-500 text-indigo-950'
              : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            <ShieldAlert
              className={`w-6 h-6 flex-shrink-0 ${
                txMode === 'ONLY_PURCHASE' ? 'text-indigo-600' : 'text-rose-600'
              }`}
            />
            <div>
              <h4 className="font-extrabold text-sm">
                {txMode === 'ONLY_PURCHASE'
                  ? 'POS Sales Paused — ONLY PURCHASE Category Active'
                  : 'Store Transactions are Currently STOPPED by Admin'}
              </h4>
              <p className="text-xs opacity-85 mt-0.5">
                {adminSettings?.haltReason ||
                  (txMode === 'ONLY_PURCHASE'
                    ? 'Administrator has restricted store activity to Only Purchase. Customer billing is temporarily paused.'
                    : 'Billing has been temporarily paused by Administration. Cashiers cannot finalize sales.')}
              </p>
            </div>
          </div>
          <span
            className={`text-xs font-mono-code font-bold px-2.5 py-1 rounded-lg ${
              txMode === 'ONLY_PURCHASE' ? 'bg-indigo-200 text-indigo-900' : 'bg-rose-200 text-rose-900'
            }`}
          >
            {txMode === 'ONLY_PURCHASE' ? 'ONLY PURCHASE' : 'STOP TRANSACTION'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left Column: Product Catalog & Search */}
        <div className="lg:col-span-7 xl:col-span-8 2xl:col-span-9 min-w-0 space-y-2">
          <div className="bg-white p-2 rounded-xl shadow-xs border border-slate-200 space-y-1.5">
            {searchWarning && (
              <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-bold text-amber-900 flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{searchWarning}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 min-w-0 w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search or scan barcode, product name, HSN, or SKU... [F2]"
                  className="w-full pl-9 pr-12 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDirectScaleProductId(undefined);
                    setIsDirectScaleOpen(true);
                  }}
                  className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Direct Loose Weighing & Selling (Without Barcode)"
                >
                  <Scale className="w-3.5 h-3.5 text-amber-200" />
                  <span>Direct Scale</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BarcodeIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scanner [F4]</span>
                </button>

                {onRefreshAll && (
                  <button
                    type="button"
                    onClick={onRefreshAll}
                    disabled={isRefreshingAll}
                    className="flex-1 sm:flex-initial px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingAll ? 'Syncing...' : 'Refresh'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 flex-1">
                {(categories || CATEGORIES).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200 flex items-center text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setSaleTypeFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    saleTypeFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSaleTypeFilter('BARCODE')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    saleTypeFilter === 'BARCODE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarcodeIcon className="w-3 h-3" />
                  <span>Barcode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleTypeFilter('DIRECT_LOOSE')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    saleTypeFilter === 'DIRECT_LOOSE'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Scale className="w-3 h-3" />
                  <span>Loose</span>
                </button>
              </div>
            </div>
          </div>

          {/* View Switcher Bar (Compact cards | List rows) + visible count */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setCatalogView('cards')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  catalogView === 'cards'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Compact cards
              </button>
              <button
                type="button"
                onClick={() => setCatalogView('list')}
                className={`px-3 py-1.5 text-xs font-semibold border-l border-slate-200 transition-colors whitespace-nowrap cursor-pointer ${
                  catalogView === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                List rows
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium tabular-nums">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} visible ·{' '}
              {catalogView === 'cards' ? 'tap a card to add' : 'tap a row or + to add'}
            </div>
          </div>

          {/* VIEW 1: HIGH-DENSITY COMPACT CARDS (15+ items per screen, tap card to add) */}
          {catalogView === 'cards' && filteredProducts.length > 0 && (
            <div className="h-[calc(100vh-180px)] min-h-[580px] overflow-y-scroll pr-1.5 pos-items-scroll">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 pb-2">
              {filteredProducts.map((product) => {
                const inStock = product.stock > 0;
                const isLowStock = product.stock <= product.minStockLevel && inStock;
                const expStatus = getExpiryStatus(product.expiryDate);
                const wtPrice =
                  product.sellingPriceWithGst && product.sellingPriceWithGst > 0
                    ? product.sellingPriceWithGst
                    : product.sellingPrice;
                const basePrice = getExGstSellingPrice(product);
                const gstPct = Number(product.gstPercent || 0);
                const totalCartQty = cart
                  .filter((c) => c.product.id === product.id)
                  .reduce((sum, c) => sum + Number(c.quantity || 0), 0);
                const formattedCartCount =
                  totalCartQty > 0
                    ? Number.isInteger(totalCartQty)
                      ? String(totalCartQty)
                      : Number(totalCartQty.toFixed(2)).toString()
                    : '';
                const stockFormatted = Number.isInteger(Number(product.stock))
                  ? String(product.stock)
                  : Number(Number(product.stock).toFixed(2)).toString();
                const canTapAdd = inStock && sellAllowed && totalCartQty < product.stock;

                const hoverTitle = [
                  product.name,
                  `Base ₹${basePrice.toFixed(2)} + ${gstPct}% GST = ₹${wtPrice.toFixed(2)} / ${product.unit}`,
                  `SKU: ${product.id}`,
                  product.barcode ? `Barcode: ${product.barcode}` : null,
                  product.hsnCode ? `HSN: ${product.hsnCode}` : null,
                  product.expiryDate ? `Exp: ${product.expiryDate}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');

                const handleCardTap = () => {
                  if (!canTapAdd) return;
                  addToCart(product, 1, undefined, 'WITH_BARCODE');
                  playScannerBeep();
                };

                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={canTapAdd ? 0 : -1}
                    title={hoverTitle}
                    onClick={handleCardTap}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardTap();
                      }
                    }}
                    className={`group relative min-w-0 rounded-xl border px-2.5 py-2 transition-all duration-150 flex flex-col justify-between select-none ${
                      !inStock
                        ? 'bg-slate-50/80 border-slate-200 opacity-65 cursor-not-allowed'
                        : expStatus === 'EXPIRED'
                        ? 'bg-rose-50/40 border-rose-300 hover:border-rose-400 cursor-pointer active:scale-[0.985]'
                        : totalCartQty > 0
                        ? 'bg-sky-50/30 border-sky-400 hover:border-sky-500 shadow-2xs cursor-pointer active:scale-[0.985]'
                        : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-sm cursor-pointer active:scale-[0.985]'
                    }`}
                  >
                    {/* Top row: Name + small corner Scale button */}
                    <div className="flex items-start justify-between gap-1.5 min-w-0">
                      <h4 className="font-semibold text-[12.5px] text-slate-900 leading-tight line-clamp-2 min-h-[2rem] break-words">
                        {product.name}
                      </h4>

                      <button
                        type="button"
                        disabled={!inStock || !sellAllowed}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!inStock || !sellAllowed) return;
                          setDirectScaleProductId(product.id);
                          setIsDirectScaleOpen(true);
                        }}
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-slate-600 hover:text-amber-700 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                        title={`Weigh / Loose Scale (${product.name})`}
                        aria-label={`Weigh ${product.name} on scale`}
                      >
                        <Scale className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Middle row: Price / UNIT */}
                    <div className="mt-1.5 flex items-baseline gap-1 min-w-0">
                      <span className="text-[15px] font-bold text-slate-900 font-mono-code tabular-nums tracking-tight">
                        ₹{wtPrice.toFixed(2)}
                      </span>
                      <span className="text-[10.5px] font-medium text-slate-500 uppercase truncate">
                        /{product.unit}
                      </span>
                    </div>

                    {/* Bottom row: Stock pill + short GST label on left, Count badge on right */}
                    <div className="mt-1.5 flex items-center justify-between gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                        <span
                          className={`text-[10px] font-mono-code tabular-nums font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                            !inStock
                              ? 'bg-rose-100 text-rose-800'
                              : isLowStock
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {!inStock ? 'Out' : `${stockFormatted} ${product.unit}`}
                        </span>
                        <span className="text-[10.5px] font-medium text-slate-500 whitespace-nowrap truncate">
                          GST {gstPct}%
                        </span>
                        {expStatus === 'EXPIRED' && (
                          <span className="text-[9px] font-black px-1 py-0.2 rounded bg-rose-600 text-white shrink-0">
                            EXP
                          </span>
                        )}
                      </div>

                      {totalCartQty > 0 && (
                        <span
                          className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-sky-100 text-sky-700 font-mono-code tabular-nums font-bold text-[11px] flex items-center justify-center shrink-0"
                          title={`In bill: ${formattedCartCount} ${product.unit}`}
                        >
                          {formattedCartCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* VIEW 2: COMPACT LIST ROWS (~32px per row, 16-20+ visible, keyboard & scanner friendly) */}
          {catalogView === 'list' && filteredProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="h-[calc(100vh-180px)] min-h-[580px] overflow-y-scroll pos-items-scroll">
                {/* Sticky List Header */}
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_88px_82px_42px_60px] sm:grid-cols-[minmax(0,1fr)_104px_92px_48px_64px] items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <span>Item</span>
                  <span>Stock</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">GST</span>
                  <span className="sr-only">Actions</span>
                </div>

                {/* List Rows */}
                <div className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const inStock = product.stock > 0;
                  const isLowStock = product.stock <= product.minStockLevel && inStock;
                  const expStatus = getExpiryStatus(product.expiryDate);
                  const wtPrice =
                    product.sellingPriceWithGst && product.sellingPriceWithGst > 0
                      ? product.sellingPriceWithGst
                      : product.sellingPrice;
                  const basePrice = getExGstSellingPrice(product);
                  const gstPct = Number(product.gstPercent || 0);
                  const totalCartQty = cart
                    .filter((c) => c.product.id === product.id)
                    .reduce((sum, c) => sum + Number(c.quantity || 0), 0);
                  const formattedCartCount =
                    totalCartQty > 0
                      ? Number.isInteger(totalCartQty)
                        ? String(totalCartQty)
                        : Number(totalCartQty.toFixed(2)).toString()
                      : '';
                  const stockFormatted = Number.isInteger(Number(product.stock))
                    ? String(product.stock)
                    : Number(Number(product.stock).toFixed(2)).toString();
                  const canTapAdd = inStock && sellAllowed && totalCartQty < product.stock;

                  const hoverTitle = [
                    product.name,
                    `Base ₹${basePrice.toFixed(2)} + ${gstPct}% GST = ₹${wtPrice.toFixed(2)} / ${product.unit}`,
                    `SKU: ${product.id}`,
                    product.barcode ? `Barcode: ${product.barcode}` : null,
                    product.hsnCode ? `HSN: ${product.hsnCode}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  const handleRowAdd = () => {
                    if (!canTapAdd) return;
                    addToCart(product, 1, undefined, 'WITH_BARCODE');
                    playScannerBeep();
                  };

                  return (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={canTapAdd ? 0 : -1}
                      title={hoverTitle}
                      onClick={handleRowAdd}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowAdd();
                        }
                      }}
                      className={`grid grid-cols-[minmax(0,1fr)_88px_82px_42px_60px] sm:grid-cols-[minmax(0,1fr)_104px_92px_48px_64px] items-center gap-2 px-3 min-h-[32px] py-0.5 transition-colors select-none ${
                        !inStock
                          ? 'bg-slate-50/70 opacity-60 cursor-not-allowed'
                          : totalCartQty > 0
                          ? 'bg-sky-50/40 hover:bg-sky-50/70 cursor-pointer'
                          : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      {/* Item name + optional active cart count badge */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12.5px] font-medium text-slate-900 truncate">
                          {product.name}
                        </span>
                        {expStatus === 'EXPIRED' && (
                          <span className="text-[9px] font-black px-1 py-0.2 rounded bg-rose-600 text-white shrink-0">
                            EXP
                          </span>
                        )}
                        {totalCartQty > 0 && (
                          <span className="min-w-[20px] h-[18px] px-1 rounded-full bg-sky-100 text-sky-700 font-mono-code tabular-nums font-bold text-[10px] flex items-center justify-center shrink-0">
                            {formattedCartCount}
                          </span>
                        )}
                      </div>

                      {/* Stock pill */}
                      <div className="min-w-0">
                        <span
                          className={`inline-block text-[10px] font-mono-code tabular-nums font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                            !inStock
                              ? 'bg-rose-100 text-rose-800'
                              : isLowStock
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {!inStock ? 'Out' : `${stockFormatted} ${product.unit}`}
                        </span>
                      </div>

                      {/* Price */}
                      <div className="text-right font-mono-code tabular-nums text-[12.5px] font-semibold text-slate-900 whitespace-nowrap">
                        ₹{wtPrice.toFixed(2)}
                      </div>

                      {/* GST */}
                      <div className="text-right text-[11px] font-medium text-slate-500 tabular-nums whitespace-nowrap">
                        {gstPct}%
                      </div>

                      {/* Scale & + action buttons */}
                      <div className="flex items-center justify-end gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={!inStock || !sellAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!inStock || !sellAllowed) return;
                            setDirectScaleProductId(product.id);
                            setIsDirectScaleOpen(true);
                          }}
                          className="w-[24px] h-[24px] rounded-md border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-700 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
                          title={`Weigh / Loose Scale (${product.name})`}
                          aria-label={`Weigh ${product.name}`}
                        >
                          <Scale className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={!canTapAdd}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowAdd();
                          }}
                          className={`w-[24px] h-[24px] rounded-md border flex items-center justify-center transition-colors ${
                            canTapAdd
                              ? 'border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-slate-800 hover:text-emerald-700 cursor-pointer'
                              : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                          title={`Add 1 ${product.unit} to bill`}
                          aria-label={`Add ${product.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          )}

          {filteredProducts.length === 0 && (
            <div className="p-10 text-center bg-white rounded-xl border border-slate-200">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
              <h4 className="font-bold text-sm text-slate-700">No products match your search</h4>
              <p className="text-xs text-slate-500 mt-1">
                Try searching with a different term or clear the category filter.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Billing & Cart Drawer */}
        <div className="lg:col-span-5 xl:col-span-4 2xl:col-span-3 min-w-0 sticky top-20 space-y-3">
          {heldBills.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowHeldList(!showHeldList)}
                  className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <PauseCircle className="w-4 h-4 text-amber-700" />
                  <span>{heldBills.length} Parked / Held {heldBills.length === 1 ? 'Bill' : 'Bills'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHeldList(!showHeldList)}
                  className="text-[11px] font-bold text-amber-800 underline cursor-pointer"
                >
                  {showHeldList ? 'Hide' : 'Show & Resume'}
                </button>
              </div>
              {showHeldList && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1 border-t border-amber-200">
                  {heldBills.map((hb) => (
                    <div
                      key={hb.id}
                      className="bg-white rounded-lg p-2 border border-amber-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{hb.customerName || 'Walk-in Customer'}</div>
                        <div className="text-[10px] text-slate-500 font-mono-code">
                          {hb.items.length} items · Parked {hb.heldAt}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onResumeHeldBill && (
                          <button
                            type="button"
                            onClick={() => {
                              onResumeHeldBill(hb.id);
                              setShowHeldList(false);
                            }}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <PlayCircle className="w-3 h-3" />
                            <span>Resume</span>
                          </button>
                        )}
                        {onDeleteHeldBill && (
                          <button
                            type="button"
                            onClick={() => onDeleteHeldBill(hb.id)}
                            className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                            title="Discard parked bill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Active Sales Bill</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {cart.length > 0 && onHoldCurrentBill && (
                  <button
                    type="button"
                    onClick={onHoldCurrentBill}
                    className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 text-xs font-bold border border-amber-500/40 transition-all flex items-center gap-1 cursor-pointer"
                    title="Hold / Park this bill to serve next customer"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Hold</span>
                  </button>
                )}
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white text-xs font-bold border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer"
                    title="Clear all items from cart"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-code border border-emerald-500/30">
                  {cart.length}
                </span>
              </div>
            </div>

            {memberParties.length > 0 && setSelectedMemberId && (
              <div className="p-3 bg-slate-50 border-b border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Users className="w-3 h-3 text-emerald-600" />
                  <span>Cooperative Member / Farmer (Optional)</span>
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => {
                    const mid = e.target.value;
                    setSelectedMemberId(mid);
                    const found = memberParties.find((m) => m.id === mid);
                    if (found) {
                      setSelectedCustomer(found.name);
                      if (setBuyerGstin) setBuyerGstin(found.gstin || '');
                    } else {
                      setSelectedCustomer('Walk-in Customer');
                      if (setBuyerGstin) setBuyerGstin('');
                    }
                  }}
                  className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Walk-in / Cash Customer --</option>
                  {memberParties.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.memberNo ? `(${m.memberNo})` : ''} {m.phone ? `· ${m.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {expiredInCart.length > 0 && (
              <div className="mx-3 mt-2 p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-[11px] font-bold text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Expiry Alert: {expiredInCart.map((i) => i.product.name).join(', ')} has passed expiry date! Verify batch before sale.
                </span>
              </div>
            )}

            <div className="p-3 max-h-[310px] overflow-y-auto divide-y divide-slate-100 flex-1">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 text-slate-300 opacity-60" />
                  <p className="text-xs font-medium text-slate-600">Cart is empty</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Scan a product QR/barcode or select items from catalog to start billing.
                  </p>
                </div>
              ) : (
                cart.map((item, idx) => {
                  const isWithoutBarcode = item.barcodeMode === 'WITHOUT_BARCODE';
                  const itemGstPct = Number(item.product.gstPercent || 0);
                  const itemWtLine = Number((item.lineTotal * (1 + itemGstPct / 100)).toFixed(2));
                  return (
                    <div
                      key={`${item.product.id}-${item.barcodeMode || 'barcode'}-${item.packetBarcode || ''}-${idx}`}
                      className="py-2.5 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h5 className="font-bold text-xs text-slate-900 truncate">
                            {item.product.name}
                          </h5>
                          {isWithoutBarcode ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5 shrink-0">
                              <Scale className="w-2.5 h-2.5 text-amber-700" />
                              Loose
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5 shrink-0">
                              <Tag className="w-2.5 h-2.5 text-emerald-700" />
                              Barcode
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-500 font-mono-code flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                          <span>Base ₹{item.sellingPrice.toFixed(2)}</span>
                          <span>×</span>
                          <span className="font-bold text-emerald-800">
                            {item.measuredWeightText || formatQuantityWithSubunit(item.quantity, item.product.unit)}
                          </span>
                          {itemGstPct > 0 && <span className="text-slate-400">+{itemGstPct}% GST</span>}
                          {(item.packetBarcode || item.product.barcode || item.product.id) && (
                            <span className="text-slate-400">
                              · {item.packetBarcode || item.product.barcode || `SKU ${item.product.id}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.product.id,
                                item.quantity - (isWithoutBarcode ? 0.25 : 1),
                                item.barcodeMode,
                                item.packetBarcode
                              )
                            }
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-200 text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="px-1.5 text-xs font-bold text-slate-800 font-mono-code">
                            {item.quantity >= 1 ? item.quantity.toFixed(1) : item.quantity.toFixed(3)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity < item.product.stock) {
                                updateQuantity(
                                  item.product.id,
                                  item.quantity + (isWithoutBarcode ? 0.25 : 1),
                                  item.barcodeMode,
                                  item.packetBarcode
                                );
                              }
                            }}
                            disabled={item.quantity >= item.product.stock}
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-200 text-xs font-bold disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right min-w-[65px]">
                          <span className="font-mono-code font-bold text-xs text-slate-900">
                            ₹{itemWtLine.toFixed(2)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id, item.barcodeMode, item.packetBarcode)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                          title="Remove from bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2.5">
                {setDiscountValue && setDiscountMode && (
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
                          <CloseIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
                    <span className="font-mono-code font-bold text-slate-800">₹{subtotal.toFixed(2)}</span>
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
                      <span className="font-mono-code">{roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-baseline border-t border-slate-200 pt-2">
                  <span className="font-extrabold text-sm text-slate-900">Net Payable (Rounded):</span>
                  <span className="text-2xl font-extrabold text-emerald-700 font-mono-code">
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>

                {!sellAllowed ? (
                  <div
                    className={`pt-2 p-3 border rounded-xl text-xs space-y-1 text-center ${
                      txMode === 'ONLY_PURCHASE'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'bg-rose-50 border-rose-300 text-rose-800'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {txMode === 'ONLY_PURCHASE'
                          ? 'POS Sales Paused (Only Purchase Mode)'
                          : 'Billing Stopped by Admin'}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-85">
                      {adminSettings?.haltReason || 'Sales transactions are currently blocked by Society Administration.'}
                    </p>
                  </div>
                ) : (
                  <div className="pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onProceedToPayment('UPI')}
                        disabled={adminSettings && !adminSettings.upiPaymentsEnabled}
                        className={`py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer ${
                          adminSettings && !adminSettings.upiPaymentsEnabled
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <QrCode className="w-4 h-4 text-emerald-200" />
                        <span>UPI QR [F8]</span>
                      </button>

                      <button
                        onClick={() => onProceedToPayment('CASH')}
                        disabled={adminSettings && !adminSettings.cashPaymentsEnabled}
                        className={`py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer ${
                          adminSettings && !adminSettings.cashPaymentsEnabled
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        <Banknote className="w-4 h-4 text-amber-400" />
                        <span>Cash [F9]</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onProceedToPayment('SPLIT')}
                      disabled={
                        adminSettings &&
                        (!adminSettings.cashPaymentsEnabled || !adminSettings.upiPaymentsEnabled)
                      }
                      className="w-full py-2 px-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      <Split className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Split (Cash+UPI)</span>
                    </button>
                  </div>
                )}

                <div className="pt-2 text-right border-t border-slate-100 mt-2">
                  <span className="text-[10px] text-slate-400 font-mono-code">{society.counterId}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedLooseProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-600" />
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">
                    Select Loose Package Weight / Volume
                  </h4>
                  <p className="text-[11px] text-slate-500">{selectedLooseProduct.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLooseProduct(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs text-amber-900 font-mono-code">
              <span>Unit Rate (WT GST):</span>
              <strong className="text-sm text-slate-900 font-extrabold">
                ₹{selectedLooseProduct.sellingPrice.toFixed(2)} / {selectedLooseProduct.unit}
              </strong>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Quick Pack Presets:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[100, 250, 500, 750, 1000].map((gram) => {
                  const unitLabel =
                    selectedLooseProduct.unit === 'LTR' || selectedLooseProduct.unit === 'ML'
                      ? gram >= 1000
                        ? '1 LTR'
                        : `${gram} ML`
                      : gram >= 1000
                      ? '1 KG'
                      : `${gram} GM`;
                  const calcPrice =
                    selectedLooseProduct.unit === 'KG' || selectedLooseProduct.unit === 'LTR'
                      ? (selectedLooseProduct.sellingPrice * gram) / 1000
                      : selectedLooseProduct.sellingPrice * gram;

                  return (
                    <button
                      key={gram}
                      type="button"
                      onClick={() => addLooseQuantityToCart(selectedLooseProduct, gram)}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-500 transition-all flex flex-col items-center justify-center font-mono-code text-center group"
                    >
                      <span className="font-extrabold text-slate-900 group-hover:text-emerald-700">
                        {unitLabel}
                      </span>
                      <span className="text-[10px] text-slate-500 group-hover:text-emerald-800 font-semibold">
                        ₹{calcPrice.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Or Custom Amount ({selectedLooseProduct.unit === 'LTR' || selectedLooseProduct.unit === 'ML' ? 'ML' : 'Grams'}):
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customLooseGramInput}
                  onChange={(e) => setCustomLooseGramInput(e.target.value)}
                  placeholder="e.g. 350"
                  className="flex-1 px-3 py-2 text-xs font-mono-code font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(customLooseGramInput);
                    if (!isNaN(num) && num > 0) {
                      addLooseQuantityToCart(selectedLooseProduct, num);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors"
                >
                  Add Custom Wt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DirectLooseScaleModal
        isOpen={isDirectScaleOpen}
        onClose={() => setIsDirectScaleOpen(false)}
        products={products}
        onAddToCart={addToCart}
        initialProductId={directScaleProductId}
      />
    </div>
  );
};
