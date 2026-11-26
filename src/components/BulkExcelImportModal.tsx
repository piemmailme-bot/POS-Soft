// TEMPORARY FEATURE: Bulk Excel Category & Product Importer.
// Can be cleanly removed when user discontinues this feature.
import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FolderPlus,
  PackagePlus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Product } from '../types';

export interface BulkImportRowInput {
  category: string;
  name: string;
}

export interface BulkImportSummary {
  addedCategories: number;
  createdCount: number;
  resetCount: number;
}

interface ParsedPreviewRow {
  rowNumber: number;
  category: string;
  name: string;
  isNewCategory: boolean;
  matchedProduct?: Product;
}

interface SkippedRowInfo {
  rowNumber: number;
  rawCategory: string;
  rawName: string;
  reason: string;
}

interface BulkExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  categories: string[];
  onBulkImport: (rows: BulkImportRowInput[]) => Promise<BulkImportSummary>;
}

export const BulkExcelImportModal: React.FC<BulkExcelImportModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  categories,
  onBulkImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [includeExistingInSheet1, setIncludeExistingInSheet1] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedPreviewRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRowInfo[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportSummary | null>(null);

  const canonicalCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      const clean = (cat || '').trim();
      if (clean && clean !== 'All Items') {
        map.set(clean.toLowerCase(), clean);
      }
    });
    existingProducts.forEach((p) => {
      const clean = (p.category || '').trim();
      if (clean && !map.has(clean.toLowerCase())) {
        map.set(clean.toLowerCase(), clean);
      }
    });
    return map;
  }, [categories, existingProducts]);

  const existingProductByNameMap = useMemo(() => {
    const map = new Map<string, Product>();
    existingProducts.forEach((p) => {
      const key = (p.name || '').trim().toLowerCase();
      if (key) map.set(key, p);
    });
    return map;
  }, [existingProducts]);

  const stats = useMemo(() => {
    const newCatSet = new Set<string>();
    let newProductsCount = 0;
    let matchedResetCount = 0;

    parsedRows.forEach((row) => {
      if (row.isNewCategory) {
        newCatSet.add(row.category.toLowerCase());
      }
      if (row.matchedProduct) {
        matchedResetCount++;
      } else {
        newProductsCount++;
      }
    });

    return {
      totalValid: parsedRows.length,
      newCategoriesCount: newCatSet.size,
      newProductsCount,
      matchedResetCount,
      newCategoryNames: Array.from(
        new Map(
          parsedRows
            .filter((r) => r.isNewCategory)
            .map((r) => [r.category.toLowerCase(), r.category])
        ).values()
      ),
    };
  }, [parsedRows]);

  if (!isOpen) return null;

  const resetUploadState = () => {
    setSelectedFileName('');
    setParsedRows([]);
    setSkippedRows([]);
    setParseError(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCloseModal = () => {
    if (isImporting) return;
    resetUploadState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Clean entry sheet (Product Category + Product Name)
    const sheet1Data: (string | number)[][] = [['Product Category', 'Product Name']];
    if (includeExistingInSheet1) {
      existingProducts.forEach((p) => {
        sheet1Data.push([p.category || '', p.name || '']);
      });
    } else {
      // Leave clean blank rows ready for typing, or existing categories note in Sheet 2
      sheet1Data.push(['', '']);
    }

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1['!cols'] = [{ wch: 32 }, { wch: 46 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Category_And_Products');

    // Sheet 2: Instructions & Existing Catalog Reference
    const sheet2Data: (string | number)[][] = [
      ['BULK CATEGORY & PRODUCT IMPORT GUIDE (TEMPORARY TOOL)'],
      ['Rule 1', 'Enter "Product Category" in Column A and "Product Name" in Column B of Sheet 1 ("Category_And_Products").'],
      ['Rule 2', 'Any new category name will be added automatically to the society catalog.'],
      ['Rule 3', 'For new products, Barcode is auto-assigned and Unit Type, Initial Stock, Min Alert Level, Batch/Details, Purchase Price, Selling Price WD GST, GST %, and Selling Price WT GST default to ZERO (0).'],
      ['Rule 4', 'If a Product Name matches an existing product in the catalog, its Category updates to Sheet 1 and all other details (Unit, Stock, Alert, Details, Pricing & Cost) are adjusted to ZERO (0).'],
      [''],
      ['EXISTING CATEGORIES IN CATALOG', 'EXISTING PRODUCT NAMES', 'CURRENT BARCODE', 'CURRENT UNIT', 'CURRENT STOCK', 'SELLING PRICE (₹)'],
    ];

    const maxRefRows = Math.max(categories.length, existingProducts.length);
    for (let i = 0; i < maxRefRows; i++) {
      const cat = categories[i] || '';
      const prod = existingProducts[i];
      sheet2Data.push([
        cat,
        prod ? prod.name : '',
        prod ? prod.barcode : '',
        prod ? prod.unit : '',
        prod ? prod.stock : '',
        prod ? prod.sellingPrice : '',
      ]);
    }

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2['!cols'] = [
      { wch: 32 },
      { wch: 38 },
      { wch: 18 },
      { wch: 14 },
      { wch: 15 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions_And_Reference');

    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Deganga_Bulk_Product_Import_${dateStamp}.xlsx`);
  };

  const processUploadedFile = async (file: File) => {
    setParseError(null);
    setImportResult(null);
    setSelectedFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setParseError('The uploaded Excel file does not contain any worksheet.');
        setParsedRows([]);
        setSkippedRows([]);
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!matrix || matrix.length === 0) {
        setParseError('No data rows found in the first worksheet.');
        setParsedRows([]);
        setSkippedRows([]);
        return;
      }

      // Detect header indices from first non-empty row
      let catColIdx = 0;
      let nameColIdx = 1;
      let startRowIdx = 0;

      const firstRow = matrix[0].map((cell) => String(cell ?? '').trim().toLowerCase());
      const detectedCatIdx = firstRow.findIndex(
        (h) => h === 'product category' || h === 'category' || h.includes('category')
      );
      const detectedNameIdx = firstRow.findIndex(
        (h) => h === 'product name' || h === 'product' || h === 'name' || h.includes('product name')
      );

      if (detectedCatIdx !== -1 || detectedNameIdx !== -1) {
        catColIdx = detectedCatIdx !== -1 ? detectedCatIdx : 0;
        nameColIdx = detectedNameIdx !== -1 ? detectedNameIdx : catColIdx === 0 ? 1 : 0;
        startRowIdx = 1;
      }

      const validMap = new Map<string, ParsedPreviewRow>();
      const skipped: SkippedRowInfo[] = [];

      for (let i = startRowIdx; i < matrix.length; i++) {
        const row = matrix[i] || [];
        const rawCategory = String(row[catColIdx] ?? '').trim();
        const rawName = String(row[nameColIdx] ?? '').trim();

        if (!rawCategory && !rawName) {
          continue;
        }

        if (!rawCategory || !rawName) {
          skipped.push({
            rowNumber: i + 1,
            rawCategory,
            rawName,
            reason: !rawCategory ? 'Missing Product Category' : 'Missing Product Name',
          });
          continue;
        }

        const canonicalCat = canonicalCategoryMap.get(rawCategory.toLowerCase());
        const finalCategory = canonicalCat || rawCategory;
        const isNewCategory = !canonicalCat;
        const matchedProduct = existingProductByNameMap.get(rawName.toLowerCase());

        const dedupKey = rawName.toLowerCase();
        if (validMap.has(dedupKey)) {
          skipped.push({
            rowNumber: i + 1,
            rawCategory: finalCategory,
            rawName,
            reason: 'Duplicate Product Name in sheet (latest kept)',
          });
        }

        validMap.set(dedupKey, {
          rowNumber: i + 1,
          category: finalCategory,
          name: matchedProduct ? matchedProduct.name : rawName,
          isNewCategory,
          matchedProduct,
        });
      }

      const validList = Array.from(validMap.values());
      if (validList.length === 0) {
        setParseError(
          'No valid Product Category + Product Name rows found. Fill Column A (Product Category) and Column B (Product Name).'
        );
      }

      setParsedRows(validList);
      setSkippedRows(skipped);
    } catch (err: any) {
      console.error('Excel parse error:', err);
      setParseError(
        err?.message || 'Unable to read this file. Please upload a valid .xlsx, .xls, or .csv sheet.'
      );
      setParsedRows([]);
      setSkippedRows([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0 || isImporting) return;
    setIsImporting(true);
    try {
      const result = await onBulkImport(
        parsedRows.map((r) => ({ category: r.category, name: r.name }))
      );
      setImportResult(result);
    } catch (err: any) {
      setParseError(err?.message || 'Failed to apply bulk import.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-base">
                Bulk Excel Import — Categories &amp; Product Names
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40">
                Temporary Setup Tool
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Download Excel sheet, fill Category &amp; Product Names at one go — all other fields default or adjust to ZERO (0)
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition-all cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Download Excel Sheet */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <span>Step 1 · Download Excel Sheet (.xlsx)</span>
                </h4>
                <p className="text-xs text-emerald-800 mt-1">
                  Enter only <strong>Product Category</strong> and <strong>Product Name</strong> in Sheet 1.
                  Unit Type, Initial Stock, Min Alert Level, Product Details, Purchase Price, Selling Prices, and GST Charge % will all be set to <strong>0</strong>.
                  Matched existing products will also be adjusted to <strong>0</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Excel Sheet (.xlsx)</span>
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-emerald-900 font-medium cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={includeExistingInSheet1}
                onChange={(e) => setIncludeExistingInSheet1(e.target.checked)}
                className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Pre-fill existing catalog products into Sheet 1 (Note: re-uploading existing names resets their unit, stock &amp; pricing to 0)
              </span>
            </label>
          </div>

          {/* Step 2: Upload Excel Sheet */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Step 2 · Upload Filled Excel Sheet (.xlsx / .xls / .csv)
              </h4>
              {selectedFileName && (
                <button
                  type="button"
                  onClick={resetUploadState}
                  disabled={isImporting}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear File</span>
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/70'
                  : 'border-slate-300 hover:border-emerald-400 bg-slate-50/60 hover:bg-emerald-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
              {selectedFileName ? (
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedFileName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click or drop another Excel file to replace preview
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to select or drag &amp; drop your filled Excel file here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports .xlsx, .xls, and .csv with columns: Product Category, Product Name
                  </p>
                </div>
              )}
            </div>

            {parseError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* Import Result Banner */}
          {importResult && (
            <div className="p-4 rounded-2xl bg-emerald-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-100 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-extrabold text-sm">Bulk Import Completed Successfully</h4>
                  <p className="text-xs text-emerald-50 mt-0.5">
                    Added <strong>{importResult.addedCategories}</strong> new categories, created{' '}
                    <strong>{importResult.createdCount}</strong> new products (all details set to 0),
                    and adjusted <strong>{importResult.resetCount}</strong> matched existing products to 0.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-extrabold shrink-0 cursor-pointer"
              >
                Done &amp; Return
              </button>
            </div>
          )}

          {/* Step 3: Live Preview */}
          {parsedRows.length > 0 && !importResult && (
            <div className="space-y-4">
              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Valid Rows
                  </span>
                  <span className="text-xl font-extrabold font-mono-code text-slate-900">
                    {stats.totalValid}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <span className="text-[10px] font-bold uppercase text-indigo-700 flex items-center gap-1">
                    <FolderPlus className="w-3 h-3" />
                    New Categories
                  </span>
                  <span className="text-xl font-extrabold font-mono-code text-indigo-900">
                    {stats.newCategoriesCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                    <PackagePlus className="w-3 h-3" />
                    New Products (= 0)
                  </span>
                  <span className="text-xl font-extrabold font-mono-code text-emerald-900">
                    {stats.newProductsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-700 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Existing → Zeroed
                  </span>
                  <span className="text-xl font-extrabold font-mono-code text-amber-900">
                    {stats.matchedResetCount}
                  </span>
                </div>
              </div>

              {stats.newCategoryNames.length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs">
                  <span className="font-bold text-indigo-900 mr-2">
                    New Categories to Create:
                  </span>
                  <div className="inline-flex flex-wrap gap-1.5 mt-1">
                    {stats.newCategoryNames.map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 font-semibold text-[11px]"
                      >
                        + {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {stats.matchedResetCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>{stats.matchedResetCount}</strong> product(s) matched existing catalog entries.
                    Confirming will adjust their Unit Type, Stock, Alert Level, Product Details, Purchase Price, Selling Prices, and GST % to <strong>ZERO (0)</strong>.
                  </span>
                </div>
              )}

              {skippedRows.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs">
                  <span className="font-bold">Skipped / Duplicate Rows ({skippedRows.length}): </span>
                  <span className="text-slate-600">
                    {skippedRows
                      .slice(0, 5)
                      .map((s) => `Row ${s.rowNumber} (${s.reason})`)
                      .join(', ')}
                    {skippedRows.length > 5 ? ` +${skippedRows.length - 5} more` : ''}
                  </span>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Product Category</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Import Action</th>
                        <th className="py-2.5 px-3 text-right">Applied Defaults</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parsedRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.name}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono-code text-slate-500">
                            #{row.rowNumber}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-slate-800">{row.category}</span>
                            {row.isNewCategory && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                NEW CAT
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">{row.name}</td>
                          <td className="py-2 px-3">
                            {row.matchedProduct ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                MATCHED EXISTING → ZERO
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                NEW PRODUCT (0)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-code text-[11px] text-slate-500">
                            Unit: 0 · Stock: 0 · Cost/Price/GST: 0
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0 gap-3">
          <div className="text-xs text-slate-500">
            {parsedRows.length > 0 && !importResult
              ? `Ready to process ${parsedRows.length} item(s) (${stats.newProductsCount} new, ${stats.matchedResetCount} matched reset to 0).`
              : 'Upload a filled Excel sheet above to preview before saving.'}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={isImporting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg cursor-pointer"
            >
              {importResult ? 'Close' : 'Cancel'}
            </button>
            {!importResult && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={parsedRows.length === 0 || isImporting}
                className="px-5 py-2.5 bg-slate-900 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow transition-all cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing &amp; Syncing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>
                      Import {parsedRows.length > 0 ? `${parsedRows.length} Rows` : 'Sheet'} (Defaults = 0)
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
