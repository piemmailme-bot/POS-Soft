import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Download,
  Printer,
  Database,
  CheckCircle2,
  AlertCircle,
  Code2,
  Copy,
  Check,
  X,
  IndianRupee,
  Calculator,
  Calendar,
  Tag,
  MapPin,
  FileText,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { FixedAsset, SocietyProfile } from '../types';
import { getIstDateStr } from '../utils/dateUtils';

export const SUPABASE_FIXED_ASSETS_TABLE_SQL = `-- Database PostgreSQL Table Schema for Fixed Asset Register
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id TEXT PRIMARY KEY,
  "assetCode" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  category TEXT NOT NULL,
  "acquisitionDate" TEXT NOT NULL,
  "costValue" NUMERIC DEFAULT 0,
  "depreciationPercent" NUMERIC DEFAULT 10,
  "accumulatedDepreciation" NUMERIC DEFAULT 0,
  "netBookValue" NUMERIC DEFAULT 0,
  "paymentMode" TEXT DEFAULT 'CAPITAL_OPENING',
  notes TEXT DEFAULT ''
);

ALTER TABLE public.fixed_assets Disable ROW LEVEL SECURITY;`;

export const FIXED_ASSET_CATEGORIES: {
  value: string;
  label: string;
  defaultDepRate: number;
}[] = [
  { value: 'Equipment', label: 'Weighing & Store Equipment (15%)', defaultDepRate: 15 },
  { value: 'Computer', label: 'Computer, POS & Printer Hardware (40%)', defaultDepRate: 40 },
  { value: 'Furniture', label: 'Furniture, Racks & Fixtures (10%)', defaultDepRate: 10 },
  { value: 'Building', label: 'Godown, Office & Building (5%)', defaultDepRate: 5 },
  { value: 'Electrical', label: 'Electrical, Inverter, Battery & CCTV (15%)', defaultDepRate: 15 },
  { value: 'Vehicle', label: 'Delivery & Transport Vehicle (15%)', defaultDepRate: 15 },
  { value: 'Other', label: 'Other Society Fixed Asset (10%)', defaultDepRate: 10 },
];

interface FixedAssetRegisterManagerProps {
  fixedAssets: FixedAsset[];
  society?: SocietyProfile;
  onSaveFixedAsset?: (asset: Omit<FixedAsset, 'id'> & { id?: string }) => Promise<boolean>;
  onAddFixedAsset?: (asset: Omit<FixedAsset, 'id'> & { id?: string }) => Promise<boolean>;
  onDeleteFixedAsset?: (id: string) => Promise<boolean>;
  onRefreshData?: () => Promise<void> | void;
  embedded?: boolean;
}

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const FixedAssetRegisterManager: React.FC<FixedAssetRegisterManagerProps> = ({
  fixedAssets = [],
  society,
  onSaveFixedAsset,
  onAddFixedAsset,
  onDeleteFixedAsset,
  onRefreshData,
  embedded = false,
}) => {
  const todayStr = useMemo(() => getIstDateStr(), []);

  // Suggest next sequential asset code e.g. FA-2026-0001
  const suggestedAssetCode = useMemo(() => {
    const year = todayStr.slice(0, 4);
    let maxSeq = 0;
    fixedAssets.forEach((fa) => {
      const code = String(fa.assetCode || '');
      const m = code.match(/(\d+)$/);
      if (m) {
        const val = parseInt(m[1], 10);
        if (Number.isFinite(val) && val < 9000 && val > maxSeq) {
          maxSeq = val;
        }
      }
    });
    const nextNum = Math.max(fixedAssets.length + 1, maxSeq + 1);
    return `FA-${year}-${String(nextNum).padStart(4, '0')}`;
  }, [fixedAssets, todayStr]);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assetCode, setAssetCode] = useState<string>('');
  const [assetName, setAssetName] = useState<string>('');
  const [category, setCategory] = useState<string>('Equipment');
  const [purchaseDate, setPurchaseDate] = useState<string>(todayStr);
  const [quantity, setQuantity] = useState<string>('1');
  const [costValue, setCostValue] = useState<string>('');
  const [depreciationRatePct, setDepreciationRatePct] = useState<string>('15');
  const [accumulatedDepreciation, setAccumulatedDepreciation] = useState<string>('0');
  const [fundingSource, setFundingSource] = useState<'CAPITAL_OPENING' | 'BANK_UPI' | 'CASH'>(
    'CAPITAL_OPENING'
  );
  const [supplierName, setSupplierName] = useState<string>('');
  const [invoiceOrBillNo, setInvoiceOrBillNo] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'UNDER_REPAIR' | 'DISPOSED'>('ACTIVE');
  const [notes, setNotes] = useState<string>('');

  // UI states
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<FixedAsset | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [fundingFilter, setFundingFilter] = useState<string>('ALL');

  const resetForm = () => {
    setEditingId(null);
    setAssetCode('');
    setAssetName('');
    setCategory('Equipment');
    setPurchaseDate(todayStr);
    setQuantity('1');
    setCostValue('');
    setDepreciationRatePct('15');
    setAccumulatedDepreciation('0');
    setFundingSource('CAPITAL_OPENING');
    setSupplierName('');
    setInvoiceOrBillNo('');
    setLocation('');
    setSerialNumber('');
    setStatus('ACTIVE');
    setNotes('');
  };

  const handleCategoryChange = (nextCat: string) => {
    setCategory(nextCat);
    const found = FIXED_ASSET_CATEGORIES.find((c) => c.value === nextCat);
    if (found && !editingId) {
      setDepreciationRatePct(String(found.defaultDepRate));
    }
  };

  const handleEditAsset = (fa: FixedAsset) => {
    const gross = Number(fa.costValue ?? fa.purchaseCost ?? 0);
    const accum = Number(fa.accumulatedDepreciation ?? fa.accumulatedDep ?? 0);
    const rate = Number(
      fa.depreciationRatePct ?? fa.depreciationPercent ?? fa.depreciationRatePercent ?? fa.depreciationRate ?? 10
    );
    const src = String(fa.fundingSource || fa.paymentMode || 'CAPITAL_OPENING').toUpperCase();

    setEditingId(fa.id);
    setAssetCode(fa.assetCode || fa.id.toUpperCase());
    setAssetName(fa.assetName || '');
    setCategory(fa.category || 'Equipment');
    setPurchaseDate((fa.purchaseDate || fa.acquisitionDate || todayStr).slice(0, 10));
    setQuantity(String(fa.quantity || 1));
    setCostValue(String(gross));
    setDepreciationRatePct(String(rate));
    setAccumulatedDepreciation(String(accum));
    setFundingSource(
      src === 'CASH' ? 'CASH' : src === 'BANK_UPI' ? 'BANK_UPI' : 'CAPITAL_OPENING'
    );
    setSupplierName(fa.supplierName || '');
    setInvoiceOrBillNo(fa.invoiceOrBillNo || '');
    setLocation(fa.location || '');
    setSerialNumber(fa.serialNumber || '');
    setStatus(fa.status || 'ACTIVE');
    setNotes(fa.notes || '');
    setFeedback(null);
  };

  // Live preview of form depreciation calculations
  const formPreview = useMemo(() => {
    const gross = Math.max(0, r2(Number(costValue || 0)));
    const priorAccum = Math.max(0, Math.min(gross, r2(Number(accumulatedDepreciation || 0))));
    const openWdv = r2(Math.max(0, gross - priorAccum));
    const rate = Math.max(0, Math.min(100, Number(depreciationRatePct || 0)));
    const currentDep = r2((openWdv * rate) / 100);
    const closingNet = r2(Math.max(0, openWdv - currentDep));
    return {
      gross,
      priorAccum,
      openWdv,
      rate,
      currentDep,
      closingNet,
    };
  }, [costValue, accumulatedDepreciation, depreciationRatePct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saveHandler = onSaveFixedAsset || onAddFixedAsset;
    if (!saveHandler) return;

    const cleanName = assetName.trim();
    const gross = r2(Number(costValue || 0));
    if (!cleanName || gross <= 0) {
      setFeedback({
        type: 'error',
        message: 'Please enter a valid Asset Name and Gross Cost Value greater than ₹0.',
      });
      return;
    }

    const rate = Math.max(0, Math.min(100, Number(depreciationRatePct || 0)));
    const accum = Math.max(0, Math.min(gross, r2(Number(accumulatedDepreciation || 0))));
    const openWdv = r2(Math.max(0, gross - accum));
    const currentDep = r2((openWdv * rate) / 100);
    const closingNet = r2(Math.max(0, openWdv - currentDep));
    const finalCode = (assetCode.trim() || suggestedAssetCode).toUpperCase();

    const payload: Omit<FixedAsset, 'id'> & { id?: string } = {
      ...(editingId ? { id: editingId } : {}),
      assetCode: finalCode,
      assetName: cleanName,
      category: category || 'Equipment',
      purchaseDate: purchaseDate || todayStr,
      acquisitionDate: purchaseDate || todayStr,
      costValue: gross,
      purchaseCost: gross,
      depreciationRate: rate,
      depreciationRatePercent: rate,
      depreciationRatePct: rate,
      depreciationPercent: rate,
      accumulatedDep: accum,
      accumulatedDepreciation: accum,
      netBookValue: closingNet,
      fundingSource,
      paymentMode: fundingSource,
      quantity: Math.max(1, parseInt(quantity || '1', 10) || 1),
      supplierName: supplierName.trim(),
      invoiceOrBillNo: invoiceOrBillNo.trim(),
      location: location.trim(),
      serialNumber: serialNumber.trim(),
      status,
      notes: notes.trim(),
    };

    setIsSaving(true);
    setFeedback(null);
    try {
      const ok = await saveHandler(payload);
      if (ok) {
        setFeedback({
          type: 'success',
          message: editingId
            ? `Updated Fixed Asset "${cleanName}" (${finalCode}) directly in Database table public.fixed_assets.`
            : `Saved Fixed Asset "${cleanName}" (${finalCode}) directly to Database table public.fixed_assets.`,
        });
        resetForm();
      } else {
        setFeedback({
          type: 'error',
          message: 'Could not save Fixed Asset to Database. Please verify connection and retry.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error saving Fixed Asset to Database.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteAsset || !onDeleteFixedAsset) return;
    const target = confirmDeleteAsset;
    setDeletingId(target.id);
    setFeedback(null);
    try {
      const ok = await onDeleteFixedAsset(target.id);
      if (ok) {
        if (editingId === target.id) resetForm();
        setFeedback({
          type: 'success',
          message: `Removed "${target.assetName}" (${target.assetCode || target.id}) from Database public.fixed_assets.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Failed to delete Fixed Asset from Database.',
        });
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteAsset(null);
    }
  };

  const handleManualRefresh = async () => {
    if (!onRefreshData || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshData();
      setFeedback({
        type: 'success',
        message: 'Synchronized Fixed Asset Register directly from Database public.fixed_assets table.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Enrich & filter rows
  const enrichedAssets = useMemo(() => {
    return fixedAssets.map((fa) => {
      const grossCost = r2(Number(fa.costValue ?? fa.purchaseCost ?? 0));
      const priorAccumDep = r2(Number(fa.accumulatedDepreciation ?? fa.accumulatedDep ?? 0));
      const depRate = Number(
        fa.depreciationRatePct ??
          fa.depreciationPercent ??
          fa.depreciationRatePercent ??
          fa.depreciationRate ??
          0
      );
      const openWdv = r2(Math.max(0, grossCost - priorAccumDep));
      const periodDep = r2((openWdv * depRate) / 100);
      const closingNet = r2(Math.max(0, openWdv - periodDep));
      const modeRaw = String(fa.fundingSource || fa.paymentMode || 'CAPITAL_OPENING').toUpperCase();
      const mode: 'CAPITAL_OPENING' | 'BANK_UPI' | 'CASH' =
        modeRaw === 'CASH' ? 'CASH' : modeRaw === 'BANK_UPI' ? 'BANK_UPI' : 'CAPITAL_OPENING';

      return {
        ...fa,
        displayCode: (fa.assetCode || fa.id).toUpperCase(),
        displayDate: (fa.purchaseDate || fa.acquisitionDate || '').slice(0, 10),
        grossCost,
        priorAccumDep,
        openWdv,
        depRate,
        periodDep,
        closingNet,
        mode,
        qty: Math.max(1, Number(fa.quantity || 1)),
      };
    });
  }, [fixedAssets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedAssets.filter((fa) => {
      if (categoryFilter !== 'ALL' && fa.category !== categoryFilter) return false;
      if (fundingFilter !== 'ALL' && fa.mode !== fundingFilter) return false;
      if (!q) return true;
      const haystack = [
        fa.displayCode,
        fa.assetName,
        fa.category,
        fa.displayDate,
        fa.supplierName,
        fa.invoiceOrBillNo,
        fa.location,
        fa.serialNumber,
        fa.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enrichedAssets, searchQuery, categoryFilter, fundingFilter]);

  const summary = useMemo(() => {
    let totalUnits = 0;
    let totalGrossCost = 0;
    let totalPriorAccumDep = 0;
    let totalOpenWdv = 0;
    let totalPeriodDep = 0;
    let totalClosingNet = 0;

    filteredAssets.forEach((fa) => {
      totalUnits += fa.qty;
      totalGrossCost = r2(totalGrossCost + fa.grossCost);
      totalPriorAccumDep = r2(totalPriorAccumDep + fa.priorAccumDep);
      totalOpenWdv = r2(totalOpenWdv + fa.openWdv);
      totalPeriodDep = r2(totalPeriodDep + fa.periodDep);
      totalClosingNet = r2(totalClosingNet + fa.closingNet);
    });

    return {
      count: filteredAssets.length,
      totalUnits,
      totalGrossCost,
      totalPriorAccumDep,
      totalOpenWdv,
      totalPeriodDep,
      totalDepreciationToDate: r2(totalPriorAccumDep + totalPeriodDep),
      totalClosingNet,
    };
  }, [filteredAssets]);

  const handleExportCsv = () => {
    const headers = [
      'Asset Code',
      'Asset Name',
      'Category',
      'Acquisition Date',
      'Quantity',
      'Payment / Funding Mode',
      'Supplier / Vendor',
      'Bill / Invoice No',
      'Location',
      'Serial No',
      'Status',
      'Gross Cost (INR)',
      'Prior Accum. Depr. (INR)',
      'Opening WDV (INR)',
      'Depreciation Rate (%)',
      'Current Period Depr. (INR)',
      'Closing Net Book Value (INR)',
      'Remarks',
    ];
    const rows = filteredAssets.map((fa) => [
      fa.displayCode,
      fa.assetName,
      fa.category,
      fa.displayDate,
      String(fa.qty),
      fa.mode,
      fa.supplierName || '',
      fa.invoiceOrBillNo || '',
      fa.location || '',
      fa.serialNumber || '',
      fa.status || 'ACTIVE',
      fa.grossCost.toFixed(2),
      fa.priorAccumDep.toFixed(2),
      fa.openWdv.toFixed(2),
      fa.depRate.toFixed(2),
      fa.periodDep.toFixed(2),
      fa.closingNet.toFixed(2),
      fa.notes || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fixed_Asset_Register_${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_FIXED_ASSETS_TABLE_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const fundingLabel = (mode: 'CAPITAL_OPENING' | 'BANK_UPI' | 'CASH') => {
    if (mode === 'CASH') return 'Cash Drawer';
    if (mode === 'BANK_UPI') return 'Bank / UPI';
    return 'Opening / Capital';
  };

  const fundingBadgeClass = (mode: 'CAPITAL_OPENING' | 'BANK_UPI' | 'CASH') => {
    if (mode === 'CASH') return 'bg-amber-100 text-amber-800 border-amber-300';
    if (mode === 'BANK_UPI') return 'bg-sky-100 text-sky-800 border-sky-300';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  };

  return (
    <div className={embedded ? 'space-y-3.5' : 'max-w-7xl mx-auto px-3 sm:px-5 py-3.5 space-y-3.5'}>
      {/* Compact Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-xl px-4 py-2.5 text-white shadow-sm border border-emerald-500/20 print:bg-white print:text-slate-900 print:border-slate-300 print:shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0 print:hidden" />
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                {society?.name || 'Deganga CADPFSCS Ltd'} — Fixed Asset &amp; Depreciation Register
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wide print:hidden">
                <Database className="w-3 h-3" />
                public.fixed_assets
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/30 text-sky-200 text-[10px] font-semibold print:hidden">
                <ShieldCheck className="w-3 h-3" />
                Direct Database Sync
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate mt-0.5 print:text-slate-600">
              Statutory WDV Fixed Asset Schedule · Saved directly to{' '}
              <code className="text-emerald-300 font-mono-code font-bold print:text-slate-800">
                public.fixed_assets
              </code>{' '}
              (flows to P&amp;L Depreciation &amp; Balance Sheet Net Fixed Assets)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0 print:hidden">
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-colors cursor-pointer"
              title="View Database SQL Schema for public.fixed_assets"
            >
              <Code2 className="w-3 h-3" />
              <span>SQL Table</span>
            </button>

            {onRefreshData && (
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3 text-sky-400" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold transition-colors cursor-pointer"
            >
              <Printer className="w-3 h-3" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold print:hidden ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Compact Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
              Registered Assets
            </div>
            <div className="text-lg font-extrabold text-slate-900 font-mono-code tabular-nums leading-tight mt-0.5">
              {summary.count}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              {summary.totalUnits} Physical {summary.totalUnits === 1 ? 'Unit' : 'Units'}
            </div>
          </div>
          <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
              Gross Block (Cost)
            </div>
            <div className="text-lg font-extrabold text-sky-900 font-mono-code tabular-nums leading-tight mt-0.5">
              ₹{fmt(summary.totalGrossCost)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              Opening WDV: ₹{fmt(summary.totalOpenWdv)}
            </div>
          </div>
          <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <IndianRupee className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 truncate">
              Period Depreciation
            </div>
            <div className="text-lg font-extrabold text-rose-700 font-mono-code tabular-nums leading-tight mt-0.5">
              -₹{fmt(summary.totalPeriodDep)}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              Prior Depr.: ₹{fmt(summary.totalPriorAccumDep)}
            </div>
          </div>
          <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Calculator className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="bg-white rounded-xl border border-emerald-300 px-3 py-2 shadow-2xs bg-gradient-to-br from-emerald-50/60 to-white flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 truncate">
              Net Block (Book Value)
            </div>
            <div className="text-lg font-extrabold text-emerald-800 font-mono-code tabular-nums leading-tight mt-0.5">
              ₹{fmt(summary.totalClosingNet)}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium truncate">
              Flows to Balance Sheet
            </div>
          </div>
          <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {/* Add / Edit Fixed Asset Entry Card */}
      {(onSaveFixedAsset || onAddFixedAsset) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden print:hidden">
          <div className="px-4 py-2.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {editingId ? (
                <Pencil className="w-4 h-4 text-amber-400" />
              ) : (
                <Plus className="w-4 h-4 text-emerald-400" />
              )}
              <h3 className="text-sm font-extrabold tracking-wide uppercase">
                {editingId
                  ? `Edit Fixed Asset Record (${assetCode || editingId})`
                  : 'New Fixed Asset Entry (Saves Directly to Database fixed_assets Table)'}
              </h3>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Edit</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            {/* Row 1: Core Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  <span>Asset Code / Tag</span>
                </label>
                <input
                  type="text"
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                  placeholder={suggestedAssetCode}
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg font-mono-code font-bold text-slate-900 uppercase"
                />
              </div>

              <div className="lg:col-span-4">
                <label className="font-bold text-slate-700 block mb-1">
                  Asset Name / Description <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g. Digital Platform Weighing Scale 100Kg"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="font-bold text-slate-700 block mb-1">
                  Asset Category <span className="text-rose-600">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                >
                  {FIXED_ASSET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Acquisition Date *</span>
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-semibold text-slate-900"
                />
              </div>

              <div className="lg:col-span-1">
                <label className="font-bold text-slate-700 block mb-1">Qty</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-bold text-center text-slate-900"
                />
              </div>
            </div>

            {/* Row 2: Valuation, Depreciation & Funding */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-3">
                <label className="font-bold text-slate-700 block mb-1">
                  Gross Original Cost Value (₹) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={costValue}
                  onChange={(e) => setCostValue(e.target.value)}
                  placeholder="25000.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-extrabold text-slate-900 text-sm"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="font-bold text-slate-700 block mb-1">
                  Prior / Opening Accum. Depr. (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={accumulatedDepreciation}
                  onChange={(e) => setAccumulatedDepreciation(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-semibold text-slate-900"
                />
              </div>

              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Depr. Rate (% p.a.)</label>
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 40].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setDepreciationRatePct(String(r))}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold cursor-pointer ${
                          Number(depreciationRatePct) === r
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={depreciationRatePct}
                  onChange={(e) => setDepreciationRatePct(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code font-bold text-slate-900"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="font-bold text-slate-700 block mb-1">
                  Payment / Funding Source
                </label>
                <select
                  value={fundingSource}
                  onChange={(e) =>
                    setFundingSource(
                      e.target.value as 'CAPITAL_OPENING' | 'BANK_UPI' | 'CASH'
                    )
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                >
                  <option value="CAPITAL_OPENING">
                    Opening Balance / Society Capital Fund
                  </option>
                  <option value="BANK_UPI">Paid via Bank / Cheque / UPI</option>
                  <option value="CASH">Paid via Store Cash Drawer</option>
                </select>
              </div>
            </div>

            {/* Row 3: Bill No, Supplier, Location, Serial No, Status & Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Bill / Invoice No.</span>
                </label>
                <input
                  type="text"
                  value={invoiceOrBillNo}
                  onChange={(e) => setInvoiceOrBillNo(e.target.value)}
                  placeholder="e.g. INV/25-26/108"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code text-slate-900"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="font-bold text-slate-700 block mb-1">
                  Supplier / Vendor Name
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Bengal Agro Equipments"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Location / Godown</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. COUNTER-01 / Godown"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  Serial / Model No.
                </label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. SN-99412"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-code text-slate-900"
                />
              </div>

              <div className="lg:col-span-1">
                <label className="font-bold text-slate-700 block mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as 'ACTIVE' | 'UNDER_REPAIR' | 'DISPOSED'
                    )
                  }
                  className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="UNDER_REPAIR">Repair</option>
                  <option value="DISPOSED">Disposed</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">Remarks / Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Warranty / audit notes"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>

            {/* Row 4: Live Depreciation Preview & Submit Button */}
            <div className="pt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                <div className="text-[11px]">
                  <span className="text-slate-500 font-semibold">Gross Cost:</span>{' '}
                  <span className="font-mono-code font-bold text-slate-900">
                    ₹{fmt(formPreview.gross)}
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <div className="text-[11px]">
                  <span className="text-slate-500 font-semibold">Opening WDV:</span>{' '}
                  <span className="font-mono-code font-bold text-sky-800">
                    ₹{fmt(formPreview.openWdv)}
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <div className="text-[11px]">
                  <span className="text-slate-500 font-semibold">
                    Current Depr. ({formPreview.rate}%):
                  </span>{' '}
                  <span className="font-mono-code font-bold text-rose-700">
                    -₹{fmt(formPreview.currentDep)}
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <div className="text-[11px]">
                  <span className="text-slate-500 font-semibold">Closing Net Book Value:</span>{' '}
                  <span className="font-mono-code font-extrabold text-emerald-700">
                    ₹{fmt(formPreview.closingNet)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white font-extrabold shadow-sm cursor-pointer"
                >
                  {editingId ? (
                    <>
                      <Pencil className="w-4 h-4" />
                      <span>{isSaving ? 'Updating in Database...' : 'Update Asset in Database'}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>{isSaving ? 'Saving to Database...' : 'Save Asset to Database'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Register Table & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Statutory Fixed Assets Register &amp; WDV Depreciation Schedule
            </h3>
            <p className="text-xs text-slate-500">
              Showing {filteredAssets.length} of {fixedAssets.length} records from Database table{' '}
              <code className="font-mono-code font-bold text-slate-700">public.fixed_assets</code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search code, asset, bill, location..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
            >
              <option value="ALL">All Categories</option>
              {FIXED_ASSET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>

            <select
              value={fundingFilter}
              onChange={(e) => setFundingFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
            >
              <option value="ALL">All Funding Modes</option>
              <option value="CAPITAL_OPENING">Opening / Capital</option>
              <option value="BANK_UPI">Bank / UPI</option>
              <option value="CASH">Cash Drawer</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3 whitespace-nowrap">Asset Code</th>
                <th className="px-3.5 py-3">Asset Name &amp; Particulars</th>
                <th className="px-3 py-3 whitespace-nowrap">Category</th>
                <th className="px-3 py-3 whitespace-nowrap">Acq. Date</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Qty</th>
                <th className="px-3 py-3 whitespace-nowrap">Funding Mode</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Gross Cost (₹)</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Prior Depr. (₹)</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Opening WDV (₹)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Rate (%)</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Period Depr. (₹)</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Net Book Value (₹)</th>
                <th className="px-3 py-3 text-center whitespace-nowrap print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.map((fa) => (
                <tr
                  key={fa.id}
                  className={`hover:bg-slate-50/90 transition-colors ${
                    editingId === fa.id ? 'bg-amber-50/70' : ''
                  }`}
                >
                  <td className="px-3.5 py-3 font-mono-code font-bold text-slate-800 whitespace-nowrap">
                    {fa.displayCode}
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span>{fa.assetName}</span>
                      {fa.status && fa.status !== 'ACTIVE' && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            fa.status === 'UNDER_REPAIR'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {fa.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {(fa.invoiceOrBillNo ||
                      fa.supplierName ||
                      fa.location ||
                      fa.serialNumber ||
                      fa.notes) && (
                      <div className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        {fa.invoiceOrBillNo && (
                          <span>
                            <strong className="text-slate-600">Bill:</strong> {fa.invoiceOrBillNo}
                          </span>
                        )}
                        {fa.supplierName && (
                          <span>
                            <strong className="text-slate-600">Vendor:</strong> {fa.supplierName}
                          </span>
                        )}
                        {fa.location && (
                          <span>
                            <strong className="text-slate-600">Loc:</strong> {fa.location}
                          </span>
                        )}
                        {fa.serialNumber && (
                          <span>
                            <strong className="text-slate-600">S/N:</strong> {fa.serialNumber}
                          </span>
                        )}
                        {fa.notes && <span className="italic text-slate-500">“{fa.notes}”</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      {fa.category}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono-code text-slate-600 whitespace-nowrap">
                    {fa.displayDate || '—'}
                  </td>
                  <td className="px-3 py-3 text-center font-mono-code font-bold text-slate-700">
                    {fa.qty}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${fundingBadgeClass(
                        fa.mode
                      )}`}
                    >
                      {fundingLabel(fa.mode)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code font-semibold text-slate-800 whitespace-nowrap">
                    ₹{fmt(fa.grossCost)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code text-slate-600 whitespace-nowrap">
                    ₹{fmt(fa.priorAccumDep)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code font-semibold text-sky-900 whitespace-nowrap">
                    ₹{fmt(fa.openWdv)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono-code font-bold text-slate-700 whitespace-nowrap">
                    {fa.depRate}%
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code font-bold text-rose-700 whitespace-nowrap">
                    -₹{fmt(fa.periodDep)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code font-extrabold text-emerald-700 whitespace-nowrap">
                    ₹{fmt(fa.closingNet)}
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap print:hidden">
                    <div className="inline-flex items-center gap-1">
                      {(onSaveFixedAsset || onAddFixedAsset) && (
                        <button
                          type="button"
                          onClick={() => handleEditAsset(fa)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                          title="Edit Fixed Asset"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteFixedAsset && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAsset(fa)}
                          disabled={deletingId === fa.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Fixed Asset from Database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-1">
                      <div className="font-bold text-slate-600 text-sm">
                        No Fixed Assets Recorded Yet in Database (public.fixed_assets)
                      </div>
                      <p className="text-xs text-slate-400">
                        Use the Fixed Asset Entry form above to register society equipment, computers, godown racks, or buildings directly into the Database.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {filteredAssets.length > 0 && (
              <tfoot className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-800">
                <tr>
                  <td colSpan={4} className="px-3.5 py-3 uppercase tracking-wider text-[11px]">
                    Total Fixed Assets Schedule ({summary.count}{' '}
                    {summary.count === 1 ? 'Asset' : 'Assets'})
                  </td>
                  <td className="px-3 py-3 text-center font-mono-code">{summary.totalUnits}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3.5 py-3 text-right font-mono-code whitespace-nowrap">
                    ₹{fmt(summary.totalGrossCost)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code text-slate-300 whitespace-nowrap">
                    ₹{fmt(summary.totalPriorAccumDep)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code text-sky-300 whitespace-nowrap">
                    ₹{fmt(summary.totalOpenWdv)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono-code text-slate-400">—</td>
                  <td className="px-3.5 py-3 text-right font-mono-code text-rose-300 whitespace-nowrap">
                    -₹{fmt(summary.totalPeriodDep)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-mono-code text-emerald-300 whitespace-nowrap">
                    ₹{fmt(summary.totalClosingNet)}
                  </td>
                  <td className="px-3 py-3 print:hidden" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteAsset && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  Delete Fixed Asset from Database?
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  This will permanently delete{' '}
                  <strong className="text-slate-800">{confirmDeleteAsset.assetName}</strong> (
                  <code className="font-mono-code">
                    {confirmDeleteAsset.assetCode || confirmDeleteAsset.id}
                  </code>
                  ) from the <code className="font-mono-code">public.fixed_assets</code> table in Database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteAsset(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAsset(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer"
              >
                {deletingId ? 'Deleting...' : 'Delete from Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database SQL Schema Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 max-w-2xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-extrabold uppercase tracking-wide text-emerald-300">
                  Database Table Schema: public.fixed_assets
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              The <code className="text-emerald-300 font-mono-code">public.fixed_assets</code> table is live and connected in your Database. Below is the exact PostgreSQL schema used by this Fixed Asset Register:
            </p>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono-code text-emerald-300 overflow-x-auto leading-relaxed">
              {SUPABASE_FIXED_ASSETS_TABLE_SQL}
            </pre>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                All entries save directly to Database with zero temporary or local files.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied SQL</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
