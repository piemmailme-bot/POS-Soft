import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { LoosePacket } from '../types';

interface BarcodeStickerProps {
  packet: LoosePacket;
  societyName: string;
  id?: string;
}

export const BarcodeSticker: React.FC<BarcodeStickerProps> = ({ packet, societyName, id }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current) {
      try {
        JsBarcode(svgRef.current, packet.uniqueBarcode, {
          format: 'CODE128',
          width: 1.35,
          height: 38,
          displayValue: true,
          fontSize: 10,
          margin: 1,
          lineColor: '#000000',
        });
      } catch (err) {
        console.warn('Barcode SVG render error:', err);
      }
    }
  }, [packet.uniqueBarcode]);

  return (
    <div
      id={id}
      className="bg-white border-2 border-slate-900 rounded-2xl p-4 shadow-xl w-full max-w-xs text-center space-y-2 relative overflow-hidden print:border-black print:shadow-none print:break-inside-avoid mb-4"
    >
      <div className="border-b border-dashed border-slate-400 pb-1.5">
        <div className="font-bold text-xs uppercase tracking-wider text-slate-800">
          {societyName}
        </div>
        <div className="text-[9px] text-slate-500">Kolkata Co-op Store · Measured Loose Pack</div>
      </div>

      <div className="space-y-1 my-1">
        <h4 className="font-black text-sm text-slate-900 leading-tight">
          {packet.productName}
        </h4>
        <div className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-950 px-2 py-0.5 rounded-lg text-xs font-mono-code font-bold border border-emerald-300">
          <span>NET WT/VOL:</span>
          <span className="text-sm font-extrabold">{packet.weightText}</span>
        </div>
      </div>

      <div className="py-1 overflow-hidden">
        <svg ref={svgRef} className="max-w-full h-auto mx-auto block" />
      </div>

      <div className="border-t border-dashed border-slate-400 pt-2 flex items-center justify-between font-mono-code">
        <div className="text-left">
          <span className="text-[9px] text-slate-500 uppercase block font-medium">
            Rate: ₹{packet.unitPrice.toFixed(0)}/{packet.unit}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 block uppercase font-bold">
            PACK PRICE:
          </span>
          <span className="text-base font-black text-slate-900">
            ₹{packet.calculatedPrice.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

interface BarcodePrintSheetProps {
  packets: LoosePacket[];
  societyName: string;
  id?: string;
}

export const BarcodePrintSheet: React.FC<BarcodePrintSheetProps> = ({ packets, societyName, id }) => {
  return (
    <div id={id} className="p-4 flex flex-col items-center">
      {packets.map((pk) => (
        <BarcodeSticker key={pk.id} packet={pk} societyName={societyName} />
      ))}
    </div>
  );
};
