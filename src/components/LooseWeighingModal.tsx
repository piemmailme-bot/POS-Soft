import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Scale,
  X,
  Printer,
  PlusCircle,
  Search,
  CheckCircle2,
  Tag,
  Package,
  Info,
  Layers,
  AlertTriangle,
  Trash2,
  CheckSquare,
  Square,
  BookmarkPlus
} from 'lucide-react';
import { Product, SocietyProfile, LoosePacket } from '../types';
import { api } from '../utils/api';
import {
  getStoredLoosePackets,
  saveLoosePackets,
  generateUniqueLooseBarcode,
  isBarcodeDuplicate,
  formatQuantityWithSubunit
} from '../utils/looseBarcode';
import { printElement } from '../utils/print';
import { getIstDateTimeStr } from '../utils/dateUtils';
import { BarcodeSticker, BarcodePrintSheet } from './BarcodeSticker';

interface LooseWeighingModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  society: SocietyProfile;
  onAddToCart?: (product: Product, quantityInBaseUnit: number, packetBarcode?: string) => void;
  loosePackets?: LoosePacket[];
  setLoosePackets?: React.Dispatch<React.SetStateAction<LoosePacket[]>>;
}

export const LooseWeighingModal: React.FC<LooseWeighingModalProps> = ({
  isOpen,
  onClose,
  products,
  society,
  onAddToCart,
  loosePackets: propLoosePackets,
  setLoosePackets: propSetLoosePackets,
}) => {
  // Local state for registered loose packets if props not supplied
  const [localPackets, setLocalPackets] = useState<LoosePacket[]>(() => getStoredLoosePackets());
  const packets = propLoosePackets || localPackets;

  const updatePackets = (updater: (prev: LoosePacket[]) => LoosePacket[]) => {
    if (propSetLoosePackets) {
      propSetLoosePackets(updater);
    } else {
      setLocalPackets((prev) => {
        const next = updater(prev);
        saveLoosePackets(next);
        return next;
      });
    }
  };

  // Active view tab inside modal
  const [activeModalTab, setActiveModalTab] = useState<'weigh' | 'registry'>('weigh');

  // Filterable product list (prefer items sold in KG, LTR, GM, ML)
  const looseProducts = products.filter(
    (p) => ['KG', 'LTR', 'GM', 'ML'].includes(p.unit) || p.stock > 0
  );

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [registrySearchQuery, setRegistrySearchQuery] = useState<string>('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState<'ALL' | 'UNSOLD' | 'SOLD'>('ALL');
  const [weightInputGrams, setWeightInputGrams] = useState<number>(0);
  const [weightInputText, setWeightInputText] = useState<string>('0');
  const [packetQuantity, setPacketQuantity] = useState<number>(1);
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('');
  const [addedSuccessMsg, setAddedSuccessMsg] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Print prompt modal state ("Print Now" vs "Print Later")
  const [showPrintPrompt, setShowPrintPrompt] = useState<boolean>(false);
  const [pendingSavedPacket, setPendingSavedPacket] = useState<LoosePacket | null>(null);
  const [packetsToPrint, setPacketsToPrint] = useState<LoosePacket[]>([]);

  // Multiple selection state in registry tab
  const [selectedRegistryIds, setSelectedRegistryIds] = useState<Set<string>>(new Set());

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Reset all options to clean defaults whenever the window opens
  useEffect(() => {
    if (isOpen) {
      setActiveModalTab('weigh');
      setSelectedProductId(null);
      setProductSearchQuery('');
      setRegistrySearchQuery('');
      setRegistryStatusFilter('ALL');
      setWeightInputGrams(0);
      setWeightInputText('0');
      setPacketQuantity(1);
      setGeneratedBarcode('');
      setAddedSuccessMsg(null);
      setDuplicateWarning(null);
      setShowPrintPrompt(false);
      setPendingSavedPacket(null);
      setPacketsToPrint([]);
      setSelectedRegistryIds(new Set());
    }
  }, [isOpen]);

  const selectedProduct =
    selectedProductId !== null ? products.find((p) => p.id === selectedProductId) || null : null;

  // Auto-generate unique barcode whenever selected product or weight changes
  useEffect(() => {
    if (selectedProduct && weightInputGrams > 0) {
      const uniqueCode = generateUniqueLooseBarcode(
        selectedProduct,
        weightInputGrams,
        packets,
        products
      );
      setGeneratedBarcode(uniqueCode);
      setDuplicateWarning(null);
    } else {
      setGeneratedBarcode('');
    }
  }, [selectedProductId, weightInputGrams, packets, products, selectedProduct]);

  // Calculate package details
  const calculatePackage = () => {
    if (!selectedProduct || weightInputGrams <= 0) {
      return {
        qtyInBase: 0,
        netText: '0',
        price: 0,
        effectiveUnitPrice: 0,
      };
    }

    const unit = selectedProduct.unit;
    let qtyInBase = 0;
    let netText = `${weightInputGrams} GM`;

    if (unit === 'KG') {
      qtyInBase = weightInputGrams / 1000;
      netText = weightInputGrams >= 1000 ? `${qtyInBase} KG` : `${weightInputGrams} GM`;
    } else if (unit === 'LTR') {
      qtyInBase = weightInputGrams / 1000;
      netText = weightInputGrams >= 1000 ? `${qtyInBase} LTR` : `${weightInputGrams} ML`;
    } else if (unit === 'GM') {
      qtyInBase = weightInputGrams;
      netText = `${weightInputGrams} GM`;
    } else if (unit === 'ML') {
      qtyInBase = weightInputGrams;
      netText = `${weightInputGrams} ML`;
    } else {
      qtyInBase = weightInputGrams;
      netText = `${weightInputGrams} ${unit}`;
    }

    const effectiveUnitPrice = (selectedProduct.sellingPriceWithGst && selectedProduct.sellingPriceWithGst > 0)
      ? selectedProduct.sellingPriceWithGst
      : selectedProduct.sellingPrice;
    const calcPrice = effectiveUnitPrice * qtyInBase;

    return {
      qtyInBase,
      netText,
      price: calcPrice,
      effectiveUnitPrice,
    };
  };

  const packageInfo = calculatePackage();

  // Render Barcode SVG in Weigh Station
  useEffect(() => {
    if (isOpen && svgRef.current && generatedBarcode) {
      try {
        JsBarcode(svgRef.current, generatedBarcode, {
          format: 'CODE128',
          width: 1.35,
          height: 38,
          displayValue: true,
          fontSize: 10,
          margin: 1,
          lineColor: '#000000',
        });
      } catch (err) {
        console.warn('Loose barcode SVG render error:', err);
      }
    }
  }, [isOpen, generatedBarcode, activeModalTab]);

  // Step 1: Click "SAVE & Proceed"
  const handleSaveAndProceedClick = () => {
    if (!selectedProduct || weightInputGrams <= 0) return;

    const newPackets: LoosePacket[] = [];
    let currentPacketsList = [...packets];

    for (let i = 0; i < packetQuantity; i++) {
      const uniqueCode = generateUniqueLooseBarcode(
        selectedProduct,
        weightInputGrams,
        currentPacketsList,
        products
      );

      const now = new Date();
      now.setMilliseconds(now.getMilliseconds() + i);
      const dateFormatted = getIstDateTimeStr(now);

      const newPacket: LoosePacket = {
        id: `pack-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        baseBarcode: selectedProduct.barcode,
        uniqueBarcode: uniqueCode,
        measuredGramsOrMl: weightInputGrams,
        weightText: packageInfo.netText,
        quantityInBaseUnit: packageInfo.qtyInBase,
        unitPrice: packageInfo.effectiveUnitPrice ?? selectedProduct.sellingPrice,
        calculatedPrice: packageInfo.price,
        unit: selectedProduct.unit,
        createdAt: dateFormatted,
        status: 'UNSOLD',
      };

      newPackets.push(newPacket);
      currentPacketsList = [newPacket, ...currentPacketsList];
    }

    // Save all to registry immediately and sync to MySQL server
    updatePackets((prev) => [...newPackets, ...prev]);
    api
      .post('/loose-packets', newPackets)
      .then(() => {
        setPendingSavedPacket(newPackets[0]);
        setShowPrintPrompt(true); // Ask user Print Now vs Later
      })
      .catch((err) => {
        console.error('Loose packet batch API error:', err);
        setDuplicateWarning('Failed to save barcode to database. Please check connection and try again.');
        setTimeout(() => setDuplicateWarning(null), 5000);
      });
  };

  const handlePrintChoice = (choice: 'now' | 'later') => {
    setShowPrintPrompt(false);
    setAddedSuccessMsg(
      `Successfully saved packet(s) to Printed Packets Registry!`
    );
    setTimeout(() => setAddedSuccessMsg(null), 4000);

    if (choice === 'now' && pendingSavedPacket) {
      setPacketsToPrint([pendingSavedPacket]);
      setTimeout(() => {
        printElement('printable-barcode-sheet');
        setPacketsToPrint([]);
      }, 150);
    }

    // Reset current form input and clear existing record from window to get ready for brand new entry
    setPendingSavedPacket(null);
    setSelectedProductId(null);
    setWeightInputGrams(0);
    setWeightInputText('0');
    setPacketQuantity(1);
    setGeneratedBarcode('');
  };

  const handlePrintSinglePacket = (pk: LoosePacket) => {
    setPacketsToPrint([pk]);
    setTimeout(() => {
      printElement('printable-barcode-sheet');
      setPacketsToPrint([]);
    }, 150);
  };

  const handlePrintSelectedPackets = () => {
    if (selectedRegistryIds.size === 0) return;
    const selectedPackets = packets.filter(p => selectedRegistryIds.has(p.id));
    if (selectedPackets.length === 0) return;
    
    setPacketsToPrint(selectedPackets);
    setTimeout(() => {
      printElement('printable-barcode-sheet');
      setPacketsToPrint([]);
    }, 150);
  };

  const handleToggleSelectAll = () => {
    if (selectedRegistryIds.size === filteredRegistry.length) {
      setSelectedRegistryIds(new Set());
    } else {
      setSelectedRegistryIds(new Set(filteredRegistry.map((pk) => pk.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedRegistryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToBillNow = () => {
    if (onAddToCart && selectedProduct) {
      if (!packets.some((pk) => pk.uniqueBarcode === generatedBarcode)) {
        const now = new Date();
        const dateFormatted = getIstDateTimeStr(now);
        const newPacket: LoosePacket = {
          id: `pack-${Date.now()}`,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          baseBarcode: selectedProduct.barcode,
          uniqueBarcode: generatedBarcode,
          measuredGramsOrMl: weightInputGrams,
          weightText: packageInfo.netText,
          quantityInBaseUnit: packageInfo.qtyInBase,
          unitPrice: packageInfo.effectiveUnitPrice ?? selectedProduct.sellingPrice,
          calculatedPrice: packageInfo.price,
          unit: selectedProduct.unit,
          createdAt: dateFormatted,
          status: 'UNSOLD',
        };
        updatePackets((prev) => [newPacket, ...prev]);
        api.post('/loose-packets', newPacket).catch((err) => console.warn('Loose packet API notice:', err));
      }

      onAddToCart(selectedProduct, packageInfo.qtyInBase, generatedBarcode);
      setAddedSuccessMsg(`Added ${packageInfo.netText} (${selectedProduct.name}) to active POS bill!`);
      setTimeout(() => setAddedSuccessMsg(null), 3000);
    }
  };

  const handleDeletePacket = (packetId: string) => {
    updatePackets((prev) => prev.filter((p) => p.id !== packetId));
    api.delete(`/loose-packets/${packetId}`).catch((err) => console.warn('Loose packet delete notice:', err));
    setSelectedRegistryIds((prev) => {
      const next = new Set(prev);
      next.delete(packetId);
      return next;
    });
  };

  const filteredCatalog = looseProducts.filter((p) => {
    const q = (productSearchQuery || '').toLowerCase().trim();
    return (
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.barcode || '').includes(q)
    );
  });

  const filteredRegistry = packets.filter((pk) => {
    const matchesStatus =
      registryStatusFilter === 'ALL' || pk.status === registryStatusFilter;
    const q = (registrySearchQuery || '').toLowerCase().trim();
    const matchesQuery =
      !q ||
      (pk.productName || '').toLowerCase().includes(q) ||
      (pk.uniqueBarcode || '').toLowerCase().includes(q) ||
      (pk.weightText || '').toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const unsoldPacketsCount = packets.filter((p) => p.status === 'UNSOLD').length;
  const soldPacketsCount = packets.filter((p) => p.status === 'SOLD').length;

  if (!isOpen) return null;

  return (
    <>
      <div className="hidden">
        {packetsToPrint.length > 0 && (
          <BarcodePrintSheet 
            id="printable-barcode-sheet" 
            packets={packetsToPrint} 
            societyName={society.name} 
          />
        )}
      </div>
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header Bar */}
          <div className="print:hidden px-6 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Scale className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base leading-tight">
                  Loose Item Weighing & Package Barcode Registry
                </h3>
                <p className="text-xs text-slate-400">
                  Measure loose weights · Save & Proceed · Multiple item printing · Stock deducted ONLY upon checkout sale
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Tabs */}
              <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('weigh')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    activeModalTab === 'weigh'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Scale & Measure</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('registry')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                    activeModalTab === 'registry'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Printed Packets Registry ({unsoldPacketsCount} Unsold)</span>
                </button>
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
          </div>

          {/* TAB 1: WEIGH, MEASURE & SAVE */}
          {activeModalTab === 'weigh' && (
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: PRODUCT SELECTOR & SCALE INPUT */}
              <div className="print:hidden lg:col-span-7 space-y-4">
                {addedSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center gap-2 animate-fadeIn shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{addedSuccessMsg}</span>
                  </div>
                )}

                {duplicateWarning && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}

                {/* Product Selector Bar */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    1. Select Inventory Stock Product to Measure:
                  </label>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      placeholder="Search loose items by name, barcode, or category..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  {/* Product Pick Grid */}
                  <div className="max-h-44 overflow-y-auto pr-1 space-y-1.5 border-t border-slate-200 pt-2">
                    {filteredCatalog.map((p) => {
                      const isSelected = p.id === selectedProductId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProductId(p.id)}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/30'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono-code">
                              {p.category} · Base Code: {p.barcode}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-xs text-emerald-800 font-mono-code">
                              ₹{p.sellingPrice.toFixed(2)}/{p.unit}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              Stock: {p.stock} {p.unit}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Weighing & Scale Calculator */}
                <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-amber-600" />
                      2. Enter Measured Scale Quantity:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono-code font-bold bg-amber-200/80 px-2 py-0.5 rounded text-amber-950">
                        {selectedProduct
                          ? `Rate: ₹${selectedProduct.sellingPrice.toFixed(2)} / ${selectedProduct.unit}`
                          : 'Select a product above'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId(null);
                          setProductSearchQuery('');
                          setWeightInputGrams(0);
                          setWeightInputText('0');
                          setPacketQuantity(1);
                          setGeneratedBarcode('');
                        }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer"
                        title="Reset all options to default 0"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Quick Weight Presets */}
                  <div className="grid grid-cols-5 gap-1.5 text-xs">
                    {[50, 100, 250, 500, 1000].map((gram) => (
                      <button
                        key={gram}
                        type="button"
                        disabled={!selectedProduct}
                        onClick={() => {
                          setWeightInputGrams(gram);
                          setWeightInputText(String(gram));
                        }}
                        className={`py-2 px-1 rounded-xl border font-mono-code font-bold text-center transition-all ${
                          !selectedProduct
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : weightInputGrams === gram
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm cursor-pointer'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 cursor-pointer'
                        }`}
                      >
                        {gram >= 1000 ? '1 KG / L' : `${gram} GM/ML`}
                      </button>
                    ))}
                  </div>

                  {/* Numerical Grams / ML Input */}
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-300">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-500 block">
                        Measured Scale Amount ({selectedProduct && (selectedProduct.unit === 'LTR' || selectedProduct.unit === 'ML') ? 'ML' : 'Grams'}):
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={weightInputText}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setWeightInputText(raw);
                          const parsed = parseFloat(raw);
                          setWeightInputGrams(!Number.isNaN(parsed) && parsed > 0 ? parsed : 0);
                        }}
                        onBlur={() => {
                          if (!weightInputText.trim() || Number.isNaN(parseFloat(weightInputText))) {
                            setWeightInputText('0');
                            setWeightInputGrams(0);
                          }
                        }}
                        className="w-full text-lg font-extrabold font-mono-code text-slate-900 focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div className="text-right border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">
                        Calculated Package Price:
                      </span>
                      <span className="text-xl font-black text-emerald-700 font-mono-code">
                        ₹{packageInfo.price.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Number of Packets (Quantity) Input */}
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-300">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">
                        Number of Packets (Barcodes):
                      </label>
                      <span className="text-[11px] text-slate-400">Default 1. Increase to generate multiple stickers at once</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPacketQuantity((q) => Math.max(1, q - 1))}
                        className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg flex items-center justify-center text-xs"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={packetQuantity}
                        onChange={(e) =>
                          setPacketQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-12 text-center text-sm font-extrabold font-mono-code bg-slate-50 border border-slate-300 rounded-lg py-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPacketQuantity((q) => Math.min(50, q + 1))}
                        className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Explicit Inventory Stock Guarantee Note */}
                  <div className="bg-amber-100/70 border border-amber-300 p-2.5 rounded-xl text-[11px] text-amber-950 font-mono-code space-y-1">
                    <div className="font-bold flex items-center gap-1 text-amber-900">
                      <Info className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                      <span>Stock Deduction Policy:</span>
                    </div>
                    <p className="text-[10px] text-amber-900/90 leading-tight">
                      {selectedProduct ? (
                        <>
                          Current Inventory Stock: <strong>{selectedProduct.stock} {selectedProduct.unit}</strong>.{' '}
                        </>
                      ) : (
                        <>Select an inventory product above to view live stock. </>
                      )}
                      Stock remains <strong>UNTOUCHED</strong> when saving to the registry. Stock will be subtracted <strong>ONLY</strong> when scanned and sold at POS checkout payment completion!
                    </p>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: PREVIEW & SAVE & PROCEED BUTTON */}
              <div className="lg:col-span-5 flex flex-col items-center justify-between h-full space-y-4">
                <div className="w-full text-center space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    Package Barcode Sticker Preview
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Unique Code: <strong className="font-mono-code text-slate-800">{generatedBarcode || '---'}</strong>
                  </p>
                </div>

                {/* Printable Sticker Card or Ready for New Entry Placeholder */}
                {!selectedProduct || weightInputGrams <= 0 ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3 w-full max-w-xs my-auto">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
                      <Scale className="w-6 h-6" />
                    </div>
                    <div className="font-extrabold text-slate-900 text-sm">Ready for New Entry</div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {!selectedProduct
                        ? 'Select a product from the list and enter weight or volume to generate a package barcode sticker.'
                        : 'Enter weight or volume on the left to measure and generate a fresh package barcode sticker.'}
                    </p>
                  </div>
                ) : (
                  <BarcodeSticker 
                    id="printable-barcode-sheet"
                    packet={{
                      id: 'temp',
                      productId: selectedProduct.id,
                      productName: selectedProduct.name,
                      baseBarcode: selectedProduct.barcode,
                      uniqueBarcode: generatedBarcode,
                      measuredGramsOrMl: weightInputGrams,
                      weightText: packageInfo.netText,
                      quantityInBaseUnit: packageInfo.qtyInBase,
                      unitPrice: packageInfo.effectiveUnitPrice ?? selectedProduct.sellingPrice,
                      calculatedPrice: packageInfo.price,
                      unit: selectedProduct.unit,
                      createdAt: new Date().toISOString(),
                      status: 'UNSOLD',
                    }} 
                    societyName={society.name} 
                  />
                )}

                {/* Action Buttons */}
                <div className="print:hidden w-full space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveAndProceedClick}
                    disabled={!selectedProduct || weightInputGrams <= 0}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                      !selectedProduct || weightInputGrams <= 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/30 hover:scale-[1.01]'
                    }`}
                  >
                    <BookmarkPlus className="w-4 h-4 text-emerald-200" />
                    <span>SAVE & Proceed</span>
                  </button>

                  {onAddToCart && (
                    <button
                      type="button"
                      onClick={handleAddToBillNow}
                      disabled={!selectedProduct || weightInputGrams <= 0}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                        !selectedProduct || weightInputGrams <= 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-900 hover:bg-slate-800 text-white shadow'
                      }`}
                    >
                      <PlusCircle className="w-4 h-4 text-emerald-400" />
                      <span>Add Directly to Active POS Bill</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRINTED LOOSE PACKETS REGISTRY & MULTI-SELECT PRINT */}
          {activeModalTab === 'registry' && (
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Search & Filter */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={registrySearchQuery}
                    onChange={(e) => setRegistrySearchQuery(e.target.value)}
                    placeholder="Search registered packages by unique barcode or name..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRegistryIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handlePrintSelectedPackets}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Selected ({selectedRegistryIds.size})</span>
                    </button>
                  )}

                  <span className="text-slate-500 font-semibold">Status:</span>
                  <div className="bg-white border border-slate-300 rounded-xl p-0.5 flex items-center">
                    {(['ALL', 'UNSOLD', 'SOLD'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setRegistryStatusFilter(st)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                          registryStatusFilter === st
                            ? 'bg-slate-900 text-white shadow'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st === 'ALL'
                          ? `All (${packets.length})`
                          : st === 'UNSOLD'
                          ? `Unsold (${unsoldPacketsCount})`
                          : `Sold (${soldPacketsCount})`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Registry List Table with Checkboxes */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm text-xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 w-12 text-center">
                          <button
                            type="button"
                            onClick={handleToggleSelectAll}
                            className="text-slate-600 hover:text-slate-900 font-bold"
                            title="Select All"
                          >
                            {selectedRegistryIds.size === filteredRegistry.length && filteredRegistry.length > 0 ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600 inline" />
                            ) : (
                              <Square className="w-4 h-4 inline" />
                            )}
                          </button>
                        </th>
                        <th className="py-3 px-4">Unique Package Barcode</th>
                        <th className="py-3 px-4">Product Name</th>
                        <th className="py-3 px-4 text-center">Net Weight / Vol</th>
                        <th className="py-3 px-4 text-right">Pack Price</th>
                        <th className="py-3 px-4 text-center">Created On</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRegistry.map((pk) => {
                        const isSold = pk.status === 'SOLD';
                        const isChecked = selectedRegistryIds.has(pk.id);
                        return (
                          <tr
                            key={pk.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              isSold ? 'bg-slate-50/70 text-slate-500' : ''
                            }`}
                          >
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectOne(pk.id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                              />
                            </td>
                            <td className="py-3 px-4 font-mono-code font-bold text-slate-900">
                              {pk.uniqueBarcode}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-extrabold text-slate-900">{pk.productName}</div>
                              <div className="text-[10px] text-slate-500 font-mono-code">
                                Base Code: {pk.baseBarcode}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-mono-code font-bold">
                              <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                {pk.weightText}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold font-mono-code text-slate-900">
                              ₹{pk.calculatedPrice.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center text-[10px] font-mono-code text-slate-500">
                              {pk.createdAt}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold font-mono-code ${
                                  isSold
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {isSold ? `✓ SOLD (${pk.soldAtInvoiceNo || 'POS'})` : '● UNSOLD (IN STOCK)'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handlePrintSinglePacket(pk)}
                                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 shadow-xs"
                                title="Print this packet barcode label"
                              >
                                <Printer className="w-3 h-3 text-emerald-400" />
                                <span>Print</span>
                              </button>

                              {!isSold && (
                                <button
                                  type="button"
                                  onClick={() => handleDeletePacket(pk.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors inline-block"
                                  title="Delete Unsold Sticker Record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredRegistry.length === 0 && (
                  <div className="p-12 text-center text-slate-400 space-y-2">
                    <Package className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-slate-700 text-xs">No registered loose packets found</p>
                    <p className="text-[11px] text-slate-500">
                      Switch to the Scale & Measure tab to weigh and register loose packet barcode stickers.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PRINT PROMPT MODAL ("Print Now" vs "Print Later") */}
          {showPrintPrompt && (
            <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4 animate-fadeIn">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">Package Saved Successfully!</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Unique Code: <strong className="font-mono-code text-slate-800">{pendingSavedPacket?.uniqueBarcode}</strong>
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    Would you like to send this barcode sticker to the printer now or print later from the registry?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePrintChoice('later')}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    Print Later
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintChoice('now')}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Now</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Info */}
          <div className="print:hidden px-6 py-2.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              Click SAVE & Proceed to store packets. Print individually or select multiple items for batch printing!
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
