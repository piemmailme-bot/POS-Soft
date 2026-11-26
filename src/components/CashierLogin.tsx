import React, { useEffect, useState } from 'react';
import {
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Store,
  ArrowRight,
  AlertCircle,
  ShieldAlert,
  BookOpen,
  Mail,
  PhoneCall,
} from 'lucide-react';
import { CashierUser, SocietyProfile, AdminStoreSettings } from '../types';
import { getTransactionMode } from '../utils/transactionControl';
import { ResetPasswordModal } from './ResetPasswordModal';
import { setSessionToken, fetchWithWakeupRetry } from '../utils/api';

interface CashierLoginProps {
  cashiers: CashierUser[];
  onLoginSuccess: (cashier: CashierUser, counter: string) => void;
  society: SocietyProfile;
  adminSettings?: AdminStoreSettings;
  onPasswordUpdated: (updatedCashier: CashierUser) => void;
  sessionNotice?: string | null;
}

const AUTOFILL_STORAGE_KEY = 'nabkul_autofill_login_v1';

export const ALLOWED_EXTERNAL_LINK_EMAILS: readonly string[] = [
  'piemmailme@gmail.com',
  'cadpfscsltd@gmail.com',
];

export const UNAUTHORIZED_ACCESS_MESSAGE =
  'Sorry You are Not Authorised to open This, please connect with 7602496460.';

function isAllowedExternalEmail(rawEmail?: string | null): boolean {
  const normalized = String(rawEmail || '').trim().toLowerCase();
  if (!normalized) return false;
  return ALLOWED_EXTERNAL_LINK_EMAILS.includes(normalized);
}

interface SavedCredentialSlot {
  email?: string;
  loginId?: string;
  password?: string;
  selectedCounter?: string;
}

interface SavedAutofillLogin {
  loginMode?: 'cashier' | 'admin';
  email?: string;
  loginId?: string;
  password?: string;
  selectedCounter?: string;
  remember?: boolean;
  byMode?: Partial<Record<'cashier' | 'admin', SavedCredentialSlot>>;
  byAccount?: Record<string, SavedCredentialSlot>;
}

function loadSavedAutofill(): SavedAutofillLogin {
  try {
    const raw = localStorage.getItem(AUTOFILL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as SavedAutofillLogin;
  } catch {
    // ignore storage read errors
  }
  return {};
}

export const CashierLogin: React.FC<CashierLoginProps> = ({
  cashiers,
  onLoginSuccess,
  society,
  adminSettings,
  onPasswordUpdated,
  sessionNotice,
}) => {
  const savedAutofill = React.useMemo(() => loadSavedAutofill(), []);
  const initialMode: 'cashier' | 'admin' =
    savedAutofill.loginMode === 'admin' ? 'admin' : 'cashier';
  const initialModeSlot = savedAutofill.byMode?.[initialMode];

  const [rememberLogin, setRememberLogin] = useState<boolean>(savedAutofill.remember !== false);
  const [loginMode, setLoginMode] = useState<'cashier' | 'admin'>(initialMode);
  const [email, setEmail] = useState(
    savedAutofill.email || initialModeSlot?.email || 'piemmailme@gmail.com'
  );
  const [loginId, setLoginId] = useState(savedAutofill.loginId || initialModeSlot?.loginId || '');
  const [password, setPassword] = useState(savedAutofill.password || initialModeSlot?.password || '');
  const [selectedCounter, setSelectedCounter] = useState(
    savedAutofill.selectedCounter || initialModeSlot?.selectedCounter || 'COUNTER-01 (KOL-NORTH)'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(sessionNotice || null);
  const [isUnauthorizedEmail, setIsUnauthorizedEmail] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const persistAutofill = (
    nextMode: 'cashier' | 'admin',
    nextEmail: string,
    nextLoginId: string,
    nextPassword: string,
    nextCounter: string
  ) => {
    try {
      if (rememberLogin) {
        const existing = loadSavedAutofill();
        const trimmedEmail = nextEmail.trim().toLowerCase();
        const trimmedLoginId = nextLoginId.trim();
        const accountKey = `${nextMode}:${trimmedLoginId.toLowerCase()}`;
        const slot: SavedCredentialSlot = {
          email: trimmedEmail,
          loginId: trimmedLoginId,
          password: nextPassword,
          selectedCounter: nextCounter,
        };
        const payload: SavedAutofillLogin = {
          loginMode: nextMode,
          email: trimmedEmail,
          loginId: trimmedLoginId,
          password: nextPassword,
          selectedCounter: nextCounter,
          remember: true,
          byMode: {
            ...(existing.byMode || {}),
            [nextMode]: slot,
          },
          byAccount: {
            ...(existing.byAccount || {}),
            ...(trimmedLoginId ? { [accountKey]: slot } : {}),
          },
        };
        localStorage.setItem(AUTOFILL_STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(AUTOFILL_STORAGE_KEY);
      }
    } catch {
      // ignore storage write errors
    }
  };

  useEffect(() => {
    if (sessionNotice) {
      setErrorMessage(sessionNotice);
    }
  }, [sessionNotice]);

  // Cashier staff list EXCLUDES system administrators
  const cashierStaffList = cashiers.filter(
    (c) => c.role !== 'System Admin' && c.role !== 'Developer' && c.loginId !== 'admin'
  );

  const defaultAdmin = cashiers.find(
    (c) => (c.loginId || '').toLowerCase() === 'admin' || c.role === 'System Admin'
  );
  const defaultAdminId = defaultAdmin?.loginId || 'admin';
  const defaultAdminCounter = defaultAdmin?.assignedCounter || 'ADMIN DESK (CENTRAL)';

  // Ensure Login ID is never left blank on initial load if cashiers list is available
  useEffect(() => {
    if (loginId.trim()) return;
    if (loginMode === 'admin') {
      setLoginId(defaultAdminId);
      setSelectedCounter(defaultAdminCounter);
    } else if (cashierStaffList.length > 0) {
      setLoginId(cashierStaffList[0].loginId);
      setSelectedCounter(cashierStaffList[0].assignedCounter);
    }
  }, [cashiers.length, loginMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!isAllowedExternalEmail(trimmedEmail)) {
      setIsUnauthorizedEmail(true);
      setErrorMessage(UNAUTHORIZED_ACCESS_MESSAGE);
      return;
    }

    setIsUnauthorizedEmail(false);
    setIsLoading(true);
    try {
      const res = await fetchWithWakeupRetry(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail,
            loginId: loginId.trim(),
            password,
            mode: loginMode,
          }),
        },
        2
      );
      const data = await res.json();
      if (res.ok && data.success && data.cashier && data.token) {
        const resolvedCounter = data.cashier.assignedCounter || selectedCounter;
        persistAutofill(
          loginMode,
          trimmedEmail,
          loginId.trim(),
          password,
          resolvedCounter
        );
        setSessionToken(data.token);
        onLoginSuccess(data.cashier, resolvedCounter);
        return;
      }
      if (res.status === 403 && data.unauthorizedEmail) {
        setIsUnauthorizedEmail(true);
      }
      setErrorMessage(
        data.message ||
          (loginMode === 'admin'
            ? 'Invalid Administrator credentials.'
            : 'Invalid Cashier credentials.')
      );
    } catch {
      setErrorMessage(
        'Server verification is required to sign in. Please check connection.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFillCashier = (cashier: CashierUser) => {
    const latest = loadSavedAutofill();
    const accountSlot = latest.byAccount?.[`cashier:${cashier.loginId.toLowerCase()}`];
    setLoginId(cashier.loginId);
    setSelectedCounter(cashier.assignedCounter);
    if (accountSlot?.email && isAllowedExternalEmail(accountSlot.email)) {
      setEmail(accountSlot.email);
    }
    setPassword(accountSlot?.password || '');
    setIsUnauthorizedEmail(false);
    setErrorMessage(null);
  };

  const switchMode = (nextMode: 'cashier' | 'admin') => {
    const latest = loadSavedAutofill();
    const modeSlot = latest.byMode?.[nextMode];
    setLoginMode(nextMode);
    setIsUnauthorizedEmail(false);
    setErrorMessage(null);
    if (modeSlot?.email && isAllowedExternalEmail(modeSlot.email)) {
      setEmail(modeSlot.email);
    }

    if (nextMode === 'admin') {
      const nextId = modeSlot?.loginId || defaultAdminId;
      const accountSlot = latest.byAccount?.[`admin:${nextId.toLowerCase()}`];
      setLoginId(nextId);
      setPassword(modeSlot?.password ?? accountSlot?.password ?? '');
      setSelectedCounter(modeSlot?.selectedCounter || defaultAdminCounter);
    } else {
      const firstCashier = cashierStaffList[0];
      const nextId = modeSlot?.loginId || (firstCashier ? firstCashier.loginId : '');
      const accountSlot = nextId ? latest.byAccount?.[`cashier:${nextId.toLowerCase()}`] : undefined;
      setLoginId(nextId);
      setPassword(modeSlot?.password ?? accountSlot?.password ?? '');
      setSelectedCounter(
        modeSlot?.selectedCounter || (firstCashier ? firstCashier.assignedCounter : 'COUNTER-01 (KOL-NORTH)')
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-2.5 sm:p-4">
      <div className="w-full max-w-[490px]">
        {/* Compact Cooperative Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-[#171a1f] border-2 border-amber-400/50 overflow-hidden flex items-center justify-center shadow-lg shadow-black/50 flex-shrink-0">
            {!logoFailed ? (
              <img
                src="/assets/society-logo.png"
                alt={`${society.name} Logo`}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-cover object-center scale-[1.07]"
              />
            ) : (
              <Store className="w-6 h-6 text-blue-300" />
            )}
          </div>
          <div className="text-left">
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
              {society.name}
            </h1>
            <p className="text-[11px] text-blue-300 font-semibold leading-snug">
              Village : Berachampa · Dist. North 24 Parganas
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header styling */}
          {loginMode === 'admin' ? (
            <div className="bg-slate-900 text-white px-5 py-2.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-xs sm:text-sm text-white leading-tight">Administrator Portal</h3>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Cashier registry &amp; security management
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded text-amber-300 border border-amber-500/30">
                Admin
              </span>
            </div>
          ) : (
            <div className="bg-blue-800 text-white px-5 py-2.5 flex items-center justify-between border-b border-blue-900">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-blue-200" />
                <div>
                  <h3 className="font-bold text-xs sm:text-sm text-white leading-tight">Cashier Staff Sign In</h3>
                  <p className="text-[10px] text-blue-200 leading-tight">
                    Point of Sale &amp; Billing Register
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-900/80 px-2 py-0.5 rounded text-blue-200 border border-blue-700/50">
                Counter Staff
              </span>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="px-5 pt-3">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => switchMode('cashier')}
                className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  loginMode === 'cashier'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Cashier</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('admin')}
                className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  loginMode === 'admin'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          <div className="px-5 py-3.5 space-y-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {loginMode === 'admin' ? 'Administrator Login' : 'Open POS Register'}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Restricted external link access — only specified authorized email IDs can open this portal.
              </p>
            </div>

            {(() => {
              const txMode = getTransactionMode(adminSettings);
              if (txMode === 'BOTH') return null;
              return (
                <div
                  className={`p-2 border rounded-lg text-[11px] font-semibold flex items-center gap-2 ${
                    txMode === 'STOP_ALL'
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : txMode === 'ONLY_SELL'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-indigo-50 border-indigo-300 text-indigo-900'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {txMode === 'STOP_ALL' &&
                      `Notice: All Store Transactions are halted (${adminSettings?.haltReason || 'All transactions on hold'}).`}
                    {txMode === 'ONLY_SELL' &&
                      'Notice: Only Sell mode active — POS billing open, Stock Purchases paused.'}
                    {txMode === 'ONLY_PURCHASE' &&
                      'Notice: Only Purchase mode active — Stock Purchases open, POS sales paused.'}
                  </span>
                </div>
              );
            })()}

            {isUnauthorizedEmail ? (
              <div className="p-3.5 bg-rose-50 border-2 border-rose-400 rounded-xl text-rose-950 space-y-2 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-extrabold text-rose-900 uppercase tracking-wide">
                      Restricted External Link Access
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-rose-800 leading-snug">
                      {UNAUTHORIZED_ACCESS_MESSAGE}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-rose-200/80">
                  <a
                    href="tel:7602496460"
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-rose-900 bg-rose-200/80 hover:bg-rose-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-rose-700" />
                    <span>Connect: 7602496460</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnauthorizedEmail(false);
                      setErrorMessage(null);
                    }}
                    className="text-[11px] font-bold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              errorMessage && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-[11px] text-rose-800 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )
            )}

            <form onSubmit={handleLogin} autoComplete="on" className="space-y-2.5">
              {/* External Link Access Email ID (restricted to the 3 allowed emails) */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1"
                >
                  Allowed Access Email ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    list="allowed-external-emails"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (isUnauthorizedEmail) {
                        setIsUnauthorizedEmail(false);
                        setErrorMessage(null);
                      }
                    }}
                    placeholder="Enter allowed Email ID"
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    required
                  />
                  <datalist id="allowed-external-emails">
                    <option value="piemmailme@gmail.com" />
                    <option value="piem@anudip.org" />
                    <option value="cadpfscsltd@gmail.com" />
                  </datalist>
                </div>
              </div>

              {/* Cashier / Admin ID */}
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1"
                >
                  {loginMode === 'admin' ? 'Administrator ID' : 'Cashier ID / Staff Code'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder={loginMode === 'admin' ? 'e.g. admin' : 'e.g. subrata or priya'}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider"
                  >
                    {loginMode === 'admin'
                      ? 'Master Admin Password'
                      : 'Password / Access PIN'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(true)}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Reset Password</span>
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      loginMode === 'admin'
                        ? 'Enter admin password...'
                        : 'Enter your cashier PIN...'
                    }
                    className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono-code"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Autofill Checkbox */}
              <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberLogin(checked);
                    if (!checked) {
                      try {
                        localStorage.removeItem(AUTOFILL_STORAGE_KEY);
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Remember Login ID &amp; Password (auto-fill)</span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-2.5 active:scale-[0.99] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                  loginMode === 'admin'
                    ? 'bg-slate-900 hover:bg-slate-800 shadow-slate-950/20'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/20'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Verifying Authorization...</span>
                  </span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>
                      {loginMode === 'admin'
                        ? 'Unlock Administrator Console'
                        : 'Unlock Register & Start Billing'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Cashier Staff Logins (compact grid) */}
            {loginMode === 'cashier' && cashierStaffList.length > 0 && (
              <div className="pt-2.5 border-t border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Active Cashier Staff (Click to Autofill ID):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {cashierStaffList.map((cashier) => (
                    <button
                      key={cashier.id}
                      type="button"
                      onClick={() => handleQuickFillCashier(cashier)}
                      className="p-2 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 flex items-center justify-between text-left transition-colors group cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-900 group-hover:text-blue-700 truncate">
                          {cashier.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono-code truncate">
                          ID: <strong className="text-slate-700">{cashier.loginId}</strong>
                        </div>
                      </div>
                      <span className="text-[9px] font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded flex-shrink-0 ml-1">
                        {cashier.staffCode}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* In Admin Mode */}
            {loginMode === 'admin' && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-1 text-amber-900">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>Authorized Executive Login (ID: {defaultAdminId})</span>
                  </div>
                  <div className="text-[10px] text-amber-800">
                    Restricted to authorized external link email IDs.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const latest = loadSavedAutofill();
                    const adminSlot =
                      latest.byMode?.admin ||
                      latest.byAccount?.[`admin:${defaultAdminId.toLowerCase()}`];
                    setLoginId(adminSlot?.loginId || defaultAdminId);
                    if (adminSlot?.email && isAllowedExternalEmail(adminSlot.email)) {
                      setEmail(adminSlot.email);
                    }
                    setPassword(adminSlot?.password || '');
                    setSelectedCounter(adminSlot?.selectedCounter || defaultAdminCounter);
                    setIsUnauthorizedEmail(false);
                    setErrorMessage(null);
                  }}
                  className="text-[10px] font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-2 py-1 rounded-md flex-shrink-0 cursor-pointer"
                >
                  Autofill Login
                </button>
              </div>
            )}
          </div>

          {/* Footer security banner & portal links */}
          <div className="bg-slate-50 px-5 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-blue-600" />
                <span>Restricted External Link</span>
              </span>
              <a
                href="/api/user-guide/download"
                download="Deganga_CADPFSCS_User_Guide.docx"
                className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-semibold"
                title="Download New User Guide in Microsoft Word (.docx) format"
              >
                <BookOpen className="w-3 h-3" />
                <span>User Guide (.docx)</span>
              </a>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              Support: 7602497460
            </span>
          </div>
        </div>
      </div>

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        cashiers={cashiers}
        initialAccountType={loginMode === 'admin' ? 'admin' : 'user'}
        initialLoginId={loginId}
        onPasswordUpdated={(updated) => {
          onPasswordUpdated(updated);
          if ((updated.loginId || '').toLowerCase() === loginId.trim().toLowerCase()) {
            setPassword('');
          }
          setErrorMessage(null);
        }}
      />
    </div>
  );
};
