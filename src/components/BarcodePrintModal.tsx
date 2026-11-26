import React, { useState, useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  Printer,
  Barcode,
  QrCode,
  X,
  Check,
  CheckSquare,
  Square,
  Search,
  Filter,
  Layers,
  Settings2,
  RotateCcw,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Plus,
  Minus,
  Sparkles,
  AlertTriangle,
  Grid,
  FileText,
  Ban,
  ArrowRight
} from 'lucide-react';
import { Product, SocietyProfile } from '../types';
import { printElement } from '../utils/print';
import { getExGstSellingPrice } from './PosTerminal';

export type LabelFormat = 'a4-24' | 'a4-30' | 'thermal-roll' | 'shelf-card';

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  society: SocietyProfile;
  initialSelectedProduct?: Product | null;
}

// Subcomponent: Renders crisp SVG 1D Barcode with JsBarcode
const BarcodeSvg: React.FC<{
  value: string;
  format?: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
}> = ({
  value,
  format = 'CODE128',
  height = 36,
  width = 1.4,
  fontSize = 11,
  displayValue = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          textMargin: 1,
          margin: 1,
          lineColor: '#000000',
          background: 'transparent',
        });
      } catch (err) {
        console.warn('Barcode render issue:', err);
      }
    }
  }, [value, format, height, width, fontSize, displayValue]);

  return <svg ref={svgRef} className="max-w-full h-auto mx-auto block" />;
};

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  products,
  society,
  initialSelectedProduct,
}) => {
  // Only show products with available stock (> 0)
  const inStockProducts = useMemo(
    () => products.filter((p) => Number(p.stock || 0) > 0),
    [products]
  );

  // Label Layout & Format
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('a4-24');

  // Included products (set of product IDs)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(() => {
    if (initialSelectedProduct && Number(initialSelectedProduct.stock || 0) > 0) {
      return new Set([initialSelectedProduct.id]);
    }
    return new Set(products.filter((p) => Number(p.stock || 0) > 0).map((p) => p.id));
  });

  // Copies count per product (id -> copies)
  const [copiesPerProduct, setCopiesPerProduct] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    products
      .filter((p) => Number(p.stock || 0) > 0)
      .forEach((p) => {
        initial[p.id] = 1;
      });
    return initial;
  });

  // Skip individual label instances by unique key: `prodId-copyIndex`
  const [skippedLabels, setSkippedLabels] = useState<Set<string>>(new Set());

  // Sheet layout settings
  const [skipLeadingSlots, setSkipLeadingSlots] = useState<number>(0); // Skip first N already used stickers on sheet
  const [preserveBlankSpacers, setPreserveBlankSpacers] = useState<boolean>(true); // When true, skipped items leave blank white sticker slots

  // Display customizations
  const [showSocietyHeader, setShowSocietyHeader] = useState<boolean>(true);
  const [show1DBarcode, setShow1DBarcode] = useState<boolean>(true);
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBatchInfo, setShowBatchInfo] = useState<boolean>(true);

  // Search & Filter in selector list
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'preview' | 'selection'>('preview');

  // QR code image cache
  const [qrCodeDataUrls, setQrCodeDataUrls] = useState<Record<string, string>>({});

  // Reset or initialize when modal opens or initialSelectedProduct changes
  useEffect(() => {
    if (isOpen) {
      if (initialSelectedProduct && Number(initialSelectedProduct.stock || 0) > 0) {
        setSelectedProductIds(new Set([initialSelectedProduct.id]));
        setCopiesPerProduct({ [initialSelectedProduct.id]: 1 });
      } else {
        setSelectedProductIds(new Set(inStockProducts.map((p) => p.id)));
        const copies: Record<number, number> = {};
        inStockProducts.forEach((p) => {
          copies[p.id] = 1;
        });
        setCopiesPerProduct(copies);
      }
      setSkippedLabels(new Set());
    }
  }, [isOpen, initialSelectedProduct, inStockProducts]);

  // Generate QR codes for all in-stock products
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    inStockProducts.forEach((prod) => {
      if (!qrCodeDataUrls[prod.barcode]) {
        QRCode.toDataURL(prod.barcode, {
          width: 140,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        })
          .then((url) => {
            if (isMounted) {
              setQrCodeDataUrls((prev) => ({ ...prev, [prod.barcode]: url }));
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, inStockProducts, qrCodeDataUrls]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    inStockProducts.forEach((p) => set.add(p.category));
    return ['All', ...Array.from(set)];
  }, [inStockProducts]);

  // Filtered products list for product selector
  const filteredProducts = useMemo(() => {
    return inStockProducts.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const q = (searchQuery || '').toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.category || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [inStockProducts, selectedCategory, searchQuery]);

  // Compute all label items to render
  interface RenderLabelItem {
    key: string;
    product: Product;
    copyIndex: number;
    isSkipped: boolean;
  }

  const { allLabelItems, totalPrintableCount, totalSkippedCount } = useMemo(() => {
    const items: RenderLabelItem[] = [];
    let printable = 0;
    let skipped = 0;

    inStockProducts.forEach((prod) => {
      const isProductSelected = selectedProductIds.has(prod.id);
      const copies = copiesPerProduct[prod.id] ?? 1;

      for (let i = 0; i < copies; i++) {
        const itemKey = `${prod.id}-${i}`;
        const isSkipped = !isProductSelected || skippedLabels.has(itemKey);

        if (isSkipped) {
          skipped++;
        } else {
          printable++;
        }

        // Only include in sheet layout if it's either:
        // - active and not skipped, OR
        // - user chose to preserve blank spacers on sheet (so position is maintained)
        items.push({
          key: itemKey,
          product: prod,
          copyIndex: i,
          isSkipped,
        });
      }
    });

    return {
      allLabelItems: items,
      totalPrintableCount: printable,
      totalSkippedCount: skipped,
    };
  }, [inStockProducts, selectedProductIds, copiesPerProduct, skippedLabels]);

  // Toggle selection for a product
  const toggleProduct = (productId: number) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle skipping a specific label card (from preview)
  const toggleSkipLabel = (itemKey: string) => {
    setSkippedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  // Batch actions
  const handleIncludeAll = () => {
    setSelectedProductIds(new Set(inStockProducts.map((p) => p.id)));
    setSkippedLabels(new Set());
  };

  const handleSkipAll = () => {
    setSelectedProductIds(new Set());
    setSkippedLabels(new Set());
  };

  const handleSetAllCopies = (count: number) => {
    const safeCount = Math.max(1, count);
    const updated: Record<number, number> = {};
    inStockProducts.forEach((p) => {
      updated[p.id] = safeCount;
    });
    setCopiesPerProduct(updated);
  };

  const handlePrint = () => {
    printElement('printable-barcode-sheet');
  };

  // Format specifications
  const getGridColumnsClass = () => {
    switch (labelFormat) {
      case 'a4-24':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
      case 'a4-30':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
      case 'shelf-card':
        return 'grid-cols-1 sm:grid-cols-2';
      case 'thermal-roll':
        return 'grid-cols-1 max-w-sm mx-auto';
    }
  };

  const getLabelHeightStyle = () => {
    switch (labelFormat) {
      case 'a4-24':
        return 'min-h-[148px]';
      case 'a4-30':
        return 'min-h-[128px]';
      case 'shelf-card':
        return 'min-h-[175px]';
      case 'thermal-roll':
        return 'min-h-[135px]';
    }
  };

  // Sheet calculations (e.g. 24 labels per A4 page)
  const labelsPerPage = labelFormat === 'a4-30' ? 30 : labelFormat === 'a4-24' ? 24 : labelFormat === 'shelf-card' ? 8 : 1;
  const totalSheetsNeeded = Math.ceil((skipLeadingSlots + totalPrintableCount) / labelsPerPage) || 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col justify-between overflow-hidden">
      {/* Top Header Toolbar (Hidden when printing) */}
      <div className="print:hidden bg-slate-900 text-white px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Barcode className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Product Barcode & QR Sticker Printing Center
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Deganga CADPFSCS Ltd
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Select or skip any barcode sticker among many · Print standard A4 sticker sheets or thermal roll
            </p>
          </div>
        </div>

        {/* Live Status Badges & Print Button */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 font-medium">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Check className="w-3.5 h-3.5" />
              {totalPrintableCount} To Print
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-rose-400 font-bold">
              <Ban className="w-3.5 h-3.5" />
              {totalSkippedCount} Skipped
            </span>
            {labelFormat !== 'thermal-roll' && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300">
                  Est. {totalSheetsNeeded} {totalSheetsNeeded === 1 ? 'Sheet' : 'Sheets'}
                </span>
              </>
            )}
          </div>

          <button
            onClick={handlePrint}
            disabled={totalPrintableCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
            title="Send active barcodes to printer"
          >
            <Printer className="w-4 h-4" />
            <span>Print {totalPrintableCount} Labels</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Close Barcode Center (or press Esc key)"
          >
            <X className="w-4 h-4 text-rose-400 group-hover:text-white transition-colors" />
            <span>Close ✕</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Tabs & Quick Skip Actions (Hidden when printing) */}
      <div className="print:hidden bg-slate-800/95 border-b border-slate-700/80 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: View Tabs & Format Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-900/80 p-0.5 rounded-lg border border-slate-700 flex items-center">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'preview'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Sheet Preview & Click-to-Skip</span>
            </button>
            <button
              onClick={() => setActiveTab('selection')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'selection'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Product Selection List ({selectedProductIds.size}/{inStockProducts.length})</span>
            </button>
          </div>

          {/* Label Format Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Format:</span>
            <select
              value={labelFormat}
              onChange={(e) => setLabelFormat(e.target.value as LabelFormat)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="a4-24" className="bg-slate-900 text-white">
                A4 Sticker Sheet (24-up: 3x8)
              </option>
              <option value="a4-30" className="bg-slate-900 text-white">
                A4 Compact Sheet (30-up: 3x10)
              </option>
              <option value="shelf-card" className="bg-slate-900 text-white">
                Shelf Edge Tag (75x50mm with QR)
              </option>
              <option value="thermal-roll" className="bg-slate-900 text-white">
                Thermal Roll (50x25mm / 2x1")
              </option>
            </select>
          </div>
        </div>

        {/* Right: Quick Batch Skip Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-medium hidden md:inline">Batch Actions:</span>
          <button
            onClick={handleIncludeAll}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 font-semibold transition-colors flex items-center gap-1"
            title="Include all products for printing"
          >
            <CheckSquare className="w-3 h-3" />
            <span>Include All</span>
          </button>
          <button
            onClick={handleSkipAll}
            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 font-semibold transition-colors flex items-center gap-1"
            title="Skip all products (clear selection)"
          >
            <Ban className="w-3 h-3" />
            <span>Skip All</span>
          </button>

          {/* Copies count quick setter */}
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700 ml-1">
            <span className="text-slate-400 text-[11px]">Copies:</span>
            {[1, 2, 5].map((cnt) => (
              <button
                key={cnt}
                onClick={() => handleSetAllCopies(cnt)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
              >
                {cnt}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-y-auto bg-slate-900/40 p-3 sm:p-6 flex flex-col items-center">
        {/* Visual Settings Drawer / Options Pill */}
        <div className="print:hidden w-full max-w-6xl mb-4 bg-white/95 rounded-2xl p-4 shadow-sm border border-slate-200 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Customization checkboxes */}
            <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-emerald-600" />
                Sticker Elements:
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={show1DBarcode}
                  onChange={(e) => setShow1DBarcode(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                1D Linear Barcode
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={showQrCode}
                  onChange={(e) => setShowQrCode(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                QR Code
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={showSocietyHeader}
                  onChange={(e) => setShowSocietyHeader(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                Society Header
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                Base Price (Excl. GST)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium select-none">
                <input
                  type="checkbox"
                  checked={showBatchInfo}
                  onChange={(e) => setShowBatchInfo(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                Batch / SKU
              </label>
            </div>

            {/* Sticker Paper Reusing Controls (Skip Used Stickers) */}
            <div className="flex items-center gap-3 flex-wrap bg-slate-50 p-2 rounded-xl border border-slate-200">
              <label
                className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer"
                title="Leave empty space where stickers are skipped, allowing reuse of partially used A4 sticker sheets"
              >
                <input
                  type="checkbox"
                  checked={preserveBlankSpacers}
                  onChange={(e) => setPreserveBlankSpacers(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Preserve Blank Slot when Skipped</span>
              </label>

              {labelFormat.startsWith('a4') && (
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-300">
                  <span className="text-slate-600 font-medium" title="If first stickers on sheet are already peeled">
                    Skip first:
                  </span>
                  <div className="inline-flex items-center rounded border border-slate-300 bg-white">
                    <button
                      onClick={() => setSkipLeadingSlots((prev) => Math.max(0, prev - 1))}
                      className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      -
                    </button>
                    <span className="px-2 font-mono-code font-bold text-slate-800">
                      {skipLeadingSlots}
                    </span>
                    <button
                      onClick={() => setSkipLeadingSlots((prev) => Math.min(23, prev + 1))}
                      className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400">used slots</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TAB 1: Visual Sheet Preview (Interactive click-to-skip) */}
        {activeTab === 'preview' && (
          <div className="w-full max-w-6xl space-y-4">
            {/* Helpful Instruction Tip */}
            <div className="print:hidden bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Tip for skipping any print:</strong> Click the red <strong>"❌ Skip"</strong> button on top of any label card below to omit it from printing. If you have partially peeled A4 sticker paper, you can also keep the slot blank!
                </span>
              </div>
              <span className="text-[11px] font-mono-code bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-300 whitespace-nowrap">
                {totalPrintableCount} Active · {totalSkippedCount} Skipped
              </span>
            </div>

            {/* Printable Sheet Canvas Container */}
            <div
              id="printable-barcode-sheet"
              className="bg-white p-4 sm:p-8 rounded-2xl shadow-xl border border-slate-300 min-h-[600px] w-full"
            >
              {/* Sheet header when printed */}
              <div className="hidden print:block text-center border-b border-black pb-2 mb-4">
                <div className="text-xs font-bold uppercase tracking-wider">{society.name}</div>
                <div className="text-[10px] text-gray-600">{society.address} · Product Barcode Labels</div>
              </div>

              {/* Grid of stickers */}
              <div className={`grid gap-3 ${getGridColumnsClass()}`}>
                {/* Pre-skipped empty slots (if user has already peeled leading stickers on paper) */}
                {Array.from({ length: skipLeadingSlots }).map((_, idx) => (
                  <div
                    key={`offset-${idx}`}
                    className={`border border-dashed border-slate-300 rounded-xl p-3 flex flex-col items-center justify-center text-center text-slate-400 bg-slate-50/70 print:border-transparent print:bg-transparent ${getLabelHeightStyle()}`}
                  >
                    <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider print:hidden">
                      Blank Slot #{idx + 1}
                    </span>
                    <span className="text-[9px] text-slate-400 print:hidden">(Already peeled / used)</span>
                  </div>
                ))}

                {/* All Generated Labels */}
                {allLabelItems.map((item) => {
                  const { product, copyIndex, isSkipped, key } = item;

                  // If user does not want blank spacers and item is skipped, do not render in DOM
                  if (isSkipped && !preserveBlankSpacers) {
                    return null;
                  }

                  // If skipped and blank spacers is enabled: render a blank placeholder
                  if (isSkipped) {
                    return (
                      <div
                        key={key}
                        className={`group relative border border-dashed border-rose-300 rounded-xl p-3 flex flex-col items-center justify-center text-center bg-rose-50/40 hover:bg-rose-50/70 transition-colors print:border-transparent print:bg-transparent ${getLabelHeightStyle()}`}
                      >
                        <div className="print:hidden flex flex-col items-center gap-1 text-rose-500">
                          <Ban className="w-5 h-5 opacity-70" />
                          <span className="text-xs font-bold">SKIPPED: {product.name}</span>
                          <span className="text-[10px] text-slate-500">
                            {product.barcode} (Copy #{copyIndex + 1})
                          </span>
                          <button
                            onClick={() => toggleSkipLabel(key)}
                            className="mt-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore / Print This</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const displayBarcode = product.barcode;
                  const stickerPrice = getExGstSellingPrice(product);
                  const priceSuffix = `/${product.unit}`;

                  // Active / Printable Label Card
                  return (
                    <div
                      key={key}
                      className={`relative bg-white border border-slate-900 rounded-xl p-2.5 flex flex-col justify-between text-center overflow-hidden transition-all group hover:shadow-md print:border-black print:rounded-none ${getLabelHeightStyle()}`}
                    >
                      {/* Top interactive hover bar: Instant Skip Button (Hidden in Print) */}
                      <div className="print:hidden absolute top-1 right-1 opacity-80 group-hover:opacity-100 flex items-center gap-1 z-10">
                        <button
                          onClick={() => toggleSkipLabel(key)}
                          className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-0.5 shadow transition-all"
                          title="Skip printing this specific label"
                        >
                          <X className="w-3 h-3" />
                          <span>Skip</span>
                        </button>
                      </div>

                      {/* Header: Society Name & Loose Badge */}
                      {showSocietyHeader && (
                        <div className="border-b border-dashed border-slate-300 pb-0.5 mb-1 flex items-center justify-between text-[9px] font-bold tracking-tight text-slate-700 uppercase">
                          <span className="truncate">{society.name}</span>
                          <span className="text-[8px] text-slate-500 font-mono-code ml-1 shrink-0">
                            ID: {product.id}
                          </span>
                        </div>
                      )}

                      {/* Product Name & Category & Net Wt Tag */}
                      <div className="space-y-0.5 my-auto">
                        <div className="font-extrabold text-xs sm:text-[13px] text-slate-900 leading-tight line-clamp-1">
                          {product.name}
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium">
                          {product.category}
                        </div>
                      </div>

                      {/* Barcode & QR Body */}
                      <div className="my-1 flex items-center justify-center gap-2">
                        {/* 1D Linear Barcode */}
                        {show1DBarcode && (
                          <div className="flex-1 overflow-hidden">
                            <BarcodeSvg
                              value={displayBarcode}
                              height={labelFormat === 'a4-30' ? 28 : 34}
                              width={labelFormat === 'a4-30' ? 1.2 : 1.35}
                              fontSize={10}
                            />
                          </div>
                        )}

                        {/* 2D QR Code */}
                        {showQrCode && qrCodeDataUrls[product.barcode] && (
                          <div className="shrink-0 p-0.5 bg-white border border-slate-200 rounded">
                            <img
                              src={qrCodeDataUrls[product.barcode]}
                              alt={displayBarcode}
                              className={
                                labelFormat === 'shelf-card'
                                  ? 'w-16 h-16 object-contain'
                                  : 'w-10 h-10 object-contain'
                              }
                            />
                          </div>
                        )}
                      </div>

                      {/* Footer: Price, Batch, Unit */}
                      <div className="pt-1 border-t border-dashed border-slate-300 flex items-center justify-between text-slate-900">
                        {showPrice && (
                          <div className="font-black text-xs font-mono-code">
                            ₹{stickerPrice.toFixed(2)}
                            <span className="text-[9px] font-normal text-slate-600">
                              {priceSuffix}
                            </span>
                          </div>
                        )}

                        {showBatchInfo && (
                          <div className="text-[8px] font-mono-code text-slate-500">
                            Batch: {product.batchNo}
                          </div>
                        )}

                        <div className="text-[8px] font-mono-code text-emerald-800 font-bold bg-emerald-50 px-1 py-0.2 rounded print:hidden">
                          Stock: {product.stock} {product.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty state if no in-stock products or everything is skipped */}
              {totalPrintableCount === 0 && (
                <div className="py-16 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">
                    {inStockProducts.length === 0
                      ? 'No In-Stock Product Barcodes Available'
                      : 'All Product Barcodes are Currently Skipped'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {inStockProducts.length === 0
                      ? 'Products with zero quantity (0 stock) are hidden from barcode printing. Restock products in Inventory to print their labels.'
                      : 'You have skipped all items or unchecked the product catalog. Click below to restore all in-stock products or pick specific items from the selection tab.'}
                  </p>
                  {inStockProducts.length > 0 && (
                    <button
                      onClick={handleIncludeAll}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Include All Products</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Product Selection Table & Granular Skip Settings */}
        {activeTab === 'selection' && (
          <div className="w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden text-xs">
            {/* Filter toolbar inside selection tab */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search SKU, name, or barcode..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                <span className="text-slate-500 font-medium">Category:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold focus:outline-none"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setActiveTab('preview')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold ml-auto flex items-center gap-1"
                >
                  <span>View Print Preview</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Product selection list table */}
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Print</th>
                    <th className="py-3 px-4">Product Details</th>
                    <th className="py-3 px-4">Barcode / SKU</th>
                    <th className="py-3 px-4 text-right">Base Price (Excl. GST)</th>
                    <th className="py-3 px-4 text-center">Current Stock</th>
                    <th className="py-3 px-4 text-center">Sticker Copies</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p.id);
                    const copies = copiesPerProduct[p.id] ?? 1;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          !isSelected ? 'bg-slate-50/60 opacity-60' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProduct(p.id)}
                            className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>

                        {/* Name & Category */}
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900 text-xs">{p.name}</div>
                          <div className="text-[10px] text-slate-500">{p.category}</div>
                        </td>

                        {/* Barcode */}
                        <td className="py-3 px-4">
                          <span className="font-mono-code font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {p.barcode}
                          </span>
                        </td>

                        {/* Base Price (Excl. GST) */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono-code">
                          ₹{getExGstSellingPrice(p).toFixed(2)}
                          <span className="text-[10px] text-slate-500 font-normal"> /{p.unit}</span>
                        </td>

                        {/* Stock */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                              p.stock <= 0
                                ? 'bg-rose-100 text-rose-700 font-bold'
                                : p.stock <= p.minStockLevel
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {p.stock} {p.unit}
                          </span>
                        </td>

                        {/* Copies count stepper */}
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                            <button
                              onClick={() => {
                                const next = Math.max(0, copies - 1);
                                setCopiesPerProduct((prev) => ({ ...prev, [p.id]: next }));
                                if (next === 0 && isSelected) {
                                  toggleProduct(p.id); // Set to 0 auto-skips
                                }
                              }}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold"
                              title="Decrease copies"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-bold font-mono-code text-slate-900">
                              {copies}
                            </span>
                            <button
                              onClick={() => {
                                const next = copies + 1;
                                setCopiesPerProduct((prev) => ({ ...prev, [p.id]: next }));
                                if (!isSelected) {
                                  toggleProduct(p.id); // Adding copies re-includes
                                }
                              }}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold"
                              title="Increase copies"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Action status */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggleProduct(p.id)}
                            className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                              isSelected
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800'
                                : 'bg-rose-100 text-rose-800 hover:bg-emerald-100 hover:text-emerald-800'
                            }`}
                          >
                            {isSelected ? '✓ Included' : '⊘ Skipped'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Footer (Hidden when printing) */}
      <div className="print:hidden bg-slate-900 text-white px-4 sm:px-6 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            Selected: <strong className="text-white font-mono-code">{selectedProductIds.size}</strong> of{' '}
            {inStockProducts.length} In-Stock Products
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400">
            Total Labels to Print:{' '}
            <strong className="text-emerald-400 font-mono-code">{totalPrintableCount}</strong>
          </span>
          {totalSkippedCount > 0 && (
            <span className="text-rose-400 font-semibold font-mono-code">
              ({totalSkippedCount} skipped)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
          >
            Cancel / Close
          </button>
          <button
            onClick={handlePrint}
            disabled={totalPrintableCount === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            <Printer className="w-4 h-4" />
            <span>Print {totalPrintableCount} Barcodes Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
