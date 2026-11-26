import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  User,
  ShieldAlert,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react';
import { CashierUser } from '../types';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashiers: CashierUser[];
  initialAccountType?: 'user' | 'admin';
  initialLoginId?: string;
  lockAccountType?: boolean;
  onPasswordUpdated: (updatedCashier: CashierUser) => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  cashiers,
  initialAccountType = 'user',
  initialLoginId = '',
  lockAccountType = false,
  onPasswordUpdated,
}) => {
  const [accountType, setAccountType] = useState<'user' | 'admin'>(initialAccountType);
  const [loginId, setLoginId] = useState(initialLoginId);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const adminAccounts = useMemo(
    () =>
      cashiers.filter(
        (c) => c.role === 'System Admin' || (c.loginId || '').toLowerCase() === 'admin'
      ),
    [cashiers]
  );

  const userAccounts = useMemo(
    () =>
      cashiers.filter(
        (c) => c.role !== 'System Admin' && (c.loginId || '').toLowerCase() !== 'admin'
      ),
    [cashiers]
  );

  const visibleAccounts = accountType === 'admin' ? adminAccounts : userAccounts;

  useEffect(() => {
    if (!isOpen) return;
    setAccountType(initialAccountType);
    if (initialLoginId) {
      setLoginId(initialLoginId);
    } else if (initialAccountType === 'admin') {
      setLoginId(adminAccounts[0]?.loginId || 'admin');
    } else {
      setLoginId(userAccounts[0]?.loginId || '');
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [isOpen, initialAccountType, initialLoginId]);

  if (!isOpen) return null;

  const handleSwitchType = (nextType: 'user' | 'admin') => {
    if (lockAccountType) return;
    setAccountType(nextType);
    setErrorMsg(null);
    setSuccessMsg(null);
    const list = nextType === 'admin' ? adminAccounts : userAccounts;
    setLoginId(list[0]?.loginId || (nextType === 'admin' ? 'admin' : ''));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedId = loginId.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedId) {
      setErrorMsg('Please select or enter a valid Login ID.');
      return;
    }
    if (!currentPassword) {
      setErrorMsg('Please enter your existing password / PIN.');
      return;
    }
    if (trimmedNew.length < 4) {
      setErrorMsg('New password must be at least 4 characters long.');
      return;
    }
    if (trimmedNew === currentPassword) {
      setErrorMsg('New password must be different from your existing password.');
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      setErrorMsg('New password and Confirm password do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: trimmedId,
          currentPassword,
          newPassword: trimmedNew,
          accountType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Could not reset password. Please check your existing password.');
        return;
      }

      if (data.updatedCashier) {
        onPasswordUpdated(data.updatedCashier);
      } else {
        const localMatch = cashiers.find(
          (c) => (c.loginId || '').toLowerCase() === trimmedId.toLowerCase()
        );
        if (localMatch) {
          onPasswordUpdated({ ...localMatch, passwordHash: trimmedNew });
        }
      }

      setSuccessMsg(data.message || `Password updated successfully for "${trimmedId}".`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while updating password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Reset Existing Password</h3>
              <p className="text-[11px] text-slate-400">
                Verify existing password &amp; set a new credential
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close reset password window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {/* Account Category Switcher: User vs Admin */}
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Account Type
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                disabled={lockAccountType && accountType !== 'user'}
                onClick={() => handleSwitchType('user')}
                className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                  accountType === 'user'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Cashier / User</span>
              </button>

              <button
                type="button"
                disabled={lockAccountType && accountType !== 'admin'}
                onClick={() => handleSwitchType('admin')}
                className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                  accountType === 'admin'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Administrator</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-start gap-2 text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">{successMsg}</div>
                <div className="text-[11px] text-emerald-700">
                  Saved to database. You can now sign in with the new password.
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Account Selection */}
            {visibleAccounts.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {accountType === 'admin' ? 'Select Administrator Account' : 'Select Cashier / User Account'}
                </label>
                <select
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {visibleAccounts.map((acc) => (
                    <option key={acc.id} value={acc.loginId}>
                      {acc.name} ({acc.loginId} · {acc.staffCode})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Login ID Input (editable for staff code / direct entry) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                {accountType === 'admin' ? 'Administrator Login ID' : 'User Login ID / Staff Code'}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder={accountType === 'admin' ? 'e.g. admin' : 'e.g. subrata or priya'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono-code font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Existing Password */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Existing Password / PIN
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password..."
                  className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono-code focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                New Password / PIN (Min 4 characters)
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono-code focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  minLength={4}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Confirm New Password / PIN
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password..."
                  className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono-code focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  minLength={4}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                {successMsg ? 'Done' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-4 py-2 text-white font-bold rounded-xl shadow flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                  accountType === 'admin'
                    ? 'bg-slate-900 hover:bg-slate-800'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
