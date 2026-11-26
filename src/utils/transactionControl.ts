import { AdminStoreSettings, TransactionControlMode } from '../types';

export function getTransactionMode(settings?: AdminStoreSettings | null): TransactionControlMode {
  if (!settings) return 'BOTH';
  if (
    settings.transactionMode === 'STOP_ALL' ||
    settings.transactionMode === 'ONLY_SELL' ||
    settings.transactionMode === 'ONLY_PURCHASE' ||
    settings.transactionMode === 'BOTH'
  ) {
    return settings.transactionMode;
  }
  return settings.transactionsEnabled === false ? 'STOP_ALL' : 'BOTH';
}

export function isSellEnabled(settings?: AdminStoreSettings | null): boolean {
  const mode = getTransactionMode(settings);
  return mode === 'BOTH' || mode === 'ONLY_SELL';
}

export function isPurchaseEnabled(settings?: AdminStoreSettings | null): boolean {
  const mode = getTransactionMode(settings);
  return mode === 'BOTH' || mode === 'ONLY_PURCHASE';
}

export interface TransactionModeOption {
  mode: TransactionControlMode;
  label: string;
  shortLabel: string;
  description: string;
  defaultHaltReason: string;
}

export const TRANSACTION_MODE_OPTIONS: TransactionModeOption[] = [
  {
    mode: 'STOP_ALL',
    label: 'Stop Transaction',
    shortLabel: 'Stop Transaction',
    description: 'Freeze all POS sales billing and all stock/product purchases',
    defaultHaltReason: 'All sell and purchase transactions stopped by Society Administrator.',
  },
  {
    mode: 'ONLY_SELL',
    label: 'Only Sell',
    shortLabel: 'Only Sell',
    description: 'Allow POS billing & sales only; stop new stock/product purchases',
    defaultHaltReason: 'Only Sell mode active — stock purchases are paused by Administrator.',
  },
  {
    mode: 'ONLY_PURCHASE',
    label: 'Only Purchase',
    shortLabel: 'Only Purchase',
    description: 'Allow stock/product purchases only; stop POS billing & customer sales',
    defaultHaltReason: 'Only Purchase mode active — POS sales are paused by Administrator.',
  },
  {
    mode: 'BOTH',
    label: 'Both',
    shortLabel: 'Both (Sell & Purchase)',
    description: 'Full store operation: both Sell and Purchase transactions allowed',
    defaultHaltReason: '',
  },
];

export function getTransactionModeMeta(mode: TransactionControlMode): TransactionModeOption {
  return TRANSACTION_MODE_OPTIONS.find((opt) => opt.mode === mode) || TRANSACTION_MODE_OPTIONS[3];
}
