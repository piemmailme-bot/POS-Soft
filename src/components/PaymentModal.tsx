import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import {
  X,
  QrCode,
  Banknote,
  CheckCircle2,
  Volume2,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  User,
  Copy,
  Check,
  Trash2,
  Split,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import { PaymentMode, CartItem, SocietyProfile, AdminStoreSettings, PartyAccount } from '../types';
import { playUpiSuccessChime, playCashDrawerSound } from '../utils/audio';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  grandTotal: number;
  discount: number;
  invoiceNo: string;
  selectedCustomer: string;
  setSelectedCustomer: (cust: string) => void;
  society: SocietyProfile;
  paymentMode?: PaymentMode;
  adminSettings?: AdminStoreSettings;
  parties?: PartyAccount[];
  members?: PartyAccount[];
  selectedMemberId?: string;
  setSelectedMemberId?: (id: string) => void;
  discountMode?: 'AMOUNT' | 'PERCENT';
  setDiscountMode?: (mode: 'AMOUNT' | 'PERCENT') => void;
  discountValue?: string;
  setDiscountValue?: (val: string) => void;
  buyerGstin?: string;
  strictUpiValidation?: boolean;
  onPaymentComplete: (details: {
    paymentMode: PaymentMode;
    customerName: string;
    customerId?: string;
    tenderedCash?: number;
    changeDue?: number;
    upiTxnRef?: string;
    cashPaid?: number;
    upiPaid?: number;
    creditDue?: number;
  }) => void;
  onClearCart?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  cart,
  grandTotal,
  discount,
  invoiceNo,
  selectedCustomer,
  setSelectedCustomer,
  society,
  paymentMode,
  adminSettings,
  parties = [],
  members = [],
  selectedMemberId = '',
  setSelectedMemberId,
  discountMode = 'AMOUNT',
  setDiscountMode,
  discountValue = '',
  setDiscountValue,
  strictUpiValidation,
  onPaymentComplete,
  onClearCart,
}) => {
  const [activeTab, setActiveTab] = useState<PaymentMode>(paymentMode || 'UPI');
  const [qrViewMode, setQrViewMode] = useState<'bank_qr' | 'dynamic'>('bank_qr');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Cash mode state
  const [tenderedCash, setTenderedCash] = useState<number>(0);

  // UPI mode state
  const [upiStatus, setUpiStatus] = useState<'waiting' | 'paid'>('waiting');
  const [upiTxnId, setUpiTxnId] = useState<string>('');
  const [manualUtrInput, setManualUtrInput] = useState<string>('');
  const [soundboxMuted, setSoundboxMuted] = useState<boolean>(false);

  // Split mode state (Cash + UPI)
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);

  // Credit mode state (Member Udhaar)
  const [creditDownPaymentCash, setCreditDownPaymentCash] = useState<number>(0);

  const activeUpiId = society.upiId || '21785723893@indianbk';
  const activeMerchantName = society.merchantName || 'DEGANGA CADP FSCS LTD';
  const officialQrImg = society.qrImage || '/assets/payment-qr.png';
  const strictUpiUtr = Boolean(strictUpiValidation ?? adminSettings?.requireStrictUpiUtr ?? adminSettings?.strictUpiValidation);
  const sourceParties = parties.length > 0 ? parties : members;
  const memberParties = sourceParties.filter((p) => p.partyType === 'MEMBER' && p.isActive !== false);

  const upiAmountToCollect =
    activeTab === 'SPLIT' ? Math.max(0, Number((grandTotal - splitCashAmount).toFixed(2))) : grandTotal;

  useEffect(() => {
    if (isOpen) {
      if (paymentMode) {
        setActiveTab(paymentMode === 'CREDIT' ? 'CASH' : paymentMode);
      }
      setQrViewMode('bank_qr');
      setUpiStatus('waiting');
      setUpiTxnId('');
      setManualUtrInput('');
      setCreditDownPaymentCash(0);

      if (grandTotal > 0) {
        setTenderedCash(grandTotal);
        setSplitCashAmount(Math.floor(grandTotal / 2));
      }
    }
  }, [isOpen, paymentMode, grandTotal]);

  useEffect(() => {
    if (isOpen && upiAmountToCollect > 0) {
      const upiUri = `upi://pay?pa=${encodeURIComponent(
        activeUpiId
      )}&pn=${encodeURIComponent(activeMerchantName)}&am=${upiAmountToCollect.toFixed(
        2
      )}&cu=INR&tn=${encodeURIComponent('Deganga CADPFSCS ' + invoiceNo)}`;

      QRCode.toDataURL(upiUri, {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error', err));
    }
  }, [isOpen, upiAmountToCollect, invoiceNo, activeUpiId, activeMerchantName]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(activeUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  if (!isOpen) return null;

  const changeDue = Math.max(0, tenderedCash - grandTotal);
  const isCashSufficient = tenderedCash >= grandTotal;

  const handleSimulateUpiPayment = () => {
    const randomRef =
      manualUtrInput.trim() || 'UPI' + Math.floor(100000000000 + Math.random() * 900000000000);
    setUpiTxnId(randomRef);
    setUpiStatus('paid');

    if (!soundboxMuted) {
      playUpiSuccessChime(upiAmountToCollect);
    }

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }
  };

  const handleCompleteUpiSale = () => {
    const refToUse =
      upiTxnId || manualUtrInput.trim() || 'UPI' + Math.floor(100000000000 + Math.random() * 900000000000);
    onPaymentComplete({
      paymentMode: 'UPI',
      customerName: selectedCustomer,
      customerId: selectedMemberId || undefined,
      upiTxnRef: refToUse,
      cashPaid: 0,
      upiPaid: grandTotal,
      creditDue: 0,
    });
  };

  const handleCompleteCashSale = () => {
    if (!isCashSufficient) return;
    playCashDrawerSound();
    try {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }
    onPaymentComplete({
      paymentMode: 'CASH',
      customerName: selectedCustomer,
      customerId: selectedMemberId || undefined,
      tenderedCash,
      changeDue,
      cashPaid: grandTotal,
      upiPaid: 0,
      creditDue: 0,
    });
  };

  const handleCompleteSplitSale = () => {
    const cashPart = Math.max(0, Math.min(grandTotal, Number(splitCashAmount || 0)));
    const upiPart = Math.max(0, Number((grandTotal - cashPart).toFixed(2)));
    if (strictUpiUtr && upiPart > 0 && manualUtrInput.trim().length < 6) return;
    playCashDrawerSound();
    onPaymentComplete({
      paymentMode: 'SPLIT',
      customerName: selectedCustomer,
      customerId: selectedMemberId || undefined,
      tenderedCash: cashPart,
      changeDue: 0,
      upiTxnRef:
        manualUtrInput.trim() ||
        upiTxnId ||
        'SPLIT-UPI-' + Math.floor(1000000000 + Math.random() * 9000000000),
      cashPaid: cashPart,
      upiPaid: upiPart,
      creditDue: 0,
    });
  };

  const handleCompleteCreditSale = () => {
    const downCash = Math.max(0, Math.min(grandTotal, Number(creditDownPaymentCash || 0)));
    const creditPart = Math.max(0, Number((grandTotal - downCash).toFixed(2)));
    if (!selectedCustomer.trim() || selectedCustomer.trim().toLowerCase() === 'walk-in customer') {
      return;
    }
    onPaymentComplete({
      paymentMode: 'CREDIT',
      customerName: selectedCustomer.trim(),
      customerId: selectedMemberId || undefined,
      tenderedCash: downCash,
      changeDue: 0,
      cashPaid: downCash,
      upiPaid: 0,
      creditDue: creditPart,
    });
  };

  const addCash = (amount: number) => {
    setTenderedCash((prev) => prev + amount);
  };

  const rawSubExclGst = cart.reduce((s, i) => s + i.lineTotal, 0);
  const subExclGst = Number(Math.max(0, rawSubExclGst - discount).toFixed(2));
  const discFactor = rawSubExclGst > 0 ? Math.max(0, subExclGst / rawSubExclGst) : 1;
  const gstTotal = cart.reduce(
    (s, i) => s + (i.lineTotal * discFactor * Number(i.product.gstPercent || 0)) / 100,
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border bg-emerald-600/30 border-emerald-500/40 text-emerald-300 flex items-center justify-center">
              {activeTab === 'UPI' && <QrCode className="w-5 h-5" />}
              {activeTab === 'CASH' && <Banknote className="w-5 h-5" />}
              {activeTab === 'SPLIT' && <Split className="w-5 h-5" />}
              {activeTab === 'CREDIT' && <BookOpen className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base">
                  {activeTab === 'UPI' && 'Online Checkout (UPI QR Code)'}
                  {activeTab === 'CASH' && 'Cash Transaction Checkout'}
                  {activeTab === 'SPLIT' && 'Split Tender Checkout (Cash + UPI)'}
                  {activeTab === 'CREDIT' && 'Cooperative Member Credit (Udhaar) Sale'}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 font-mono-code">
                  {invoiceNo}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {society.name} · Switch payment mode below anytime
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4 text-rose-400 group-hover:text-white transition-colors" />
            <span>Close ✕</span>
          </button>
        </div>

        {/* Mode Switcher Bar */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 grid grid-cols-3 gap-1.5">
          {(['UPI', 'CASH', 'SPLIT'] as PaymentMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setActiveTab(mode)}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === mode
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              {mode === 'UPI' && <QrCode className="w-3.5 h-3.5 text-emerald-400" />}
              {mode === 'CASH' && <Banknote className="w-3.5 h-3.5 text-amber-400" />}
              {mode === 'SPLIT' && <Split className="w-3.5 h-3.5 text-indigo-400" />}
              {mode === 'CREDIT' && <BookOpen className="w-3.5 h-3.5 text-amber-500" />}
              <span>
                {mode === 'UPI' && 'UPI QR'}
                {mode === 'CASH' && 'Cash'}
                {mode === 'SPLIT' && 'Split (Cash+UPI)'}
                {mode === 'CREDIT' && 'Member Credit'}
              </span>
            </button>
          ))}
        </div>

        {/* Customer Selector & Bill Summary banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <User className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Customer:</span>
            {memberParties.length > 0 && setSelectedMemberId && (
              <select
                value={selectedMemberId}
                onChange={(e) => {
                  const mid = e.target.value;
                  setSelectedMemberId(mid);
                  const found = memberParties.find((m) => m.id === mid);
                  if (found) {
                    setSelectedCustomer(found.name);
                  } else {
                    setSelectedCustomer('Walk-in Customer');
                  }
                }}
                className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800"
              >
                <option value="">-- Walk-in / Select Member --</option>
                {memberParties.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.memberNo ? `(${m.memberNo})` : ''}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              placeholder="Customer / Member Name"
              className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {setDiscountValue && setDiscountMode && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1.5 py-0.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Disc:</span>
                <button
                  type="button"
                  onClick={() => setDiscountMode(discountMode === 'AMOUNT' ? 'PERCENT' : 'AMOUNT')}
                  className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold cursor-pointer"
                  title="Switch between ₹ and %"
                >
                  {discountMode === 'AMOUNT' ? '₹' : '%'}
                </button>
                <input
                  type="number"
                  min="0"
                  max={discountMode === 'PERCENT' ? 100 : undefined}
                  step="any"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  className="w-14 text-right text-xs font-mono-code font-bold text-slate-900 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="text-right flex items-center gap-3">
            <div className="text-[11px] text-slate-500 font-mono-code text-right hidden sm:block">
              {discount > 0 && (
                <div className="text-emerald-700 font-bold">- Discount: ₹{discount.toFixed(2)}</div>
              )}
              <div>Taxable Base: ₹{subExclGst.toFixed(2)}</div>
              {gstTotal > 0 && (
                <div className="text-emerald-700 font-bold">+ GST: ₹{gstTotal.toFixed(2)}</div>
              )}
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Payable Amount: </span>
              <span className="text-xl font-extrabold text-emerald-700 font-mono-code">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'UPI' && (
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex flex-col items-center w-full md:w-auto">
                <div className="flex items-center gap-1.5 p-1 bg-slate-200/90 rounded-xl mb-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setQrViewMode('bank_qr')}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      qrViewMode === 'bank_qr'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Official Bank QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrViewMode('dynamic')}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      qrViewMode === 'dynamic'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Auto-Amount QR (₹{grandTotal.toFixed(0)})</span>
                  </button>
                </div>

                {qrViewMode === 'bank_qr' ? (
                  <div className="bg-white p-3 rounded-2xl border-2 border-emerald-500/80 shadow-xl flex flex-col items-center max-w-[270px]">
                    <div className="my-1 p-1.5 bg-white rounded-xl border border-slate-200">
                      <img
                        src={officialQrImg}
                        alt="Deganga CADP FSCS Ltd Official UPI QR Code"
                        className="w-52 h-auto max-h-64 object-contain rounded-lg"
                      />
                    </div>
                    <div className="font-black text-xs text-slate-900 uppercase mt-1">{activeMerchantName}</div>
                    <span className="text-base font-black text-emerald-700 font-mono-code mt-0.5">
                      Payable: ₹{grandTotal.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-2xl border-2 border-indigo-500/80 shadow-xl flex flex-col items-center max-w-[270px]">
                    <div className="my-2 p-1 bg-slate-50 rounded-xl">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="Dynamic UPI QR"
                          className="w-48 h-48 rounded-lg object-contain"
                        />
                      ) : (
                        <div className="w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center">
                          <QrCode className="w-12 h-12 text-slate-400 animate-pulse" />
                        </div>
                      )}
                    </div>
                    <div className="font-black text-[11px] text-slate-800 uppercase">{activeMerchantName}</div>
                    <span className="text-lg font-black text-emerald-700 font-mono-code">
                      ₹{grandTotal.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300/80">
                  <span className="text-[11px] text-slate-500 font-medium">UPI ID:</span>
                  <strong className="text-xs font-mono-code text-slate-900">{activeUpiId}</strong>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="ml-1 p-1 text-slate-500 hover:text-emerald-700"
                  >
                    {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex-1 w-full space-y-4">
                <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Deganga CADPFSCS Soundbox</div>
                      <p className="text-[11px] text-slate-400">Voice confirmation active</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSoundboxMuted(!soundboxMuted)}
                    className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded bg-slate-800"
                  >
                    {soundboxMuted ? 'Unmute' : 'Mute'}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    UPI UTR / Reference Number {strictUpiUtr ? '(Required by Admin *)' : '(Optional)'}:
                  </label>
                  <input
                    type="text"
                    value={manualUtrInput}
                    onChange={(e) => setManualUtrInput(e.target.value)}
                    placeholder="Enter 12-digit UTR or click verify below..."
                    className="w-full px-3 py-2 text-xs font-mono-code font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {upiStatus === 'waiting' ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                    <button
                      type="button"
                      disabled={strictUpiUtr && manualUtrInput.trim().length < 6}
                      onClick={handleSimulateUpiPayment}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Verify UPI Payment Received (₹{grandTotal.toFixed(2)})</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>UPI Payment Verified ({upiTxnId})</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCompleteUpiSale}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                      <span>Generate & Print Bill Receipt</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'CASH' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cash Tendered by Customer (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-500">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={tenderedCash || ''}
                      onChange={(e) => setTenderedCash(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-3 text-2xl font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code text-slate-900"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                      Fast Tender Denominations:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTenderedCash(grandTotal)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        Exact (₹{grandTotal.toFixed(0)})
                      </button>
                      <button
                        type="button"
                        onClick={() => addCash(100)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        +₹100
                      </button>
                      <button
                        type="button"
                        onClick={() => addCash(200)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        +₹200
                      </button>
                      <button
                        type="button"
                        onClick={() => setTenderedCash(500)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        ₹500 Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setTenderedCash(1000)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        ₹1,000
                      </button>
                      <button
                        type="button"
                        onClick={() => setTenderedCash(2000)}
                        className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        ₹2,000 Note
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                      Change Due to Return
                    </span>
                    <div className="mt-2 text-3xl font-extrabold text-emerald-800 font-mono-code">
                      ₹{changeDue.toFixed(2)}
                    </div>
                    {tenderedCash < grandTotal && (
                      <p className="mt-1 text-xs text-rose-600 font-medium">
                        Short by ₹{(grandTotal - tenderedCash).toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-emerald-200/60 text-xs text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Taxable Base (Excl. GST):</span>
                      <span className="font-mono-code font-bold">₹{subExclGst.toFixed(2)}</span>
                    </div>
                    {gstTotal > 0 && (
                      <div className="flex justify-between text-emerald-800 font-bold">
                        <span>+ Output GST:</span>
                        <span className="font-mono-code">₹{gstTotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black pt-1 border-t border-emerald-200">
                      <span>Net Payable:</span>
                      <span className="font-bold text-slate-900 font-mono-code">₹{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!isCashSufficient}
                onClick={handleCompleteCashSale}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                  isCashSufficient
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span>
                  {isCashSufficient
                    ? `Accept ₹${tenderedCash.toFixed(2)} Cash & Complete Sale`
                    : `Tender at least ₹${grandTotal.toFixed(2)}`}
                </span>
              </button>
            </div>
          )}

          {activeTab === 'SPLIT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    1. Physical Cash Portion Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={grandTotal}
                    value={splitCashAmount}
                    onChange={(e) =>
                      setSplitCashAmount(Math.max(0, Math.min(grandTotal, Number(e.target.value) || 0)))
                    }
                    className="w-full px-3 py-2.5 text-xl font-bold font-mono-code bg-white border border-slate-300 rounded-xl"
                  />

                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1 text-xs">
                    <div className="flex justify-between text-slate-700">
                      <span>Cash Portion (Cash Book):</span>
                      <strong className="font-mono-code">₹{splitCashAmount.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between text-indigo-900 font-bold text-sm">
                      <span>2. Balance via UPI QR (Bank Book):</span>
                      <strong className="font-mono-code">₹{upiAmountToCollect.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      UPI Reference / UTR for ₹{upiAmountToCollect.toFixed(2)}:
                    </label>
                    <input
                      type="text"
                      value={manualUtrInput}
                      onChange={(e) => setManualUtrInput(e.target.value)}
                      placeholder="Optional UTR / Ref"
                      className="w-full px-3 py-2 text-xs font-mono-code bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-emerald-300 flex flex-col items-center justify-center">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase mb-1">
                    Scan QR for UPI Portion: ₹{upiAmountToCollect.toFixed(2)}
                  </span>
                  {qrDataUrl && upiAmountToCollect > 0 ? (
                    <>
                      <img src={qrDataUrl} alt="Split UPI QR" className="w-44 h-44 object-contain" />
                      <span className="mt-1 text-[11px] font-mono-code font-bold text-slate-700">
                        {activeUpiId}
                      </span>
                    </>
                  ) : (
                    <div className="py-12 text-xs text-slate-400">Full amount covered by Cash</div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompleteSplitSale}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <Split className="w-4 h-4" />
                <span>
                  Complete Split Sale (Cash ₹{splitCashAmount.toFixed(2)} + UPI ₹{upiAmountToCollect.toFixed(2)})
                </span>
              </button>
            </div>
          )}

          {activeTab === 'CREDIT' && (
            <div className="space-y-4">
              {(!selectedCustomer.trim() ||
                selectedCustomer.trim().toLowerCase() === 'walk-in customer') && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Please select a Cooperative Member or enter the Farmer&apos;s full name above before recording a Credit (Udhaar) sale.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Partial Cash Down-Payment Today (Optional ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={grandTotal}
                    value={creditDownPaymentCash}
                    onChange={(e) =>
                      setCreditDownPaymentCash(
                        Math.max(0, Math.min(grandTotal, Number(e.target.value) || 0))
                      )
                    }
                    className="w-full px-3 py-2.5 text-xl font-bold font-mono-code bg-white border border-slate-300 rounded-xl"
                  />
                  <p className="text-[11px] text-slate-500">
                    Leave as 0 for 100% credit invoice, or enter partial cash received today.
                  </p>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-900 uppercase block">
                      Net Credit Receivable (Sundry Debtors)
                    </span>
                    <div className="mt-2 text-3xl font-extrabold text-amber-900 font-mono-code">
                      ₹{Math.max(0, grandTotal - creditDownPaymentCash).toFixed(2)}
                    </div>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Posted to <strong>{selectedCustomer || 'Member'}</strong> Ledger &amp; Balance Sheet Sundry Debtors.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  !selectedCustomer.trim() ||
                  selectedCustomer.trim().toLowerCase() === 'walk-in customer'
                }
                onClick={handleCompleteCreditSale}
                className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>
                  Record Member Credit Sale (Due: ₹{Math.max(0, grandTotal - creditDownPaymentCash).toFixed(2)})
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Deganga CADPFSCS Ltd POS · Instant Stock &amp; Final Accounts Sync</span>
          </div>

          {onClearCart && (
            <button
              type="button"
              onClick={onClearCart}
              className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-600 text-rose-800 hover:text-white font-bold border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Cancel Bill</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
