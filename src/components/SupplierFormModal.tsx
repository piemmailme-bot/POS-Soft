import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Building2,
  Save,
  AlertCircle,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  User,
  Phone,
  MapPin,
  Wallet,
  FileText,
} from 'lucide-react';
import { OpeningBalanceType, PartyAccount, SupplierCategory } from '../types';
import {
  checkDuplicateSupplier,
  generateNextSupplierCode,
  INDIAN_STATES,
  SUPPLIER_CATEGORIES,
} from '../utils/supplierLedger';
import { getIstDateStr } from '../utils/dateUtils';

export interface SupplierSaveResult {
  success: boolean;
  error?: string;
  party?: PartyAccount;
}

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingSuppliers: PartyAccount[];
  supplierToEdit?: PartyAccount | null;
  onSaveSupplier: (supplier: PartyAccount) => Promise<SupplierSaveResult>;
  onSavedCallback?: (saved: PartyAccount) => void;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  existingSuppliers,
  supplierToEdit,
  onSaveSupplier,
  onSavedCallback,
}) => {
  const isEditing = Boolean(supplierToEdit);

  const [supplierCode, setSupplierCode] = useState('');
  const [name, setName] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<SupplierCategory>('Distributor');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('West Bengal');
  const [pinCode, setPinCode] = useState('');
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [openingBalanceType, setOpeningBalanceType] = useState<OpeningBalanceType>('PAYABLE');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountDetails, setBankAccountDetails] = useState('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [remarks, setRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track which modal open session we already initialized so parent re-renders never wipe user input
  const initializedSessionKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedSessionKeyRef.current = null;
      return;
    }

    const sessionKey = supplierToEdit ? `edit:${supplierToEdit.id}` : 'new';
    if (initializedSessionKeyRef.current === sessionKey) {
      return;
    }
    initializedSessionKeyRef.current = sessionKey;

    setErrorMsg(null);
    setIsSaving(false);

    if (supplierToEdit) {
      setSupplierCode(
        (supplierToEdit.supplierCode || generateNextSupplierCode(existingSuppliers)).toUpperCase()
      );
      setName((supplierToEdit.name || '').toUpperCase());
      setSupplierCategory(supplierToEdit.supplierCategory || 'Distributor');
      setContactPerson((supplierToEdit.contactPerson || '').toUpperCase());
      setPhone(supplierToEdit.phone || '');
      setAlternatePhone(supplierToEdit.alternatePhone || '');
      setEmail((supplierToEdit.email || '').toLowerCase());
      setGstin((supplierToEdit.gstin || '').toUpperCase());
      setPan((supplierToEdit.pan || '').toUpperCase());
      setAddress((supplierToEdit.address || supplierToEdit.villageOrAddress || '').toUpperCase());
      setStateName((supplierToEdit.state || 'WEST BENGAL').toUpperCase());
      setPinCode(supplierToEdit.pinCode || '');
      setOpeningBalance(String(supplierToEdit.openingBalance ?? 0));
      setOpeningBalanceType(
        supplierToEdit.openingBalanceType === 'ADVANCE' ? 'ADVANCE' : 'PAYABLE'
      );
      setBankName((supplierToEdit.bankName || '').toUpperCase());
      setBankAccountNo((supplierToEdit.bankAccountNo || '').toUpperCase());
      setBankIfsc((supplierToEdit.bankIfsc || '').toUpperCase());
      setBankBranch((supplierToEdit.bankBranch || '').toUpperCase());
      setBankAccountDetails((supplierToEdit.bankAccountDetails || '').toUpperCase());
      setIsActive(supplierToEdit.isActive !== false);
      setRemarks((supplierToEdit.remarks || supplierToEdit.notes || '').toUpperCase());
    } else {
      setSupplierCode(generateNextSupplierCode(existingSuppliers).toUpperCase());
      setName('');
      setSupplierCategory('Distributor');
      setContactPerson('');
      setPhone('');
      setAlternatePhone('');
      setEmail('');
      setGstin('');
      setPan('');
      setAddress('');
      setStateName('WEST BENGAL');
      setPinCode('');
      setOpeningBalance('0');
      setOpeningBalanceType('PAYABLE');
      setBankName('');
      setBankAccountNo('');
      setBankIfsc('');
      setBankBranch('');
      setBankAccountDetails('');
      setIsActive(true);
      setRemarks('');
    }
  }, [isOpen, supplierToEdit, existingSuppliers]);

  const duplicateCheck = useMemo(() => {
    if (!isOpen) return { isDuplicate: false };
    return checkDuplicateSupplier(
      {
        id: supplierToEdit?.id || '__new__',
        partyType: 'SUPPLIER',
        supplierCode,
        name,
        phone,
        gstin,
        pan,
      },
      existingSuppliers
    );
  }, [isOpen, supplierToEdit?.id, supplierCode, name, phone, gstin, pan, existingSuppliers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim().toUpperCase();
    if (!trimmedName) {
      setErrorMsg('Company / Supplier Name is required.');
      return;
    }

    const trimmedPhone = phone.trim().toUpperCase();
    if (!trimmedPhone) {
      setErrorMsg('Mobile Number is required.');
      return;
    }
    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    const trimmedGstin = gstin.trim().toUpperCase();
    if (trimmedGstin && trimmedGstin.length !== 15) {
      setErrorMsg('GSTIN must be 15 characters (or leave blank if unregistered).');
      return;
    }

    const trimmedPan = pan.trim().toUpperCase();
    if (trimmedPan && trimmedPan.length !== 10) {
      setErrorMsg('PAN number must be 10 characters (or leave blank).');
      return;
    }

    const trimmedPin = pinCode.trim();
    if (trimmedPin && !/^\d{6}$/.test(trimmedPin)) {
      setErrorMsg('PIN Code must be a 6-digit number (or leave blank).');
      return;
    }

    const openBalNum = Number(openingBalance || 0);
    if (!Number.isFinite(openBalNum) || openBalNum < 0) {
      setErrorMsg('Opening Balance must be 0 or a positive number.');
      return;
    }

    if (duplicateCheck.isDuplicate) {
      setErrorMsg(duplicateCheck.message || 'Duplicate supplier record detected.');
      return;
    }

    const upperBankName = bankName.trim().toUpperCase();
    const upperBankAcc = bankAccountNo.trim().toUpperCase();
    const upperBankIfsc = bankIfsc.trim().toUpperCase();
    const upperBankBranch = bankBranch.trim().toUpperCase();
    const upperRemarks = remarks.trim().toUpperCase();

    const combinedBankSummary =
      bankAccountDetails.trim().toUpperCase() ||
      [
        upperBankName,
        upperBankAcc ? `A/C: ${upperBankAcc}` : '',
        upperBankIfsc ? `IFSC: ${upperBankIfsc}` : '',
        upperBankBranch ? `BRANCH: ${upperBankBranch}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

    const payload: PartyAccount = {
      id: supplierToEdit?.id || `sup-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      partyType: 'SUPPLIER',
      supplierCode: supplierCode.trim().toUpperCase() || generateNextSupplierCode(existingSuppliers),
      supplierCategory,
      name: trimmedName,
      contactPerson: contactPerson.trim().toUpperCase(),
      phone: trimmedPhone,
      alternatePhone: alternatePhone.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
      gstin: trimmedGstin,
      pan: trimmedPan,
      address: address.trim().toUpperCase(),
      state: stateName.trim().toUpperCase(),
      pinCode: trimmedPin,
      openingBalance: Number(openBalNum.toFixed(2)),
      openingBalanceType,
      bankName: upperBankName,
      bankAccountNo: upperBankAcc,
      bankIfsc: upperBankIfsc,
      bankBranch: upperBankBranch,
      bankAccountDetails: combinedBankSummary,
      isActive,
      remarks: upperRemarks,
      notes: upperRemarks,
      createdAt: supplierToEdit?.createdAt || getIstDateStr(),
    };

    setIsSaving(true);
    try {
      const result = await onSaveSupplier(payload);
      if (!result.success) {
        setErrorMsg(result.error || 'Could not save supplier to Database. Please retry.');
        setIsSaving(false);
        return;
      }
      if (onSavedCallback && result.party) {
        onSavedCallback(result.party);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error while saving supplier.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[93vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base truncate">
                {isEditing ? 'Edit Supplier / Company Record' : 'Register New Supplier / Company'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Maintain verified vendor profiles for Purchase Entry, GST ITC &amp; Supplier Ledger
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {(errorMsg || duplicateCheck.isDuplicate) && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg || duplicateCheck.message}</span>
            </div>
          )}

          {/* Section 1: Supplier Identity & Classification */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Supplier Identity &amp; Status</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-mono-code font-extrabold">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Supplier ID: {supplierCode}</span>
                <span className="text-[9.5px] font-sans font-bold text-blue-600 bg-white px-1.5 py-0.2 rounded border border-blue-200">
                  Auto-Generated
                </span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Company / Supplier Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  placeholder="e.g. IFFCO COOPERATIVE AGRO DEPOT"
                  className="w-full px-3 py-2 text-xs font-semibold uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  required
                  autoFocus
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Supplier Category *
                </label>
                <select
                  value={supplierCategory}
                  onChange={(e) => setSupplierCategory(e.target.value as SupplierCategory)}
                  className="w-full px-3 py-2 text-xs font-semibold uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                >
                  {SUPPLIER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Supplier Status *
                </label>
                <select
                  value={isActive ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(e) => setIsActive(e.target.value === 'ACTIVE')}
                  className={`w-full px-3 py-2 text-xs font-bold uppercase border rounded-lg focus:outline-none focus:ring-2 ${
                    isActive
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 focus:ring-emerald-500'
                      : 'bg-rose-50 border-rose-300 text-rose-900 focus:ring-rose-500'
                  }`}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Tax Registration */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>2. Contact &amp; Statutory Tax Details</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Contact Person Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value.toUpperCase())}
                    placeholder="e.g. SUBHASHIS MONDAL"
                    className="w-full pl-8 pr-3 py-2 text-xs uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 text-xs font-mono-code font-bold uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Alternate Contact Number
                </label>
                <input
                  type="tel"
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value.toUpperCase())}
                  placeholder="Optional landline / alternate"
                  className="w-full px-3 py-2 text-xs font-mono-code uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                  placeholder="vendor@company.com"
                  className="w-full px-3 py-2 text-xs lowercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  GSTIN Number (Optional)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => {
                    setGstin(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  placeholder="e.g. 19AABCI1234F1Z5"
                  className="w-full px-3 py-2 text-xs font-mono-code font-bold uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  PAN Number (Optional)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => {
                    setPan(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  placeholder="e.g. AABCI1234F"
                  className="w-full px-3 py-2 text-xs font-mono-code font-bold uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Full Address, State & PIN Code */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>3. Full Address, State &amp; PIN Code</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Full Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value.toUpperCase())}
                  placeholder="Building, Street, Market / Town, District"
                  className="w-full px-3 py-2 text-xs uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  State
                </label>
                <select
                  value={
                    INDIAN_STATES.some((st) => st.toUpperCase() === stateName.toUpperCase())
                      ? stateName.toUpperCase()
                      : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') setStateName(e.target.value.toUpperCase());
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st.toUpperCase()}>
                      {st.toUpperCase()}
                    </option>
                  ))}
                  {!INDIAN_STATES.some((st) => st.toUpperCase() === stateName.toUpperCase()) &&
                    stateName && <option value="__custom__">{stateName.toUpperCase()}</option>}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="743423"
                  className="w-full px-3 py-2 text-xs font-mono-code font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Opening Balance & Balance Type */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
            <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-amber-700" />
              <span>4. Opening Ledger Balance</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Opening Balance (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono-code font-extrabold bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Opening Balance Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOpeningBalanceType('PAYABLE')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      openingBalanceType === 'PAYABLE'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50'
                    }`}
                  >
                    PAYABLE (CREDIT DUE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpeningBalanceType('ADVANCE')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      openingBalanceType === 'ADVANCE'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                    }`}
                  >
                    ADVANCE (PREPAID)
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-amber-900/80">
              <strong>Payable</strong> = Society owes this opening amount to the supplier (Sundry Creditor).{' '}
              <strong>Advance</strong> = Society has already paid this advance to the supplier (Available Advance).
            </p>
          </div>

          {/* Section 5: Bank Account Details (Optional) & Remarks */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-sky-600" />
              <span>5. Bank Account Details (Optional) &amp; Remarks</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value.toUpperCase())}
                  placeholder="e.g. STATE BANK OF INDIA / INDIAN BANK"
                  className="w-full px-3 py-1.5 text-xs uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value.toUpperCase())}
                  placeholder="e.g. 21785723893"
                  className="w-full px-3 py-1.5 text-xs font-mono-code uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  IFSC Code
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  placeholder="e.g. IDIB000D654"
                  className="w-full px-3 py-1.5 text-xs font-mono-code uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Branch / UPI ID (Optional)
                </label>
                <input
                  type="text"
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value.toUpperCase())}
                  placeholder="e.g. BARASAT BRANCH / VENDOR@SBI"
                  className="w-full px-3 py-1.5 text-xs uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-400" />
                <span>Remarks / Trade Terms</span>
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value.toUpperCase())}
                placeholder="e.g. 15-DAY CREDIT TERMS, 2% CASH DISCOUNT ON PROMPT PAYMENT..."
                className="w-full px-3 py-2 text-xs uppercase placeholder:normal-case bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
            Duplicate Company Name, Mobile, GSTIN, and PAN are automatically prevented.
          </span>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || duplicateCheck.isDuplicate}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              {isEditing ? <Save className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>
                {isSaving
                  ? 'Saving to Database...'
                  : isEditing
                  ? 'Update Supplier Record'
                  : 'Save Supplier Record'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
