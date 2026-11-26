import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Table2,
  RefreshCw,
  Search,
  Download,
  X,
  Copy,
  Check,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { authFetch } from '../utils/api';

interface TableOverviewItem {
  name: string;
  count: number;
  ok: boolean;
  source: string;
  error: string | null;
}

interface TableOverviewResponse {
  source: string;
  connected: boolean;
  tables: TableOverviewItem[];
  fetchedAt: string;
}

interface TableRowsResponse {
  tableName: string;
  source: string;
  totalCount: number;
  columns: string[];
  rows: Record<string, any>[];
  fetchedAt: string;
  error?: string;
}

interface CellInspectorState {
  column: string;
  rowIndex: number;
  value: any;
  fullRow: Record<string, any>;
}

const TABLE_LABELS: Record<string, { label: string; hint: string }> = {
  products: { label: 'products', hint: 'Inventory items, HSN, pricing & GST' },
  'Invoice Analytics': { label: 'Invoice Analytics', hint: 'POS invoice records & details' },
  sale_transactions: { label: 'sale_transactions', hint: 'Line-item sales ledger' },
  purchase_transactions: { label: 'purchase_transactions', hint: 'Purchase & stock fill entries' },
  gst_payments: { label: 'gst_payments', hint: 'Govt GST Challan PMT-06 payments' },
  account_vouchers: { label: 'account_vouchers', hint: 'Salary, Expense, Income & Contra vouchers' },
  party_accounts: { label: 'party_accounts', hint: 'Suppliers (Creditors) & Members (Debtors)' },
  return_notes: { label: 'return_notes', hint: 'Sales Credit Notes & Purchase Debit Notes' },
  fixed_assets: { label: 'fixed_assets', hint: 'Fixed Assets & Depreciation Register' },
  drawer_closings: { label: 'drawer_closings', hint: 'Daily Cash Drawer Z-Report Closings' },
  cashiers: { label: 'cashiers', hint: 'Staff & admin accounts' },
  admin_settings: { label: 'admin_settings', hint: 'Store & accounting policies' },
  categories: { label: 'categories', hint: 'Product categories' },
  audit_logs: { label: 'audit_logs', hint: 'Security & admin activity trail' },
  loose_packets: { label: 'loose_packets', hint: 'Weighted loose packet barcodes' },
};

function formatCellPreview(val: unknown): { text: string; isLongOrJson: boolean; isNumeric: boolean; isNull: boolean; isBoolean: boolean } {
  if (val === null || val === undefined) {
    return { text: 'NULL', isLongOrJson: false, isNumeric: false, isNull: true, isBoolean: false };
  }
  if (typeof val === 'boolean') {
    return { text: val ? 'TRUE' : 'FALSE', isLongOrJson: false, isNumeric: false, isNull: false, isBoolean: true };
  }
  if (typeof val === 'number') {
    return { text: String(val), isLongOrJson: false, isNumeric: true, isNull: false, isBoolean: false };
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val);
    return {
      text: jsonStr.length > 56 ? `${jsonStr.slice(0, 56)}…` : jsonStr,
      isLongOrJson: true,
      isNumeric: false,
      isNull: false,
      isBoolean: false,
    };
  }
  const str = String(val);
  return {
    text: str.length > 64 ? `${str.slice(0, 64)}…` : str,
    isLongOrJson: str.length > 64,
    isNumeric: false,
    isNull: false,
    isBoolean: false,
  };
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const raw = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${raw.replace(/"/g, '""')}"`;
}

interface DatabaseTableViewerProps {
  refreshNonce?: number;
}

export const DatabaseTableViewer: React.FC<DatabaseTableViewerProps> = ({ refreshNonce = 0 }) => {
  const [tablesOverview, setTablesOverview] = useState<TableOverviewItem[]>([]);
  const [dbSource, setDbSource] = useState<string>('Checking database...');
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [selectedTable, setSelectedTable] = useState<string>('products');
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);

  const [loadingTables, setLoadingTables] = useState<boolean>(true);
  const [loadingRows, setLoadingRows] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [inspector, setInspector] = useState<CellInspectorState | null>(null);
  const [copiedInspector, setCopiedInspector] = useState<boolean>(false);

  const loadOverview = async () => {
    setLoadingTables(true);
    try {
      const res = await authFetch('/api/admin/db-tables', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load table list');
      const data: TableOverviewResponse = await res.json();
      setTablesOverview(data.tables || []);
      setDbSource(data.source || 'Supabase PostgreSQL');
      setDbConnected(Boolean(data.connected));
      return data.tables || [];
    } catch (e: any) {
      setErrorMsg(e?.message || 'Unable to connect to database');
      return [];
    } finally {
      setLoadingTables(false);
    }
  };

  const loadTableRows = async (tableName: string) => {
    if (!tableName) return;
    setLoadingRows(true);
    setErrorMsg(null);
    try {
      const res = await authFetch(`/api/admin/db-tables/${encodeURIComponent(tableName)}`, {
        cache: 'no-store',
      });
      const data: TableRowsResponse = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to load table "${tableName}"`);
      }
      setTableData(data);
    } catch (e: any) {
      setTableData(null);
      setErrorMsg(e?.message || `Error reading table "${tableName}"`);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await loadOverview();
      if (!active) return;
      const initial = list.length > 0 ? list[0].name : 'products';
      setSelectedTable(initial);
      await loadTableRows(initial);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (refreshNonce > 0) {
      loadOverview();
      loadTableRows(selectedTable);
    }
  }, [refreshNonce]);

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    setSearchTerm('');
    setInspector(null);
    loadTableRows(tableName);
  };

  const handleRefresh = async () => {
    await Promise.all([loadOverview(), loadTableRows(selectedTable)]);
  };

  const filteredRows = useMemo(() => {
    const rows = tableData?.rows || [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        const text = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return text.toLowerCase().includes(q);
      })
    );
  }, [tableData, searchTerm]);

  const handleExportCsv = () => {
    if (!tableData || tableData.columns.length === 0) return;
    const cols = tableData.columns;
    const csvLines = [
      cols.map((c) => escapeCsvCell(c)).join(','),
      ...filteredRows.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = tableData.tableName.replace(/[^a-zA-Z0-9_-]+/g, '_');
    a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyInspector = async () => {
    if (!inspector) return;
    const text =
      typeof inspector.value === 'object'
        ? JSON.stringify(inspector.value, null, 2)
        : String(inspector.value ?? '');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInspector(true);
      setTimeout(() => setCopiedInspector(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const activeMeta = TABLE_LABELS[selectedTable] || { label: selectedTable, hint: 'Database table' };
  const fetchedTimeText = tableData?.fetchedAt
    ? new Date(tableData.fetchedAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-800 shrink-0" />
            <h3 className="font-extrabold text-base text-slate-900">
              Live Database Table Explorer
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
            <span className={dbConnected ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
              {dbSource}
            </span>
            <span aria-hidden="true">·</span>
            <span>{tablesOverview.length || 8} tables</span>
            {tableData && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-code tabular-nums text-slate-700 font-semibold">
                  {activeMeta.label}: {tableData.totalCount} rows · {tableData.columns.length} columns
                </span>
              </>
            )}
            {fetchedTimeText && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-code tabular-nums">Fetched {fetchedTimeText}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loadingRows}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRows ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!tableData || filteredRows.length === 0}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: Sidebar + Data Grid */}
      <div className="flex flex-col lg:flex-row min-h-[540px]">
        {/* Left Sidebar: Individual Table Selector */}
        <aside className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/40 p-3">
          <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Select Table</span>
            <span className="font-mono-code tabular-nums">{tablesOverview.length}</span>
          </div>

          {/* Mobile horizontal pills / Desktop vertical list */}
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
            {loadingTables && tablesOverview.length === 0 ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-11 bg-slate-200/70 rounded-xl animate-pulse shrink-0 w-44 lg:w-full" />
              ))
            ) : (
              tablesOverview.map((tbl) => {
                const isSelected = selectedTable === tbl.name;
                const info = TABLE_LABELS[tbl.name] || { label: tbl.name, hint: '' };
                return (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => handleSelectTable(tbl.name)}
                    className={`text-left px-3 py-2.5 rounded-xl transition-colors flex items-center justify-between gap-2 shrink-0 lg:w-full cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Table2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold font-mono-code truncate">{info.label}</span>
                      </div>
                      {info.hint && (
                        <div className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {info.hint}
                        </div>
                      )}
                    </div>

                    <span
                      className={`text-[11px] font-mono-code tabular-nums font-bold shrink-0 ${
                        !tbl.ok
                          ? 'text-rose-500'
                          : isSelected
                          ? 'text-emerald-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {tbl.ok ? tbl.count : 'ERR'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Table Viewport */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Table Search & Filter Bar */}
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Filter rows in "${activeMeta.label}"...`}
                className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-mono-code tabular-nums shrink-0">
              {loadingRows ? (
                <span>Loading records...</span>
              ) : (
                <span>
                  Showing <strong className="text-slate-900">{filteredRows.length}</strong> of{' '}
                  <strong className="text-slate-900">{tableData?.rows.length || 0}</strong> rows
                </span>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="m-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Data Grid */}
          {loadingRows ? (
            <div className="p-4 space-y-2.5">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !errorMsg && (!tableData || tableData.rows.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <Table2 className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                Table "{activeMeta.label}" has 0 rows
              </p>
              <p className="text-xs text-slate-500 mt-1">
                New records saved to the database will appear here immediately.
              </p>
            </div>
          ) : !errorMsg && filteredRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <Search className="w-7 h-7 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                No rows match "{searchTerm}"
              </p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Clear Filter
              </button>
            </div>
          ) : !errorMsg && tableData ? (
            <div className="overflow-auto max-h-[540px] flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 font-mono-code text-[11px] font-bold text-slate-500 border-r border-slate-200 whitespace-nowrap w-12 text-right">
                      #
                    </th>
                    {tableData.columns.map((col) => (
                      <th
                        key={col}
                        className="py-2.5 px-3 font-mono-code text-[11px] font-bold text-slate-700 border-r border-slate-200 last:border-r-0 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 font-mono-code text-[11px] font-bold text-slate-500 whitespace-nowrap text-center">
                      Row
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-mono-code tabular-nums text-[11px] text-slate-400 border-r border-slate-100 text-right whitespace-nowrap">
                        {rowIdx + 1}
                      </td>
                      {tableData.columns.map((col) => {
                        const rawVal = row[col];
                        const preview = formatCellPreview(rawVal);
                        return (
                          <td
                            key={col}
                            className={`py-2 px-3 border-r border-slate-100 last:border-r-0 whitespace-nowrap max-w-[260px] truncate ${
                              preview.isNumeric
                                ? 'font-mono-code tabular-nums text-slate-900 text-right'
                                : preview.isNull
                                ? 'font-mono-code text-slate-400 italic'
                                : preview.isBoolean
                                ? 'font-mono-code font-bold text-slate-700'
                                : 'text-slate-800'
                            }`}
                          >
                            {preview.isLongOrJson ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setInspector({
                                    column: col,
                                    rowIndex: rowIdx + 1,
                                    value: rawVal,
                                    fullRow: row,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 text-left text-blue-700 hover:text-blue-900 font-mono-code underline decoration-blue-300 cursor-pointer"
                                title="Click to inspect full JSON / text"
                              >
                                <span className="truncate max-w-[210px]">{preview.text}</span>
                              </button>
                            ) : (
                              <span>{preview.text}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setInspector({
                              column: 'Full Row JSON',
                              rowIndex: rowIdx + 1,
                              value: row,
                              fullRow: row,
                            })
                          }
                          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors cursor-pointer"
                          title="Inspect full row"
                          aria-label={`Inspect row ${rowIdx + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal: Cell / Row JSON Inspector */}
      {inspector && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-bold text-sm truncate">
                  {activeMeta.label} · Row #{inspector.rowIndex} · {inspector.column}
                </h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyInspector}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedInspector ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedInspector ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspector(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Close inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-950 text-slate-100 max-h-[70vh] overflow-auto">
              <pre className="text-xs font-mono-code whitespace-pre-wrap break-words leading-relaxed">
                {typeof inspector.value === 'object' && inspector.value !== null
                  ? JSON.stringify(inspector.value, null, 2)
                  : String(inspector.value ?? 'NULL')}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
