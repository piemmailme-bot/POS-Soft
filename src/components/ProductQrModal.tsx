import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer, Barcode, QrCode, Tag, Sparkles } from 'lucide-react';
import { Product, SocietyProfile } from '../types';

interface ProductQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  society: SocietyProfile;
}

export const ProductQrModal: React.FC<ProductQrModalProps> = ({
  isOpen,
  onClose,
  product,
  society,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (product) {
      // Product QR encodes exact barcode and price so standard scanners can read it directly
      QRCode.toDataURL(product.barcode, {
        width: 220,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
        .then((url) => setQrUrl(url))
        .catch(() => {});
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm">Product QR & Shelf Tag</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Close Window (or press Esc key)"
          >
            <X className="w-4 h-4 text-rose-400 group-hover:text-white transition-colors" />
            <span>Close ✕</span>
          </button>
        </div>

        {/* Printable Shelf Label */}
        <div className="p-6 bg-slate-50 flex items-center justify-center">
          <div
            id="printable-receipt"
            className="bg-white p-5 rounded-xl border-2 border-slate-900 shadow-md text-center w-full max-w-xs space-y-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 py-0.5 rounded">
              {society.name}
            </div>

            <div className="space-y-0.5">
              <h4 className="font-extrabold text-base text-slate-900 leading-snug">
                {product.name}
              </h4>
              <p className="text-xs text-slate-500 font-medium">{product.category}</p>
            </div>

            {/* QR Code image */}
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 inline-block mx-auto">
              {qrUrl && (
                <img
                  src={qrUrl}
                  alt={product.name}
                  className="w-36 h-36 rounded-lg object-contain mx-auto"
                />
              )}
            </div>

            {/* Barcode & Price */}
            <div>
              <div className="text-2xl font-extrabold text-slate-900 font-mono-code">
                ₹{product.sellingPrice.toFixed(2)}
                <span className="text-xs font-normal text-slate-500"> / {product.unit}</span>
              </div>
              <div className="text-xs font-mono-code text-slate-600 tracking-widest mt-1 bg-slate-100 py-1 px-2 rounded">
                BARCODE: {product.barcode}
              </div>
            </div>

            <div className="text-[9px] text-slate-400 pt-1 border-t border-dashed border-slate-300 flex justify-between">
              <span>Batch: {product.batchNo}</span>
              <span>Stock: {product.stock} {product.unit}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
            <span>Close Window</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Label Sticker</span>
          </button>
        </div>
      </div>
    </div>
  );
};
