import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Plus,
  Save,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Zap,
  Edit3,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Banknote,
  Package,
  Percent,
} from 'lucide-react';
import {
  Product,
  UnitType,
  PartyAccount,
  PurchaseCommissionMode,
  PurchaseCommissionType,
} from '../types';
import {
  checkDuplicateBarcode,
  generateUniqueBarcode,
} from '../utils/productImages';
import { SupplierFormModal, SupplierSaveResult } from './SupplierFormModal';

export interface NewProductPurchaseMeta {
  supplierId?: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
  supplierNote?: string;
  commissionType?: PurchaseCommissionType;
  commissionPercent?: number;
  commissionAmount?: number;
  commissionMode?: PurchaseCommissionMode;
  commissionNote?: string;
  netPayableAmount?: number;
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  existingProducts: Product[];
  categories: string[];
  suppliers?: PartyAccount[];
  onSaveSupplier?: (supplier: PartyAccount) => Promise<SupplierSaveResult>;
  onSaveProduct: (
    productData: Omit<Product, 'id'>,
    existingId?: number,
    purchaseMeta?: NewProductPurchaseMeta
  ) => void;
  onFillExistingProduct?: (
    product: Product,
    addedQuantity: number,
    options?: {
      purchasePrice?: number;
      gstPercent?: number;
      batchNo?: string;
      expiryDate?: string;
      supplierNote?: string;
      supplierId?: string;
      supplierName?: string;
      supplierInvoiceNo?: string;
      paymentStatus?: 'CREDIT' | 'CASH' | 'BANK_UPI';
      unit?: UnitType;
      minStockLevel?: number;
      sellingPrice?: number;
      sellingPriceWD?: number;
      sellingPriceWithGst?: number;
      hsnCode?: string;
      commissionType?: PurchaseCommissionType;
      commissionPercent?: number;
      commissionAmount?: number;
      commissionMode?: PurchaseCommissionMode;
      commissionNote?: string;
      netPayableAmount?: number;
    }
  ) => void;
  onAddNewCategory?: (newCategoryName: string) => void;
  onRenameCategory?: (oldCategoryName: string, newCategoryName: string) => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  existingProducts,
  categories,
  suppliers = [],
  onSaveSupplier,
  onSaveProduct,
  onFillExistingProduct,
  onAddNewCategory,
  onRenameCategory,
}) => {
  const isEditing = !!productToEdit;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);

  // Form Fields - support empty string state so fields can be completely cleared
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Fertilizer');
  const [unit, setUnit] = useState<UnitType>('KG');
  const [stock, setStock] = useState<number | ''>('');
  const [minStockLevel, setMinStockLevel] = useState<number | ''>('');
  const [sellingPrice, setSellingPrice] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [gstPercent, setGstPercent] = useState<number | ''>(0);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [hsnCode, setHsnCode] = useState('3105');
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'CREDIT' | 'CASH' | 'BANK_UPI'>('BANK_UPI');
  const [supplierNote, setSupplierNote] = useState('');
  const [commissionType, setCommissionType] = useState<PurchaseCommissionType>('NONE');
  const [commissionInput, setCommissionInput] = useState('');
  const [commissionMode, setCommissionMode] = useState<PurchaseCommissionMode>('DEDUCT_BILL');
  const [commissionNote, setCommissionNote] = useState('');
  const [showCreditConfirm, setShowCreditConfirm] = useState(false);
  const [isQuickAddSupplierOpen, setIsQuickAddSupplierOpen] = useState(false);

  const activeSuppliers = suppliers.filter((s) => s.isActive !== false);

  const numSellingPrice = sellingPrice === '' ? 0 : Number(sellingPrice);
  const numPurchasePrice = costPrice === '' ? 0 : Number(costPrice);
  const numGstPercent = gstPercent === '' ? 0 : Number(gstPercent);

  // Requirement: if purchase price is greater than selling price then text box back color will change as red else remain same
  const isPurchasePriceHigher = Boolean(costPrice !== '' && sellingPrice !== '' && numPurchasePrice > numSellingPrice);

  // 'Selling Price-WT GST' = 'Selling Price-WD GST' + (% of GST Charge on Selling Price)
  const gstAmountOnSelling = (numSellingPrice * numGstPercent) / 100;
  const calculatedSellingPriceWT = numSellingPrice + gstAmountOnSelling;

  // Base : amt, CGST : half of GST%, SGST: half of GST%
  const halfGstPercent = numGstPercent > 0 ? numGstPercent / 2 : 0;
  const halfGstDisplay = Number(halfGstPercent.toFixed(2));
  const cgstAmount = (numSellingPrice * halfGstPercent) / 100;
  const sgstAmount = (numSellingPrice * halfGstPercent) / 100;

  // Purchase Price (costPrice) is WITHOUT GST (Buy Price-WD GST)
  const gstAmountOnPurchase = (numPurchasePrice * numGstPercent) / 100;
  const calculatedPurchasePriceWT = numPurchasePrice + gstAmountOnPurchase;
  const purchaseUnitCgst = (numPurchasePrice * halfGstPercent) / 100;
  const purchaseUnitSgst = (numPurchasePrice * halfGstPercent) / 100;

  // Total Purchase Transaction Calculation (matches recordPurchaseTransaction in App.tsx)
  const qtyToPurchase = stock === '' ? 0 : Math.max(0, Number(stock) || 0);
  const showPurchaseSummary =
    !isEditing &&
    qtyToPurchase > 0 &&
    costPrice !== '' &&
    numPurchasePrice > 0 &&
    gstPercent !== '' &&
    numGstPercent >= 0;
  const totalPurchasePriceWD = Number((qtyToPurchase * numPurchasePrice).toFixed(2));
  const totalPurchaseGstAmt = Number(((totalPurchasePriceWD * numGstPercent) / 100).toFixed(2));
  const totalPurchaseWithGst = Number((totalPurchasePriceWD + totalPurchaseGstAmt).toFixed(2));
  const purchaseHalfGstAmt = Number((totalPurchaseGstAmt / 2).toFixed(2));

  const rawCommInput = Math.max(0, Number(commissionInput || 0) || 0);
  const rawCommissionAmount =
    commissionType === 'PERCENT'
      ? Number(((totalPurchasePriceWD * Math.min(100, rawCommInput)) / 100).toFixed(2))
      : commissionType === 'FIXED'
      ? Number(rawCommInput.toFixed(2))
      : 0;
  const commissionAmount =
    commissionMode === 'DEDUCT_BILL'
      ? Number(Math.min(totalPurchaseWithGst, rawCommissionAmount).toFixed(2))
      : rawCommissionAmount;
  const commissionPercent =
    commissionType === 'PERCENT'
      ? Number(Math.min(100, rawCommInput).toFixed(2))
      : totalPurchasePriceWD > 0 && commissionAmount > 0
      ? Number(((commissionAmount / totalPurchasePriceWD) * 100).toFixed(2))
      : 0;
  const netPayableAmount =
    commissionAmount > 0 && commissionMode === 'DEDUCT_BILL'
      ? Number(Math.max(0, totalPurchaseWithGst - commissionAmount).toFixed(2))
      : totalPurchaseWithGst;

  // Dropdown combobox state for Product Name & Category
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);

  // Category in-modal editing state
  const [isAddingNewCategory, setIsAddingNewCategory] = useState<boolean>(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [isRenamingCategory, setIsRenamingCategory] = useState<boolean>(false);
  const [renameCategoryInput, setRenameCategoryInput] = useState<string>('');
  const [categoryFeedback, setCategoryFeedback] = useState<string | null>(null);

  // Products belonging to the selected category
  const categoryProducts = existingProducts.filter(
    (p) => (p.category || '').trim().toLowerCase() === (category || '').trim().toLowerCase()
  );

  // Check if current name matches any existing product in catalog
  const matchedExistingProduct = existingProducts.find(
    (p) => (p.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase()
  );

  // Activate all sections below Product Name only once both Category and Product Name are filled/selected
  const isProductAndCategoryReady = Boolean((category || '').trim()) && Boolean((name || '').trim());
  const isBelowOptionsActive = isEditing || isProductAndCategoryReady;

  // When an existing product is selected (or when name is empty):
  // Show ALL products in this category so the user can easily switch to another item!
  // Only filter if the user is actively typing a query that doesn't match an already selected product.
  const isSelectedProductMatch =
    !!matchedExistingProduct &&
    (matchedExistingProduct.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase();

  const filteredDropdownProducts =
    isSelectedProductMatch || !(name || '').trim()
      ? categoryProducts
      : categoryProducts.filter((p) =>
          (p.name || '').toLowerCase().includes((name || '').trim().toLowerCase())
        );

  // Barcode uniqueness check:
  // If product name is the same as existing product, sharing the same barcode is intentionally valid.
  // Conflict only happens if the barcode belongs to a completely different product!
  const duplicateCheck = checkDuplicateBarcode(
    barcode,
    existingProducts,
    productToEdit ? productToEdit.id : undefined
  );
  const isConflictingDuplicate =
    duplicateCheck.isDuplicate &&
    (duplicateCheck.duplicateProduct?.name || '').trim().toLowerCase() !== (name || '').trim().toLowerCase();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Initialize or reset form on open / change
  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name || '');
      setBarcode(productToEdit.barcode || '');
      setCategory(productToEdit.category || 'Fertilizer');
      setUnit(productToEdit.unit || 'KG');
      setStock(productToEdit.stock ?? '');
      setMinStockLevel(productToEdit.minStockLevel ?? '');
      setSellingPrice(productToEdit.sellingPriceWD !== undefined ? productToEdit.sellingPriceWD : productToEdit.sellingPrice ?? '');
      setCostPrice(productToEdit.costPrice ?? '');
      setGstPercent(productToEdit.gstPercent ?? 5);
      setBatchNo(productToEdit.batchNo || '');
      setExpiryDate(productToEdit.expiryDate || '');
      setHsnCode(
        productToEdit.hsnCode ||
          ((productToEdit.category || '').toLowerCase().includes('pesti') ? '3808' : '3105')
      );
      setDescription(productToEdit.description || '');
    } else {
      // Defaults for brand new product: GST starts at 5% (2.5% CGST + 2.5% SGST)
      const initialCat = categories[0] || 'Fertilizer';
      setName('');
      setBarcode('');
      setCategory(initialCat);
      setUnit('KG');
      setStock('');
      setMinStockLevel('');
      setSellingPrice('');
      setCostPrice('');
      setGstPercent(5);
      setBatchNo('');
      setExpiryDate('');
      setHsnCode(initialCat.toLowerCase().includes('pesti') ? '3808' : '3105');
      setDescription('');
    }
    setSupplierId('');
    setSupplierInvoiceNo('');
    setPaymentStatus('BANK_UPI');
    setSupplierNote('');
    setCommissionType('NONE');
    setCommissionInput('');
    setCommissionMode('DEDUCT_BILL');
    setCommissionNote('');
    setShowCreditConfirm(false);
    setIsDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    setIsAddingNewCategory(false);
    setIsRenamingCategory(false);
    setCategoryFeedback(null);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  // Handle typing in product name
  const handleNameInputChange = (typedName: string) => {
    setName(typedName);
    setIsDropdownOpen(true);

    const trimmed = typedName.trim();
    if (!trimmed) {
      // If product name is empty, barcode also becomes empty
      setBarcode('');
      return;
    }

    const matched = existingProducts.find(
      (p) => (p.name || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (matched) {
      // If product name is same then bar code will be same for this product
      setBarcode(matched.barcode);
    } else {
      // Product is not found, then auto generated bar code will be added
      // If current barcode was linked to an existing product or empty, generate a fresh unique barcode
      const isLinkedToExisting = existingProducts.some((p) => p.barcode === barcode);
      if (isLinkedToExisting || !barcode) {
        setBarcode(generateUniqueBarcode(existingProducts));
      }
    }
  };

  // Handle selecting an existing product from the dropdown list
  const handleSelectProduct = (prod: Product) => {
    setName(prod.name);
    // If product name is same then bar code will be same for this product
    setBarcode(prod.barcode);
    setCategory(prod.category);
    setUnit(prod.unit || 'KG');
    setSellingPrice(prod.sellingPriceWD !== undefined ? prod.sellingPriceWD : prod.sellingPrice ?? '');
    setCostPrice(prod.costPrice ?? '');
    setGstPercent(prod.gstPercent ?? 0);
    setStock(isEditing ? (prod.stock ?? '') : '');
    setMinStockLevel(prod.minStockLevel ?? '');
    setBatchNo(prod.batchNo || '');
    setExpiryDate(prod.expiryDate || '');
    setHsnCode(
      prod.hsnCode || ((prod.category || '').toLowerCase().includes('pesti') ? '3808' : '3105')
    );
    if (prod.description) {
      setDescription(prod.description);
    } else {
      setDescription('');
    }
    setIsDropdownOpen(false);
  };

  // Handle user explicitly confirming a new product from the combobox
  const handleConfirmNewProduct = () => {
    setIsDropdownOpen(false);
    if (existingProducts.some((p) => p.barcode === barcode) || !barcode) {
      setBarcode(generateUniqueBarcode(existingProducts));
    }
  };

  // Handle category change or re-select:
  // "if product category is change or re-select then product name, bar code will gain be empty and refresh"
  const handleCategorySelect = (newCat: string) => {
    setCategory(newCat);
    setIsCategoryDropdownOpen(false);

    // Empty and refresh product name
    setName('');
    setIsDropdownOpen(false);

    // Empty and refresh barcode
    setBarcode('');

    // Empty and refresh entire portion: unit, stock, min alert, prices, batch, expiry, description
    setStock('');
    setMinStockLevel('');
    setSellingPrice('');
    setCostPrice('');
    setGstPercent(0);
    setBatchNo('');
    setExpiryDate('');
    setDescription('');
    setUnit('KG');

    setCategoryFeedback(`Category "${newCat}" active · All fields refreshed & emptied`);
    setTimeout(() => setCategoryFeedback(null), 3000);
  };

  // Auto-Generate Unique Barcode helper (for new product)
  const handleGenerateBarcode = () => {
    const unique = generateUniqueBarcode(existingProducts);
    setBarcode(unique);
  };

  // Add new Category from modal
  const handleApplyNewCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (onAddNewCategory) {
      onAddNewCategory(trimmed);
    }
    setCategory(trimmed);
    setIsAddingNewCategory(false);
    setNewCategoryInput('');

    // Empty and refresh product name, barcode, and entire inventory/price portion
    setName('');
    setIsDropdownOpen(false);
    setBarcode('');
    setStock('');
    setMinStockLevel('');
    setSellingPrice('');
    setCostPrice('');
    setBatchNo('');
    setExpiryDate('');
    setDescription('');
    setUnit('KG');

    setCategoryFeedback(`Created & selected "${trimmed}" · Fields refreshed`);
    setTimeout(() => setCategoryFeedback(null), 3000);
  };

  // Rename selected Category from modal
  const handleApplyRenameCategory = () => {
    const trimmed = renameCategoryInput.trim();
    if (!trimmed || trimmed === category) {
      setIsRenamingCategory(false);
      return;
    }
    if (onRenameCategory) {
      onRenameCategory(category, trimmed);
    }
    setCategory(trimmed);
    setIsRenamingCategory(false);
    setRenameCategoryInput('');
    setCategoryFeedback(`Renamed to "${trimmed}"`);
    setTimeout(() => setCategoryFeedback(null), 3000);
  };

  // Execute the final save (either directly for Bank/Cash or after Sundry Creditor reconfirmation)
  const executeFinalSave = () => {
    if (!name.trim()) return;
    if (isConflictingDuplicate) return;

    const matchedSupplier = suppliers.find((s) => s.id === supplierId);
    const purchaseMeta: NewProductPurchaseMeta = {
      supplierId: supplierId || undefined,
      supplierName: matchedSupplier?.name || undefined,
      supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
      paymentStatus,
      supplierNote: supplierNote.trim() || undefined,
      commissionType: commissionAmount > 0 ? commissionType : 'NONE',
      commissionPercent: commissionAmount > 0 ? commissionPercent : 0,
      commissionAmount: commissionAmount > 0 ? commissionAmount : 0,
      commissionMode: commissionAmount > 0 ? commissionMode : 'DEDUCT_BILL',
      commissionNote: commissionAmount > 0 ? commissionNote.trim() || undefined : undefined,
      netPayableAmount,
    };

    if (!isEditing && matchedExistingProduct && onFillExistingProduct) {
      const qtyToAdd = stock === '' ? 0 : Number(stock);
      if (qtyToAdd <= 0) return;
      onFillExistingProduct(matchedExistingProduct, qtyToAdd, {
        purchasePrice: numPurchasePrice,
        gstPercent: numGstPercent,
        batchNo: batchNo.trim() || matchedExistingProduct.batchNo,
        expiryDate: expiryDate ? expiryDate : matchedExistingProduct.expiryDate,
        unit: unit || matchedExistingProduct.unit,
        minStockLevel: minStockLevel === '' ? matchedExistingProduct.minStockLevel : Number(minStockLevel),
        sellingPriceWD: numSellingPrice > 0 ? numSellingPrice : matchedExistingProduct.sellingPriceWD,
        sellingPriceWithGst: calculatedSellingPriceWT > 0 ? calculatedSellingPriceWT : matchedExistingProduct.sellingPriceWithGst,
        sellingPrice:
          calculatedSellingPriceWT > 0
            ? calculatedSellingPriceWT
            : numSellingPrice > 0
            ? numSellingPrice
            : matchedExistingProduct.sellingPrice,
        hsnCode: hsnCode.trim() || matchedExistingProduct.hsnCode || '3105',
        supplierId: purchaseMeta.supplierId,
        supplierName: purchaseMeta.supplierName,
        supplierInvoiceNo: purchaseMeta.supplierInvoiceNo,
        paymentStatus: purchaseMeta.paymentStatus,
        supplierNote: purchaseMeta.supplierNote,
        commissionType: purchaseMeta.commissionType,
        commissionPercent: purchaseMeta.commissionPercent,
        commissionAmount: purchaseMeta.commissionAmount,
        commissionMode: purchaseMeta.commissionMode,
        commissionNote: purchaseMeta.commissionNote,
        netPayableAmount: purchaseMeta.netPayableAmount,
      });
      setShowCreditConfirm(false);
      onClose();
      return;
    }

    // Resolve barcode: use current barcode or auto-generate if empty
    const finalBarcode = barcode.trim() || generateUniqueBarcode(existingProducts);

    const productPayload: Omit<Product, 'id'> = {
      name: name.trim(),
      category: category.trim(),
      barcode: finalBarcode,
      unit: unit || 'KG',
      sellingPrice: calculatedSellingPriceWT > 0 ? calculatedSellingPriceWT : numSellingPrice,
      sellingPriceWD: numSellingPrice,
      costPrice: numPurchasePrice,
      gstPercent: numGstPercent,
      sellingPriceWithGst: calculatedSellingPriceWT,
      stock: stock === '' ? 0 : Number(stock),
      minStockLevel: minStockLevel === '' ? 0 : Number(minStockLevel),
      batchNo: batchNo.trim() || `B-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      expiryDate: expiryDate ? expiryDate : undefined,
      hsnCode: hsnCode.trim() || (category.toLowerCase().includes('pesti') ? '3808' : '3105'),
      image: '',
      description: description.trim(),
    };

    onSaveProduct(productPayload, productToEdit ? productToEdit.id : undefined, isEditing ? undefined : purchaseMeta);
    setShowCreditConfirm(false);
    onClose();
  };

  // Form submission — asks for explicit reconfirmation if Sundry Creditor (On Credit) is selected
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isConflictingDuplicate) return;
    if (!isEditing && matchedExistingProduct && (!stock || Number(stock) <= 0)) return;

    if (!isEditing && paymentStatus === 'CREDIT') {
      setShowCreditConfirm(true);
      return;
    }

    executeFinalSave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              {isEditing ? (
                <>
                  <Edit3 className="w-5 h-5 text-emerald-400" />
                  <span>Edit Product &amp; Stock Details</span>
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-emerald-400" />
                  <span>Add New Product to Society Catalog</span>
                </>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select category to view existing products, auto-assign barcodes, and configure inventory
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 hover:border-rose-500 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Close Window (or press Esc key)"
          >
            <X className="w-4 h-4 text-rose-400 group-hover:text-white transition-colors" />
            <span>Close ✕</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* STEP 1: Category Section with In-Modal Editing & Custom Creation */}
          <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>Product Category *</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  (Links with product list below)
                </span>
              </label>
              {!isAddingNewCategory && !isRenamingCategory && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleCategorySelect(category)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-300 flex items-center gap-1 transition-colors"
                    title="Re-select category and refresh product name, images, and barcode to empty"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Re-select &amp; Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameCategoryInput(category);
                      setIsRenamingCategory(true);
                      setIsAddingNewCategory(false);
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-300 flex items-center gap-1 transition-colors"
                    title="Rename this category"
                  >
                    <Edit3 className="w-3 h-3 text-slate-500" />
                    <span>Edit Name</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryInput('');
                      setIsAddingNewCategory(true);
                      setIsRenamingCategory(false);
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1 transition-colors"
                    title="Create a new custom category"
                  >
                    <Plus className="w-3 h-3 text-emerald-600" />
                    <span>+ New Category</span>
                  </button>
                </div>
              )}
            </div>

            {/* Category Dropdown with chevron & Re-select support */}
            {!isAddingNewCategory && !isRenamingCategory && (
              <div ref={categoryDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 text-left flex items-center justify-between hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-xs"
                  title="Click to change or re-select category"
                  aria-label="Toggle category selection dropdown"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    <span className="truncate">{category}</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      ({categoryProducts.length} items stored)
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-slate-500 pl-2 flex-shrink-0">
                    <span className="text-[10px] text-slate-400 hidden sm:inline">Change / Re-select</span>
                    {isCategoryDropdownOpen ? (
                      <ChevronUp className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-600" />
                    )}
                  </span>
                </button>

                {/* Dropdown Menu for Category Selection */}
                {isCategoryDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                    <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                      <span>Select Category to Refresh Form</span>
                      <button
                        type="button"
                        onClick={() => setIsCategoryDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-700 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-1 space-y-0.5">
                      {categories.map((c) => {
                        const isSelected = (c || '').toLowerCase() === (category || '').toLowerCase();
                        const count = existingProducts.filter(
                          (p) => (p.category || '').trim().toLowerCase() === (c || '').trim().toLowerCase()
                        ).length;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleCategorySelect(c)}
                            className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                              isSelected
                                ? 'bg-emerald-50 font-bold text-emerald-900 border border-emerald-200'
                                : 'text-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span>{c}</span>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                                  Active · Click to Re-select
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono-code text-slate-500">
                              {count} items
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode 1: Adding a new category inline */}
            {isAddingNewCategory && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-emerald-900 block">
                  Add New Category Name:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Household &amp; Hygiene, Fresh Produce, Organic"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleApplyNewCategory}
                    disabled={!newCategoryInput.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCategory(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Mode 2: Renaming currently selected category inline */}
            {isRenamingCategory && (
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg space-y-2">
                <span className="text-[11px] font-bold text-amber-900 block">
                  Edit Category Name for "{category}":
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={renameCategoryInput}
                    onChange={(e) => setRenameCategoryInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleApplyRenameCategory}
                    disabled={!renameCategoryInput.trim()}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Name</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenamingCategory(false)}
                    className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {categoryFeedback && (
              <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                <span>{categoryFeedback}</span>
              </p>
            )}
          </div>

          {/* STEP 2: Product Name with Dropdown Arrows & Category Linking */}
          <div ref={dropdownRef} className="relative space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>Product Name *</span>
                {matchedExistingProduct ? (
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                    <Check className="w-3 h-3 text-blue-600" />
                    <span>Existing Product · Same Barcode Linked</span>
                  </span>
                ) : name.trim() ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-600" />
                    <span>New Product · Auto Barcode Assigned</span>
                  </span>
                ) : null}
              </label>
              <span className="text-[11px] text-slate-500">
                In <strong className="text-slate-700">"{category}"</strong> ({categoryProducts.length} stored)
              </span>
            </div>

            {/* Input with Dropdown Arrow */}
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder={`Click dropdown arrow or type product name...`}
                value={name}
                onChange={(e) => handleNameInputChange(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
                className={`w-full pl-3.5 pr-11 py-2.5 text-xs sm:text-sm border rounded-xl focus:outline-none transition-all font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 ${
                  matchedExistingProduct
                    ? 'border-blue-400 bg-blue-50/20 focus:ring-2 focus:ring-blue-500'
                    : 'border-slate-300 focus:ring-2 focus:ring-emerald-500'
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center"
                title="Browse existing products in this category"
                aria-label="Toggle existing product dropdown"
              >
                {isDropdownOpen ? (
                  <ChevronUp className="w-4 h-4 text-emerald-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>

            {/* Searchable Dropdown List of Existing Products in this Category */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span>Stored Products in "{category}"</span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {filteredDropdownProducts.length} items
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {filteredDropdownProducts.length < categoryProducts.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setName('');
                          setBarcode('');
                        }}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline"
                      >
                        Show All ({categoryProducts.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs px-1"
                    >
                      Close ✕
                    </button>
                  </div>
                </div>

                {categoryProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">No stored products yet under "{category}".</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Type any product name in the box. A unique barcode will be automatically generated.
                    </p>
                  </div>
                ) : filteredDropdownProducts.length === 0 ? (
                  <div className="p-3.5 text-center text-xs text-slate-600 space-y-2">
                    <div>No existing product named "{name}" found in this category.</div>
                    <button
                      type="button"
                      onClick={handleConfirmNewProduct}
                      className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 inline-flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Product: "{name}"</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {filteredDropdownProducts.map((p) => {
                      const isSelected = (p.name || '').trim().toLowerCase() === (name || '').trim().toLowerCase();
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectProduct(p)}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2.5 transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border border-blue-200 text-blue-950 font-bold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                              <Package className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {isSelected && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 flex items-center gap-0.5">
                                    <Check className="w-2.5 h-2.5 text-blue-600" />
                                    <span>Selected</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono-code flex items-center gap-2">
                                <span>Barcode: {p.barcode}</span>
                                <span>·</span>
                                <span>Stock: {p.stock} {p.unit}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-bold text-emerald-700 font-mono-code">
                              ₹{p.sellingPrice}
                            </div>
                            <div className="text-[10px] text-slate-400">/{p.unit}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isBelowOptionsActive && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Select a <strong>Product Category</strong> and enter or select a <strong>Product Name</strong> above to activate Barcode, Unit, Stock, Pricing &amp; GST options.
              </span>
            </div>
          )}

          <fieldset
            disabled={!isBelowOptionsActive}
            className={`border-0 p-0 m-0 min-w-0 space-y-5 transition-opacity duration-200 ${
              !isBelowOptionsActive ? 'opacity-45 pointer-events-none select-none' : ''
            }`}
          >
          {/* STEP 3: Barcode Field (Auto-Generated / Synced · Manual Typing Disabled) */}
          <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Barcode (Auto-Assigned · Manual Typing Disabled) *</span>
              </label>

              {matchedExistingProduct ? (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200">
                  Linked to Existing Barcode
                </span>
              ) : barcode ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-200">
                    Auto-Generated Unique Barcode
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1 transition-colors"
                    title="Regenerate a different unique 12-digit barcode"
                  >
                    <Zap className="w-3 h-3 text-emerald-600" />
                    <span>Regenerate</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded border border-slate-300">
                    Empty · Ready to Auto-Assign
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 flex items-center gap-1 transition-colors"
                    title="Generate a unique 12-digit barcode now"
                  >
                    <Zap className="w-3 h-3 text-emerald-600" />
                    <span>Auto-Generate Now</span>
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={barcode}
                placeholder="Auto-assigned on product selection or typing name..."
                readOnly
                tabIndex={-1}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono-code font-bold rounded-xl bg-slate-100 text-slate-800 border border-slate-300 cursor-not-allowed select-all focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                title="Barcode number is automatically generated/linked and cannot be typed manually"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-semibold text-slate-500 pointer-events-none">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Auto-Locked</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {matchedExistingProduct ? (
                <span>
                  ✓ Product name matches existing <strong>"{matchedExistingProduct.name}"</strong>. Same barcode is automatically used.
                </span>
              ) : barcode ? (
                <span>
                  ⚡ Unique 12-digit barcode automatically generated without manual typing.
                </span>
              ) : (
                <span>
                  ⚡ Type a product name or select from the dropdown above to auto-assign a barcode.
                </span>
              )}
            </p>

            {/* Warning banner ONLY if an unintended barcode collision occurs with a different product */}
            {isConflictingDuplicate && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-[11.5px] leading-relaxed">
                  <div className="font-bold text-rose-900">
                    Duplicate Barcode Detected: Code <span className="font-mono underline">{barcode}</span> is assigned to a different product!
                  </div>
                  <p className="mt-0.5 text-rose-700">
                    Belongs to <strong>"{duplicateCheck.duplicateProduct?.name}"</strong>. Click below to regenerate a new unique barcode.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] shadow-xs"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Assign Available Unique Barcode Now</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unit, Stock & Alert Level */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Unit Type
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold bg-white text-slate-800"
              >
                <option value="0">0 (Default Zero - Configure Later)</option>
                <option value="KG">KG (Kilogram - Selling in Grams)</option>
                <option value="GM">GM (Gram)</option>
                <option value="LTR">LTR (Litre - Selling in ML)</option>
                <option value="ML">ML (Millilitre)</option>
                <option value="PKT">PKT (Packet)</option>
                <option value="PCS">PCS (Pieces)</option>
                <option value="JAR">JAR (Jar)</option>
                <option value="BASTA">BASTA (Basta)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {isEditing
                  ? 'Available Stock'
                  : matchedExistingProduct
                  ? 'Quantity to Add / Fill *'
                  : 'Initial Stock'}
              </label>
              <input
                type="number"
                step="0.5"
                min={!isEditing && matchedExistingProduct ? '0.001' : '0'}
                placeholder={!isEditing && matchedExistingProduct ? 'Qty to fill (e.g. 25)' : 'e.g. 50'}
                value={stock}
                onChange={(e) => setStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-mono-code font-bold placeholder:text-slate-400 placeholder:font-normal ${
                  !isEditing && matchedExistingProduct
                    ? 'border-teal-400 bg-teal-50/40 focus:ring-teal-500'
                    : 'border-slate-300 focus:ring-emerald-500'
                }`}
              />
              {!isEditing && matchedExistingProduct && (
                <span className="text-[10px] font-mono-code font-bold text-teal-700 block mt-1">
                  Existing: {matchedExistingProduct.stock} → New:{' '}
                  {(matchedExistingProduct.stock + Number(stock || 0)).toFixed(2).replace(/\.00$/, '')}{' '}
                  {matchedExistingProduct.unit}
                </span>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Min Alert Level
              </label>
              <input
                type="number"
                step="1"
                min="1"
                placeholder="e.g. 15"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>
          </div>

          {/* Pricing, Tax & GST Configuration Section */}
          <div className="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Pricing & GST Configuration</span>
              </span>
              {isPurchasePriceHigher && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white flex items-center gap-1 shadow-sm animate-pulse">
                  ⚠️ Purchase Price Exceeds Selling Price!
                </span>
              )}
            </div>

            {/* 4 Compact Pricing & GST Fields In One Line (reduced width to fit side-by-side with gap) */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {/* 1. Purchase Price-WD GST (Buy Cost Without GST) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 truncate" title="Purchase Price-WD GST (Without GST) (₹)">
                  Purchase Price-WD GST (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none font-mono-code transition-colors ${
                    isPurchasePriceHigher
                      ? 'bg-red-600 text-white font-bold border-red-700 placeholder:text-red-200 ring-2 ring-red-400'
                      : 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400'
                  }`}
                />
                <span className={`text-[9px] font-mono-code block mt-1 truncate ${isPurchasePriceHigher ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                  {isPurchasePriceHigher
                    ? '⚠️ Exceeds Selling'
                    : numPurchasePrice > 0
                    ? `Without GST · WT: ₹${calculatedPurchasePriceWT.toFixed(2)}`
                    : 'Buy cost (Without GST)'}
                </span>
              </div>

              {/* 2. Selling Price-WD GST (formerly Selling Price) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 truncate" title="Selling Price-WD GST (₹)">
                  Selling Price-WD GST (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none font-mono-code font-bold transition-colors ${
                    isPurchasePriceHigher
                      ? 'bg-red-50 text-red-900 border-red-400 focus:ring-2 focus:ring-red-400'
                      : 'bg-white border-slate-300 text-emerald-800 focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400'
                  }`}
                  required
                />
                <span className="text-[9px] text-slate-400 block mt-1 truncate">Without GST</span>
              </div>

              {/* 3. GST Charge (without slab buttons) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 truncate" title="GST Charge (%)">
                  GST Charge (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={gstPercent}
                    onChange={(e) => setGstPercent(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 pr-6 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code font-bold bg-white text-slate-800 placeholder:text-slate-400"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    %
                  </span>
                </div>
                <span className="text-[9px] text-slate-400 block mt-1 truncate">Tax rate</span>
              </div>

              {/* 4. Selling Price-WT GST (Calculated) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 truncate" title="Selling Price-WT GST (₹)">
                  Selling Price-WT GST (₹)
                </label>
                <div className="w-full px-2.5 py-1.5 text-xs border border-emerald-300 bg-emerald-50 rounded-lg font-mono-code font-black text-emerald-900 flex items-center justify-between shadow-xs">
                  <span className="truncate">₹{calculatedSellingPriceWT.toFixed(2)}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-800 px-1 py-0.5 rounded shrink-0 ml-1">
                    WT GST
                  </span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono-code block mt-1 truncate" title={`Base ₹${numSellingPrice.toFixed(2)} + GST ₹${gstAmountOnSelling.toFixed(2)}`}>
                  With GST
                </span>
              </div>
            </div>

            {/* Below all text boxes: Purchase (WD -> WT GST) & Selling (WD -> WT GST) unit breakdowns */}
            <div className="space-y-1.5">
              {costPrice !== '' && numPurchasePrice > 0 && (
                <div className="text-center py-2 px-3 rounded-lg bg-slate-100/90 border border-slate-300/80 shadow-xs">
                  <p className="text-xs font-semibold text-slate-800 font-mono-code inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span>
                      <strong className="text-slate-600">Purchase Base :</strong> <span className="font-bold text-slate-900">₹{numPurchasePrice.toFixed(2)}</span>,
                    </span>
                    <span>
                      <strong className="text-amber-700">CGST :</strong> <span className="font-bold text-amber-900">{halfGstDisplay}%</span> {numGstPercent > 0 && <span className="text-[11px] text-amber-700 font-normal">(₹{purchaseUnitCgst.toFixed(2)})</span>},
                    </span>
                    <span>
                      <strong className="text-amber-700">SGST :</strong> <span className="font-bold text-amber-900">{halfGstDisplay}%</span> {numGstPercent > 0 && <span className="text-[11px] text-amber-700 font-normal">(₹{purchaseUnitSgst.toFixed(2)})</span>},
                    </span>
                    <span>
                      <strong className="text-slate-700">Unit WT GST :</strong> <span className="font-extrabold text-slate-900">₹{calculatedPurchasePriceWT.toFixed(2)}</span>
                    </span>
                  </p>
                </div>
              )}

              <div className="text-center py-2 px-3 rounded-lg bg-emerald-50/90 border border-emerald-200/90 shadow-xs">
                <p className="text-xs sm:text-sm font-semibold text-slate-800 font-mono-code inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <span>
                    <strong className="text-slate-600">Selling Base :</strong> <span className="font-bold text-slate-900">₹{numSellingPrice.toFixed(2)}</span>,
                  </span>
                  <span>
                    <strong className="text-emerald-700">CGST :</strong> <span className="font-bold text-emerald-900">{halfGstDisplay}%</span> {numGstPercent > 0 && <span className="text-[11px] text-emerald-700 font-normal">(₹{cgstAmount.toFixed(2)})</span>},
                  </span>
                  <span>
                    <strong className="text-emerald-700">SGST :</strong> <span className="font-bold text-emerald-900">{halfGstDisplay}%</span> {numGstPercent > 0 && <span className="text-[11px] text-emerald-700 font-normal">(₹{sgstAmount.toFixed(2)})</span>}
                  </span>
                </p>
              </div>
            </div>

            {/* Warning Message if Purchase Price > Selling Price */}
            {isPurchasePriceHigher && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                <span className="text-sm">⚠️</span>
                <span>
                  Notice: Purchase Price-WD GST (₹{numPurchasePrice.toFixed(2)}) is higher than Selling Price-WD GST (₹{numSellingPrice.toFixed(2)}). Text box background changed to red.
                </span>
              </div>
            )}

            {/* Total Purchase Transaction Breakdown (shown once Quantity, Purchase Price & GST are entered) */}
            {showPurchaseSummary && (
              <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2.5 border border-slate-800 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    <span>Total Purchase Transaction Summary</span>
                  </span>
                  <span className="text-[11px] font-mono-code text-slate-300">
                    {qtyToPurchase} {unit === '0' ? 'Units' : unit} × ₹{numPurchasePrice.toFixed(2)} (WD GST) + {numGstPercent}% GST
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/80">
                    <span className="text-[10px] font-semibold text-slate-400 block">
                      Total Purchases Price-WD GST (₹)
                    </span>
                    <span className="text-sm font-extrabold font-mono-code tabular-nums text-white mt-0.5 block">
                      ₹{totalPurchasePriceWD.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono-code">
                      Without GST (Base Cost)
                    </span>
                  </div>

                  <div className="bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/80">
                    <span className="text-[10px] font-semibold text-slate-400 block">
                      Total GST Amt to be Paid ({numGstPercent}%)
                    </span>
                    <span className="text-sm font-extrabold font-mono-code tabular-nums text-amber-300 mt-0.5 block">
                      ₹{totalPurchaseGstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono-code">
                      CGST {halfGstDisplay}%: ₹{purchaseHalfGstAmt.toFixed(2)} · SGST {halfGstDisplay}%: ₹{purchaseHalfGstAmt.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-emerald-950/70 rounded-lg px-3 py-2 border border-emerald-700/60">
                    <span className="text-[10px] font-semibold text-emerald-300 block">
                      Total Purchases With GST (₹)
                    </span>
                    <span className="text-base font-black font-mono-code tabular-nums text-emerald-300 mt-0.5 block">
                      ₹{totalPurchaseWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-emerald-200/80 font-mono-code">
                      Unit WT GST: ₹{calculatedPurchasePriceWT.toFixed(2)}
                    </span>
                  </div>
                </div>

                {commissionAmount > 0 && (
                  <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-code">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <span className="font-sans text-[11px] font-bold">Company Commission:</span>
                      <span className="font-black">
                        ₹{commissionAmount.toFixed(2)}
                        {commissionPercent > 0 ? ` (${commissionPercent}%)` : ''}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 font-sans">
                        {commissionMode === 'DEDUCT_BILL'
                          ? 'Deducted from Bill'
                          : commissionMode === 'SEPARATE_BANK'
                          ? 'Separate Bank/UPI'
                          : 'Separate Cash'}
                      </span>
                    </div>
                    <div>
                      <span className="font-sans text-[10px] text-slate-400 mr-1.5">Net Payable:</span>
                      <span className="text-sm font-black text-white">
                        ₹{netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* HSN/SAC Code, Batch & Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                HSN / SAC Code (GSTR-1)
              </label>
              <input
                type="text"
                placeholder="e.g. 3105 (Fert) / 3808 (Pest)"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code font-bold text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Batch Number (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. B-2026-598"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono-code text-slate-600 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
              />
            </div>
          </div>

          {/* FINAL STEP: Supplier & Purchase Payment Mode (Default: Bank / NEFT / UPI) */}
          {!isEditing && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 transition-colors ${
                paymentStatus === 'CREDIT'
                  ? 'bg-amber-50/90 border-amber-300'
                  : paymentStatus === 'CASH'
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-sky-50/70 border-sky-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Banknote
                    className={`w-3.5 h-3.5 ${
                      paymentStatus === 'CREDIT'
                        ? 'text-amber-600'
                        : paymentStatus === 'CASH'
                        ? 'text-emerald-600'
                        : 'text-sky-600'
                    }`}
                  />
                  <span>Final Step · Supplier &amp; Purchase Payment Mode</span>
                </label>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded bg-white border ${
                    paymentStatus === 'CREDIT'
                      ? 'border-amber-300 text-amber-900'
                      : paymentStatus === 'CASH'
                      ? 'border-emerald-300 text-emerald-900'
                      : 'border-sky-300 text-sky-900'
                  }`}
                >
                  {paymentStatus === 'CREDIT'
                    ? 'Sundry Creditors · Reconfirmation Required'
                    : paymentStatus === 'BANK_UPI'
                    ? 'Default · Deducts from Bank / NEFT / UPI'
                    : 'Deducts from Cash Drawer'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Purchase Settlement Mode *
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => {
                      setPaymentStatus(e.target.value as 'CREDIT' | 'CASH' | 'BANK_UPI');
                      setShowCreditConfirm(false);
                    }}
                    className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 font-bold ${
                      paymentStatus === 'CREDIT'
                        ? 'bg-amber-100/80 border-amber-400 text-amber-950 focus:ring-amber-500'
                        : paymentStatus === 'BANK_UPI'
                        ? 'bg-white border-sky-400 text-sky-950 focus:ring-sky-500'
                        : 'bg-white border-emerald-400 text-emerald-950 focus:ring-emerald-500'
                    }`}
                  >
                    <option value="BANK_UPI">Paid Immediately via Bank / NEFT / UPI (Default)</option>
                    <option value="CASH">Paid Immediately via Cash Drawer</option>
                    <option value="CREDIT">On Credit (Sundry Creditors — Pay Later)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Supplier / Company Master {paymentStatus === 'CREDIT' ? '(Recommended)' : '(Optional)'}
                    </label>
                    {onSaveSupplier && (
                      <button
                        type="button"
                        onClick={() => setIsQuickAddSupplierOpen(true)}
                        className="text-[10px] font-extrabold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                        title="Register a new supplier directly from Purchase Entry"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New Supplier</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                  >
                    <option value="">General / Unspecified Supplier</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplierCode ? `[${s.supplierCode}] ` : ''}
                        {s.name}
                        {s.supplierCategory ? ` · ${s.supplierCategory}` : ''}
                        {s.phone ? ` · ${s.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Supplier Bill / Chalan No. (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. IFFCO/26-27/1042"
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono-code text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Supplier Note / Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NEFT Ref / 30-day credit terms"
                    value={supplierNote}
                    onChange={(e) => setSupplierNote(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
                  />
                </div>
              </div>

              {/* Optional Company Commission / Dealer Rebate */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Company Commission / Rebate (Optional)</span>
                  </label>
                  <div className="inline-flex items-center bg-white rounded-lg border border-emerald-200 p-0.5 text-[10px] font-bold">
                    {(
                      [
                        { id: 'NONE', label: 'No Commission' },
                        { id: 'PERCENT', label: '% of Base' },
                        { id: 'FIXED', label: 'Fixed ₹' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setCommissionType(opt.id);
                          if (opt.id === 'NONE') {
                            setCommissionInput('');
                            setCommissionNote('');
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          commissionType === opt.id
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:text-emerald-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {commissionType !== 'NONE' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[10.5px] font-bold text-emerald-900 block mb-1">
                        {commissionType === 'PERCENT' ? 'Commission (%)' : 'Commission (₹)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={commissionType === 'PERCENT' ? '100' : undefined}
                        value={commissionInput}
                        onChange={(e) => setCommissionInput(e.target.value)}
                        placeholder={commissionType === 'PERCENT' ? 'e.g. 2.5' : 'e.g. 500'}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-mono-code font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {commissionAmount > 0 && (
                        <span className="text-[10px] font-mono-code font-bold text-emerald-700 block mt-0.5">
                          Earned: ₹{commissionAmount.toFixed(2)} ({commissionPercent}%)
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-emerald-900 block mb-1">
                        Commission Mode
                      </label>
                      <select
                        value={commissionMode}
                        onChange={(e) => setCommissionMode(e.target.value as PurchaseCommissionMode)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="DEDUCT_BILL">Deduct from Purchase Bill</option>
                        <option value="SEPARATE_BANK">Received Separately in Bank / UPI</option>
                        <option value="SEPARATE_CASH">Received Separately in Cash</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-emerald-900 block mb-1">
                        Scheme / Note
                      </label>
                      <input
                        type="text"
                        value={commissionNote}
                        onChange={(e) => setCommissionNote(e.target.value)}
                        placeholder="e.g. Company dealer margin"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </fieldset>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
          <div>
            {isConflictingDuplicate ? (
              <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Fix conflicting barcode before saving</span>
              </span>
            ) : !isEditing ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  paymentStatus === 'CREDIT'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : paymentStatus === 'BANK_UPI'
                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}
              >
                <Banknote className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {paymentStatus === 'CREDIT'
                    ? 'Mode: ON CREDIT (Sundry Creditors)'
                    : paymentStatus === 'BANK_UPI'
                    ? 'Mode: Bank / NEFT / UPI (Default)'
                    : 'Mode: Cash Drawer'}
                </span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isConflictingDuplicate ||
                !category.trim() ||
                !name.trim() ||
                sellingPrice === '' ||
                Number(sellingPrice) <= 0 ||
                (!isEditing && Boolean(matchedExistingProduct) && (!stock || Number(stock) <= 0))
              }
              className={`px-5 py-2.5 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all ${
                !isEditing && paymentStatus === 'CREDIT'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isEditing ? (
                <>
                  <Save className="w-4 h-4" />
                  <span>Update Product Details</span>
                </>
              ) : matchedExistingProduct ? (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    {paymentStatus === 'CREDIT'
                      ? 'Review Credit Purchase →'
                      : 'Fill Stock & Record Purchase'}
                  </span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    {paymentStatus === 'CREDIT'
                      ? 'Review Credit Purchase →'
                      : 'Save Product & Record Purchase'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sundry Creditor (On Credit) Final Reconfirmation Dialog */}
        {showCreditConfirm && !isEditing && (
          <div className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border-2 border-amber-400 overflow-hidden">
              <div className="px-5 py-3.5 bg-amber-600 text-white flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-extrabold text-sm">
                    Reconfirm Sundry Creditor (Credit) Purchase
                  </h4>
                  <p className="text-[11px] text-amber-100">
                    Please verify before recording this purchase on credit
                  </p>
                </div>
              </div>
              <div className="p-5 space-y-3.5 text-xs">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Product:</span>
                    <span className="font-bold text-slate-900 text-right">{name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Quantity:</span>
                    <span className="font-mono-code font-bold text-slate-900">
                      +{qtyToPurchase} {unit}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Total Bill (Incl. GST):</span>
                    <span className="font-mono-code font-bold text-slate-900">
                      ₹{totalPurchaseWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {commissionAmount > 0 && (
                    <>
                      <div className="flex justify-between gap-2 text-emerald-800">
                        <span className="font-semibold">
                          Company Commission ({commissionMode === 'DEDUCT_BILL' ? 'Deducted' : commissionMode === 'SEPARATE_BANK' ? 'Bank' : 'Cash'}):
                        </span>
                        <span className="font-mono-code font-bold">
                          -₹{commissionAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-amber-200 pt-1">
                        <span className="text-slate-700 font-extrabold">Net Payable (Creditor):</span>
                        <span className="font-mono-code font-black text-amber-900 text-sm">
                          ₹{netPayableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 font-semibold">Supplier (Creditor):</span>
                    <span className="font-bold text-slate-900 text-right">
                      {suppliers.find((s) => s.id === supplierId)?.name || 'General / Unspecified Supplier'}
                    </span>
                  </div>
                  {supplierInvoiceNo.trim() && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600 font-semibold">Bill / Chalan No.:</span>
                      <span className="font-mono-code font-bold text-slate-800">{supplierInvoiceNo.trim()}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11.5px] text-slate-700 leading-relaxed">
                  You selected <strong className="text-amber-800">On Credit (Sundry Creditors)</strong>.
                  This will <strong>NOT</strong> deduct from Bank/NEFT or Cash now — it will be added to{' '}
                  <strong>Sundry Creditors (Payable)</strong> on your Balance Sheet until you pay it back via{' '}
                  <strong>Accounts &amp; Balance Sheet → Pay Supplier</strong>.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCreditConfirm(false)}
                    className="px-3.5 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold cursor-pointer"
                  >
                    Go Back / Change Mode
                  </button>
                  <button
                    type="button"
                    onClick={executeFinalSave}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Confirm &amp; Save Credit Purchase</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Register New Supplier Modal from New Product Purchase Entry */}
        {onSaveSupplier && (
          <SupplierFormModal
            isOpen={isQuickAddSupplierOpen}
            onClose={() => setIsQuickAddSupplierOpen(false)}
            existingSuppliers={suppliers}
            onSaveSupplier={onSaveSupplier}
            onSavedCallback={(saved) => {
              setSupplierId(saved.id);
            }}
          />
        )}
      </div>
    </div>
  );
};
