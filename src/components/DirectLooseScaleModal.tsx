import React, { useEffect, useState } from 'react';
import {
  Scale,
  X,
  Search,
  CheckCircle2,
  PlusCircle,
  RotateCcw,
  Info
} from 'lucide-react';
import { Product } from '../types';
import { playScannerBeep } from '../utils/audio';

interface DirectLooseScaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddToCart: (
    product: Product,
    quantityInBaseUnit: number,
    packetBarcode?: string,
    barcodeMode?: 'WITH_BARCODE' | 'WITHOUT_BARCODE',
    measuredWeightText?: string
  ) => void;
  initialProductId?: number;
}

export const DirectLooseScaleModal: React.FC<DirectLooseScaleModalProps> = ({
  isOpen,
  onClose,
  products,
  onAddToCart,
  initialProductId,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [weightInput, setWeightInput] = useState<string>('0');
  const [weightUnitMode, setWeightUnitMode] = useState<'GM' | 'KG' | 'ML' | 'LTR'>('GM');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleReset = () => {
    setSelectedProductId(null);
    setSearchQuery('');
    setWeightInput('0');
    setWeightUnitMode('GM');
    setSuccessMessage(null);
  };

  // Always start clean on open: no preselected preset, weight at 0, and no preselected product unless explicitly launched from a product card
  useEffect(() => {
    if (isOpen) {
      setSelectedProductId(initialProductId ?? null);
      setSearchQuery('');
      setWeightInput('0');
      setWeightUnitMode('GM');
      setSuccessMessage(null);
    }
  }, [isOpen, initialProductId]);

  const selectedProduct =
    selectedProductId !== null
      ? products.find((p) => p.id === selectedProductId && Number(p.stock) > 0) || null
      : null;

  if (!isOpen) return null;

  const parsedWeight = parseFloat(weightInput);
  const weightValue = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 0;

  // Rate WT GST
  const unitRate = selectedProduct
    ? selectedProduct.sellingPriceWithGst && selectedProduct.sellingPriceWithGst > 0
      ? selectedProduct.sellingPriceWithGst
      : selectedProduct.sellingPrice
    : 0;

  // Calculate quantity in product's base unit (e.g. if product.unit is KG and user entered 250 GM => 0.25 KG)
  const calculateQuantities = () => {
    let qtyInBaseUnit = 0;
    let displayWeightText = '0';

    if (!selectedProduct) {
      if (weightValue > 0) {
        displayWeightText =
          weightUnitMode === 'KG'
            ? `${weightValue.toFixed(3)} KG`
            : `${weightValue} GM`;
      }
      return {
        qtyInBaseUnit: 0,
        displayWeightText,
        calculatedPrice: 0,
      };
    }

    const pUnit = selectedProduct.unit;

    if (weightValue <= 0) {
      return {
        qtyInBaseUnit: 0,
        displayWeightText: '0',
        calculatedPrice: 0,
      };
    }

    if (pUnit === 'KG') {
      if (weightUnitMode === 'KG') {
        qtyInBaseUnit = weightValue;
        displayWeightText = `${weightValue.toFixed(3)} KG`;
      } else {
        qtyInBaseUnit = weightValue / 1000;
        displayWeightText =
          weightValue >= 1000
            ? `${(weightValue / 1000).toFixed(3)} KG`
            : `${weightValue} GM`;
      }
    } else if (pUnit === 'LTR') {
      if (weightUnitMode === 'LTR') {
        qtyInBaseUnit = weightValue;
        displayWeightText = `${weightValue.toFixed(3)} LTR`;
      } else {
        qtyInBaseUnit = weightValue / 1000;
        displayWeightText =
          weightValue >= 1000
            ? `${(weightValue / 1000).toFixed(3)} LTR`
            : `${weightValue} ML`;
      }
    } else if (pUnit === 'GM' || pUnit === 'ML') {
      qtyInBaseUnit = weightValue;
      displayWeightText = `${weightValue} ${pUnit}`;
    } else {
      qtyInBaseUnit = weightValue;
      displayWeightText = `${weightValue} ${pUnit}`;
    }

    const calculatedPrice = qtyInBaseUnit * unitRate;

    return {
      qtyInBaseUnit,
      displayWeightText,
      calculatedPrice,
    };
  };

  const { qtyInBaseUnit, displayWeightText, calculatedPrice } = calculateQuantities();

  const handleAddDirectToCart = () => {
    if (!selectedProduct || weightValue <= 0 || qtyInBaseUnit <= 0) return;

    playScannerBeep();
    onAddToCart(
      selectedProduct,
      qtyInBaseUnit,
      undefined,
      'WITHOUT_BARCODE',
      displayWeightText
    );

    setSuccessMessage(`Added ${displayWeightText} of ${selectedProduct.name} directly to bill (Without Barcode)!`);
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 900);
  };

  const filteredProducts = products.filter((p) => {
    if (Number(p.stock || 0) <= 0) return false;
    const q = searchQuery.toLowerCase().trim();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.barcode.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base">Direct Loose Measuring & Selling Station</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Without Barcode
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Measure weight directly on scale · No barcode required · Stock automatically deducted
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-amber-500 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Reset selected product and scale weight to 0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset</span>
            </button>

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

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 flex items-center gap-2 animate-fadeIn shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left: Product Selection */}
            <div className="md:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  1. Select Product to Measure:
                </label>
                {selectedProduct && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Selected
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product (Rice, Dal, Sugar, Oil, Salt...)"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Product List */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
                {filteredProducts.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    {searchQuery.trim()
                      ? 'No matching in-stock products found.'
                      : 'No in-stock products available.'}
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const isSelected = p.id === selectedProductId;
                    const isLoose = ['KG', 'LTR', 'GM', 'ML'].includes(p.unit);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProductId(p.id)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {isLoose && (
                              <span className="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                                Loose
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-code">
                            {p.category} · Stock: {p.stock} {p.unit}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-xs text-amber-900 font-mono-code">
                            ₹{p.sellingPrice.toFixed(2)} / {p.unit}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Digital Scale Display & Weight Controller */}
            <div className="md:col-span-6 space-y-3.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                2. Measure Weight / Direct Scale Reading:
              </label>

              {/* Digital LCD Scale Display Simulator */}
              <div className="bg-slate-950 p-4 rounded-2xl border-2 border-slate-800 text-emerald-400 font-mono-code shadow-inner space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-emerald-400" />
                    <span>DIGITAL WEIGHT SCALE</span>
                  </span>
                  <span className="text-emerald-400 font-bold">● ONLINE ACTIVE</span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-sans">Measured Weight:</span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-wider">
                      {displayWeightText}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block font-sans">Calculated Amount:</span>
                    <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-wider">
                      ₹{calculatedPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                  <span>
                    {selectedProduct
                      ? `Rate: ₹${unitRate.toFixed(2)} / ${selectedProduct.unit}`
                      : 'Rate: ₹0.00 (Select a product)'}
                  </span>
                  <span>
                    {selectedProduct
                      ? `Deduction: ${qtyInBaseUnit.toFixed(3)} ${selectedProduct.unit}`
                      : 'Deduction: 0.000'}
                  </span>
                </div>
              </div>

              {/* Quick Weight Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Quick Presets:
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[100, 250, 500, 1000].map((gm) => (
                    <button
                      key={gm}
                      type="button"
                      onClick={() => {
                        setWeightInput(String(gm));
                        setWeightUnitMode('GM');
                      }}
                      className={`py-2 px-1 rounded-xl border font-mono-code font-bold text-center transition-all cursor-pointer ${
                        weightValue === gm && weightUnitMode === 'GM'
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                          : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {gm >= 1000 ? '1 KG / LTR' : `${gm} GM`}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-xs pt-1">
                  {[1.5, 2, 2.5, 5].map((kg) => (
                    <button
                      key={kg}
                      type="button"
                      onClick={() => {
                        setWeightInput(String(kg));
                        setWeightUnitMode('KG');
                      }}
                      className={`py-2 px-1 rounded-xl border font-mono-code font-bold text-center transition-all cursor-pointer ${
                        weightValue === kg && weightUnitMode === 'KG'
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                          : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {kg} KG
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Weight Input */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase">
                  <span>Custom Exact Scale Measurement:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWeightUnitMode('GM')}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono-code font-bold cursor-pointer ${
                        weightUnitMode === 'GM'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Grams / ML
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightUnitMode('KG')}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono-code font-bold cursor-pointer ${
                        weightUnitMode === 'KG'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      KG / LTR
                    </button>
                  </div>
                </div>

                <input
                  type="number"
                  step="any"
                  min="0"
                  value={weightInput}
                  onFocus={(e) => {
                    if (weightInput === '0') e.target.select();
                  }}
                  onBlur={() => {
                    if (weightInput.trim() === '' || Number(weightInput) <= 0) {
                      setWeightInput('0');
                    }
                  }}
                  onChange={(e) => setWeightInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-base font-extrabold font-mono-code bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                />
              </div>

              {/* Notice Banner */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl text-[11px] text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Report & Stock Adjustment Policy:</span>
                </div>
                <p className="text-amber-900/90 leading-tight">
                  {selectedProduct ? (
                    <>
                      This transaction is sold <strong>Without Barcode</strong>. In the Sales Ledger report and invoice, it will be clearly mentioned as <strong>"Without Barcode (Direct Loose)"</strong>. The sold weight (<strong>{qtyInBaseUnit.toFixed(3)} {selectedProduct.unit}</strong>) will be deducted from purchased product stock ({selectedProduct.stock} {selectedProduct.unit} available).
                    </>
                  ) : (
                    <>
                      Select a product from the left list and choose or enter a scale measurement above to calculate the amount and add it to the bill.
                    </>
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all active:scale-[0.98] cursor-pointer shrink-0"
                  title="Reset selection and scale to 0"
                >
                  <RotateCcw className="w-4 h-4 text-slate-600" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddDirectToCart}
                  disabled={!selectedProduct || weightValue <= 0 || qtyInBaseUnit <= 0}
                  className={`flex-1 py-3.5 px-4 rounded-2xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                    !selectedProduct || weightValue <= 0 || qtyInBaseUnit <= 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 text-amber-200" />
                  <span>Add Direct Loose (No Barcode) to Bill</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
