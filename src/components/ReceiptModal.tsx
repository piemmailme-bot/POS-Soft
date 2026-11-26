import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, PlusCircle, CheckCircle2, X, Zap, HelpCircle } from 'lucide-react';
import { CompleteInvoice, SocietyProfile } from '../types';
import { formatQuantityWithSubunit } from '../utils/looseBarcode';
import {
  printElement,
  printReceiptDirectThermal,
  isDirectThermalSupported,
} from '../utils/print';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: CompleteInvoice | null;
  society: SocietyProfile;
  onNewSale: () => void;
}

const AUTO_PRINT_KEY = 'nabkul_auto_print_receipt_v1';

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
  society,
  onNewSale,
}) => {
  const [digitalQrUrl, setDigitalQrUrl] = useState<string>('');
  const [paperFormat, setPaperFormat] = useState<'80mm' | '58mm' | 'A4'>('80mm');
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_PRINT_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showPrinterGuide, setShowPrinterGuide] = useState<boolean>(false);
  const [directPrintNotice, setDirectPrintNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isDirectPrinting, setIsDirectPrinting] = useState<boolean>(false);
  const lastAutoPrintedInvoiceRef = useRef<string | null>(null);

  useEffect(() => {
    if (invoice) {
      const payload = JSON.stringify({
        org: society.name,
        gstin: society.gstin || '',
        inv: invoice.invoiceNo,
        date: invoice.saleDate,
        total: invoice.grandTotal,
        mode: invoice.paymentMode,
      });

      QRCode.toDataURL(payload, { width: 140, margin: 1 })
        .then((url) => setDigitalQrUrl(url))
        .catch(() => {});
    }
  }, [invoice, society.name, society.gstin]);

  // Automatically trigger print once per opened invoice when Auto-Print is ON
  useEffect(() => {
    if (!isOpen || !invoice || !autoPrintEnabled) return;
    if (lastAutoPrintedInvoiceRef.current === invoice.invoiceNo) return;
    lastAutoPrintedInvoiceRef.current = invoice.invoiceNo;

    const timer = window.setTimeout(() => {
      printElement('printable-receipt', paperFormat);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isOpen, invoice, autoPrintEnabled, paperFormat]);

  useEffect(() => {
    if (!isOpen) {
      setDirectPrintNotice(null);
      setShowPrinterGuide(false);
    }
  }, [isOpen]);

  if (!isOpen || !invoice) return null;

  const effectiveTaxableBase = Number((invoice.baseAmount ?? invoice.subtotal ?? 0).toFixed(2));
  const computedRawBeforeRound =
    invoice.baseAmount !== undefined
      ? Number((invoice.baseAmount + (invoice.totalGst || 0)).toFixed(2))
      : Number((invoice.subtotal - (invoice.discount || 0)).toFixed(2));
  const displayRoundOff =
    invoice.roundOff !== undefined
      ? Number(invoice.roundOff.toFixed(2))
      : Number((invoice.grandTotal - computedRawBeforeRound).toFixed(2));
  const grossExGstBeforeDiscount =
    invoice.discount > 0 ? Number((effectiveTaxableBase + invoice.discount).toFixed(2)) : effectiveTaxableBase;

  const handlePrint = () => {
    printElement('printable-receipt', paperFormat);
  };

  const handleDirectThermalPrint = async () => {
    setDirectPrintNotice(null);
    setIsDirectPrinting(true);
    const result = await printReceiptDirectThermal(invoice, society, paperFormat);
    setIsDirectPrinting(false);
    setDirectPrintNotice({
      type: result.ok ? 'success' : 'error',
      text: result.message,
    });
  };

  const handleToggleAutoPrint = (checked: boolean) => {
    setAutoPrintEnabled(checked);
    try {
      localStorage.setItem(AUTO_PRINT_KEY, String(checked));
    } catch {
      // ignore storage errors
    }
  };

  const handleDownloadTxt = () => {
    const lines = [
      '========================================',
      `       ${society.name.toUpperCase()}       `,
      `    ${society.address}    `,
      `Tel: ${society.phone}${society.regNo ? ` | Reg: ${society.regNo}` : ''}`,
      society.email ? `Email: ${society.email}` : '',
      society.gstin ? `Society GSTIN: ${society.gstin}` : '',
      '========================================',
      `TAX INVOICE / RETAIL MEMO`,
      `Invoice No: ${invoice.invoiceNo}`,
      `Date: ${invoice.saleDate}`,
      `Cashier: ${invoice.cashier}`,
      `Customer: ${invoice.customerName}`,
      invoice.buyerGstin ? `Buyer GSTIN: ${invoice.buyerGstin}` : '',
      `Payment: ${invoice.paymentMode}`,
      invoice.upiTxnRef ? `UPI Ref: ${invoice.upiTxnRef}` : '',
      '----------------------------------------',
      'ITEM                 HSN    QTY    TOTAL',
      '----------------------------------------',
      ...invoice.items.map((it) => {
        const hsn = (it.hsnCode || '-').padEnd(6).slice(0, 6);
        return `${it.productName.padEnd(20).slice(0, 20)} ${hsn} ${it.quantity} ${it.unitType.padEnd(3)} ₹${it.lineTotal.toFixed(2)}`;
      }),
      '----------------------------------------',
      invoice.discount > 0
        ? `Gross Value (Excl. GST):     ₹${grossExGstBeforeDiscount.toFixed(2)}`
        : '',
      invoice.discount > 0
        ? `Bill Discount Allowed:      -₹${invoice.discount.toFixed(2)}`
        : '',
      `Taxable Base (Excl. GST):    ₹${effectiveTaxableBase.toFixed(2)}`,
      (invoice.totalGst || 0) > 0
        ? `CGST:                        ₹${(invoice.cgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}`
        : '',
      (invoice.totalGst || 0) > 0
        ? `SGST:                        ₹${(invoice.sgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}`
        : '',
      (invoice.totalGst || 0) > 0
        ? `Total GST Charge:            ₹${(invoice.totalGst || 0).toFixed(2)}`
        : '',
      displayRoundOff !== 0
        ? `Round Off Adjustment:        ${displayRoundOff > 0 ? '+' : '-'}₹${Math.abs(displayRoundOff).toFixed(2)}`
        : '',
      `NET PAYABLE (ROUNDED):       ₹${invoice.grandTotal.toFixed(2)}`,
      invoice.paymentMode === 'SPLIT'
        ? `Paid Cash: ₹${(invoice.cashPaid || 0).toFixed(2)} | Paid UPI: ₹${(invoice.upiPaid || 0).toFixed(2)}`
        : '',
      invoice.paymentMode === 'CREDIT'
        ? `Cash Down: ₹${(invoice.cashPaid || 0).toFixed(2)} | Credit Due: ₹${(invoice.creditDue || invoice.grandTotal).toFixed(2)}`
        : '',
      invoice.paymentMode === 'CASH' && invoice.tenderedCash
        ? `Cash Tendered:               ₹${invoice.tenderedCash.toFixed(2)}\nChange Returned:             ₹${(invoice.changeDue || 0).toFixed(2)}`
        : '',
      '========================================',
      '   THANK YOU FOR SUPPORTING COOPERATIVE  ',
      '   BERACHAMPA · DIST. NORTH 24 PARGANAS  ',
      '========================================',
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${invoice.invoiceNo.replace(/\//g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const widthClass =
    paperFormat === '58mm'
      ? 'max-w-[260px]'
      : paperFormat === 'A4'
      ? 'max-w-2xl'
      : 'max-w-sm';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-2xl ${
          paperFormat === 'A4' ? 'max-w-3xl' : 'max-w-md'
        } w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]`}
      >
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">Sale Completed · Tax Invoice Ready</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-slate-800 p-0.5 rounded-lg border border-slate-700 flex items-center text-[10px] font-bold">
              {(['58mm', '80mm', 'A4'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setPaperFormat(fmt)}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    paperFormat === fmt ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="group flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all cursor-pointer"
            >
              <X className="w-4 h-4 text-rose-400 group-hover:text-white" />
              <span>Close ✕</span>
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto bg-slate-100 flex-1">
          <div
            id="printable-receipt"
            className={`bg-white p-5 rounded-xl border border-slate-300 shadow-sm font-mono-code text-xs text-slate-900 mx-auto ${widthClass}`}
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-400">
              <h2 className="font-extrabold text-sm uppercase tracking-wider">{society.name}</h2>
              <p className="text-[11px] text-slate-700 mt-0.5">{society.address}</p>
              <p className="text-[10px] text-slate-500">
                Ph: {society.phone}
                {society.regNo ? ` · Reg: ${society.regNo}` : ''}
              </p>
              {society.email && (
                <p className="text-[10px] text-slate-600">Email: {society.email}</p>
              )}
              {society.gstin && (
                <p className="text-[10px] font-bold text-slate-800 mt-0.5">
                  GSTIN: {society.gstin} {society.stateCode ? `(State: ${society.stateCode})` : ''}
                </p>
              )}
              <div className="mt-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 py-0.5 rounded">
                GST TAX INVOICE / RETAIL MEMO
              </div>
            </div>

            {/* Bill Info */}
            <div className="py-2.5 border-b border-dashed border-slate-400 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice No:</span>
                <span className="font-bold">{invoice.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date/Time:</span>
                <span>{invoice.saleDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Customer:</span>
                <span className="font-bold truncate max-w-[190px]">{invoice.customerName}</span>
              </div>
              {invoice.buyerGstin && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Buyer GSTIN:</span>
                  <span className="font-bold text-slate-900">{invoice.buyerGstin}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Mode:</span>
                <span className="font-bold text-emerald-700">{invoice.paymentMode}</span>
              </div>
              {invoice.upiTxnRef && (
                <div className="flex justify-between">
                  <span className="text-slate-600">UPI Ref / UTR:</span>
                  <span className="text-[10px]">{invoice.upiTxnRef}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 text-left">
                    <th className="pb-1 font-semibold">Item / HSN</th>
                    <th className="pb-1 text-center font-semibold">Qty</th>
                    <th className="pb-1 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1 pr-2 font-medium leading-tight">
                        <div className="text-slate-900">{item.productName}</div>
                        <div className="text-[9px] text-slate-500 font-normal">
                          {item.hsnCode ? `HSN: ${item.hsnCode} · ` : ''}
                          {item.gstPercent ? `GST ${item.gstPercent}%` : '0% GST'}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-center whitespace-nowrap font-bold text-slate-800">
                        {formatQuantityWithSubunit(item.quantity, item.unitType)}
                      </td>
                      <td className="py-1 text-right font-bold whitespace-nowrap">
                        ₹{item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              {invoice.discount > 0 && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Gross Value (Excl. GST):</span>
                    <span>₹{grossExGstBeforeDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>- Bill Discount Allowed:</span>
                    <span>-₹{invoice.discount.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Taxable Base (Excl. GST):</span>
                <span>₹{effectiveTaxableBase.toFixed(2)}</span>
              </div>
              {(invoice.totalGst || 0) > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST:</span>
                    <span>₹{(invoice.cgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST:</span>
                    <span>₹{(invoice.sgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>+ Total Output GST:</span>
                    <span>₹{(invoice.totalGst || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
              {displayRoundOff !== 0 && (
                <div className="flex justify-between text-amber-800 font-semibold">
                  <span>+ Round Off Adjustment:</span>
                  <span>
                    {displayRoundOff > 0
                      ? `+₹${displayRoundOff.toFixed(2)}`
                      : `-₹${Math.abs(displayRoundOff).toFixed(2)}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-slate-200">
                <span>NET PAYABLE (ROUNDED):</span>
                <span className="text-emerald-800">₹{invoice.grandTotal.toFixed(2)}</span>
              </div>

              {invoice.paymentMode === 'SPLIT' && (
                <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-700 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Paid by Cash:</span>
                    <span className="font-bold">₹{(invoice.cashPaid || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paid by UPI QR:</span>
                    <span className="font-bold">₹{(invoice.upiPaid || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {invoice.paymentMode === 'CREDIT' && (
                <div className="pt-1.5 border-t border-slate-200 text-[10px] text-amber-900 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Cash Down-Payment:</span>
                    <span>₹{(invoice.cashPaid || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Member Credit Due (Sundry Debtors):</span>
                    <span>₹{(invoice.creditDue ?? invoice.grandTotal).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {invoice.paymentMode === 'CASH' && invoice.tenderedCash && (
                <div className="pt-1.5 border-t border-slate-200 text-[10px] text-slate-600 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Cash Tendered:</span>
                    <span>₹{invoice.tenderedCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Change Returned:</span>
                    <span>₹{(invoice.changeDue || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 text-center flex flex-col items-center">
              {digitalQrUrl && (
                <img
                  src={digitalQrUrl}
                  alt="Invoice QR"
                  className="w-20 h-20 border border-slate-300 p-1 rounded"
                />
              )}
              <p className="text-[10px] text-slate-500 mt-1">Scan for digital e-invoice verification</p>
              <p className="text-[10px] font-bold text-slate-700 mt-2">
                Thank you for patronizing {society.name}!
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
          {directPrintNotice && (
            <div
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                directPrintNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {directPrintNotice.text}
            </div>
          )}

          {showPrinterGuide && (
            <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] space-y-1.5 border border-slate-700">
              <div className="font-bold text-emerald-300 flex items-center justify-between">
                <span>How to Print Directly to Printer (Skip PDF &amp; Print Dialog)</span>
                <button
                  type="button"
                  onClick={() => setShowPrinterGuide(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-slate-300 leading-relaxed">
                <strong>1. Stop Saving as PDF:</strong> Click <strong>Print ({paperFormat})</strong> → change{' '}
                <strong>Destination</strong> from <em>Save as PDF</em> to your <strong>Thermal / POS Printer</strong> → click Print once. Chrome remembers your printer automatically.
              </p>
              <p className="text-slate-300 leading-relaxed">
                <strong>2. Instant Zero-Dialog Auto Print (POS Counter):</strong> Launch Chrome with{' '}
                <code className="px-1 py-0.5 rounded bg-slate-800 text-amber-300 font-mono-code">
                  --kiosk-printing
                </code>{' '}
                (in Chrome desktop shortcut Target) and turn ON <strong>Auto-Print</strong> below. Receipts will print immediately without any popup!
              </p>
              {isDirectThermalSupported() && (
                <p className="text-slate-300 leading-relaxed">
                  <strong>3. USB / Serial Thermal Printer:</strong> Click <strong>Direct Thermal</strong> to send ESC/POS commands straight to a connected COM/USB-Serial printer with zero dialog.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-300" />
                <span>Print ({paperFormat})</span>
              </button>

              {isDirectThermalSupported() && (
                <button
                  type="button"
                  onClick={handleDirectThermalPrint}
                  disabled={isDirectPrinting}
                  className="px-2.5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                  title="Send ESC/POS directly to USB/Serial thermal printer with zero dialog"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isDirectPrinting ? 'Printing...' : 'Direct Thermal'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadTxt}
                className="px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-slate-600" />
                <span>Close</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewSale();
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Sale</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 text-[11px]">
            <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPrintEnabled}
                onChange={(e) => handleToggleAutoPrint(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Auto-Print receipt immediately after checkout</span>
            </label>

            <button
              type="button"
              onClick={() => setShowPrinterGuide((prev) => !prev)}
              className="text-sky-700 hover:text-sky-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Direct Printer Setup</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
