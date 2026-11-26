/**
 * Utility functions for Product Image management, category fallbacks,
 * file upload validation (<= 2MB), and barcode uniqueness verification.
 */

import { Product } from '../types';

export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 Megabytes
export const MAX_IMAGE_SIZE_LABEL = '2.0 MB';

/**
 * High-quality SVG-based meaningful category fallback illustrations.
 * Encoded as inline data URIs so they work 100% offline without external network dependencies.
 */
export const CATEGORY_DEFAULT_SVGS: Record<string, string> = {
  'Grains & Staples': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FEF3C7" />
          <stop offset="100%" stop-color="#FDE68A" />
        </linearGradient>
        <linearGradient id="sackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#D97706" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#bgGrad)" />
      <!-- Rice/Grain Sack -->
      <path d="M120 110 C 120 90, 280 90, 280 110 C 290 180, 275 250, 260 250 L 140 250 C 125 250, 110 180, 120 110 Z" fill="url(#sackGrad)" />
      <!-- Tied neck -->
      <ellipse cx="200" cy="110" rx="70" ry="16" fill="#92400E" />
      <ellipse cx="200" cy="100" rx="60" ry="12" fill="#F59E0B" />
      <!-- Wheat stalk decorations -->
      <path d="M200 240 L 200 130" stroke="#FEF3C7" stroke-width="4" stroke-linecap="round" />
      <circle cx="180" cy="150" r="12" fill="#FEF3C7" />
      <circle cx="220" cy="150" r="12" fill="#FEF3C7" />
      <circle cx="180" cy="180" r="12" fill="#FEF3C7" />
      <circle cx="220" cy="180" r="12" fill="#FEF3C7" />
      <circle cx="185" cy="210" r="10" fill="#FEF3C7" />
      <circle cx="215" cy="210" r="10" fill="#FEF3C7" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#78350F" text-anchor="middle">GRAINS &amp; STAPLES</text>
    </svg>
  `)}`,

  'Edible Oils': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="oilBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFBEB" />
          <stop offset="100%" stop-color="#FEF08A" />
        </linearGradient>
        <linearGradient id="bottleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#oilBg)" />
      <!-- Bottle neck and body -->
      <rect x="185" y="45" width="30" height="25" rx="4" fill="#B45309" />
      <path d="M185 70 C 185 85, 140 105, 140 135 L 140 230 C 140 245, 260 245, 260 230 L 260 135 C 260 105, 215 85, 215 70 Z" fill="url(#bottleGrad)" opacity="0.9" />
      <!-- Label -->
      <rect x="155" y="140" width="90" height="65" rx="8" fill="#FFFFFF" opacity="0.95" />
      <!-- Oil Droplet -->
      <path d="M200 152 C 200 152, 185 174, 185 183 C 185 192, 192 198, 200 198 C 208 198, 215 192, 215 183 C 215 174, 200 152, 200 152 Z" fill="#EAB308" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#854D0E" text-anchor="middle">PURE EDIBLE OIL</text>
    </svg>
  `)}`,

  'Grocery & Essentials': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="groBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ECFDF5" />
          <stop offset="100%" stop-color="#A7F3D0" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#groBg)" />
      <!-- Shopping Basket / Bag -->
      <path d="M125 125 L 275 125 L 255 240 L 145 240 Z" fill="#047857" rx="10" />
      <path d="M160 125 C 160 75, 240 75, 240 125" fill="none" stroke="#065F46" stroke-width="12" stroke-linecap="round" />
      <!-- Groceries sticking out -->
      <rect x="160" y="90" width="35" height="50" rx="4" fill="#F87171" transform="rotate(-10 160 90)" />
      <rect x="205" y="80" width="40" height="60" rx="6" fill="#FBBF24" transform="rotate(8 205 80)" />
      <circle cx="195" cy="115" r="16" fill="#34D399" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#064E3B" text-anchor="middle">GROCERY &amp; ESSENTIALS</text>
    </svg>
  `)}`,

  'Pulses & Dal': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="dalBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF7ED" />
          <stop offset="100%" stop-color="#FED7AA" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#dalBg)" />
      <!-- Ceramic Bowl -->
      <path d="M110 150 C 110 230, 290 230, 290 150 Z" fill="#EA580C" />
      <ellipse cx="200" cy="150" rx="90" ry="24" fill="#C2410C" />
      <ellipse cx="200" cy="148" rx="82" ry="20" fill="#FBBF24" />
      <!-- Dal grains scatter -->
      <circle cx="170" cy="148" r="5" fill="#F59E0B" />
      <circle cx="190" cy="144" r="6" fill="#D97706" />
      <circle cx="215" cy="147" r="5" fill="#F59E0B" />
      <circle cx="230" cy="143" r="5" fill="#B45309" />
      <circle cx="150" cy="145" r="5" fill="#D97706" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#9A3412" text-anchor="middle">PULSES &amp; DAL</text>
    </svg>
  `)}`,

  'Snacks & Biscuits': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="snkBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFBEB" />
          <stop offset="100%" stop-color="#FDE68A" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#snkBg)" />
      <!-- Big Round Cookie -->
      <circle cx="165" cy="155" r="65" fill="#D97706" />
      <circle cx="165" cy="155" r="58" fill="#F59E0B" />
      <!-- Dots -->
      <circle cx="140" cy="135" r="5" fill="#78350F" />
      <circle cx="175" cy="130" r="6" fill="#78350F" />
      <circle cx="150" cy="165" r="5" fill="#78350F" />
      <circle cx="185" cy="165" r="5" fill="#78350F" />
      <circle cx="165" cy="190" r="5" fill="#78350F" />
      <!-- Square Biscuit next to it -->
      <rect x="220" y="105" width="80" height="100" rx="12" fill="#B45309" />
      <rect x="226" y="111" width="68" height="88" rx="8" fill="#FBBF24" />
      <circle cx="245" cy="135" r="3" fill="#92400E" />
      <circle cx="275" cy="135" r="3" fill="#92400E" />
      <circle cx="245" cy="160" r="3" fill="#92400E" />
      <circle cx="275" cy="160" r="3" fill="#92400E" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#78350F" text-anchor="middle">SNACKS &amp; BISCUITS</text>
    </svg>
  `)}`,

  'Tea & Beverages': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="teaBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F0FDF4" />
          <stop offset="100%" stop-color="#BBF7D0" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#teaBg)" />
      <!-- Saucer and Cup -->
      <ellipse cx="200" cy="225" rx="90" ry="16" fill="#047857" />
      <path d="M140 140 C 140 215, 260 215, 260 140 Z" fill="#059669" />
      <!-- Handle -->
      <path d="M255 150 C 290 150, 290 195, 255 195" fill="none" stroke="#059669" stroke-width="12" stroke-linecap="round" />
      <!-- Tea Liquid -->
      <ellipse cx="200" cy="140" rx="60" ry="12" fill="#78350F" />
      <!-- Steam Lines -->
      <path d="M185 115 Q 175 95 190 75" fill="none" stroke="#10B981" stroke-width="4" stroke-linecap="round" />
      <path d="M205 115 Q 215 95 200 70" fill="none" stroke="#10B981" stroke-width="4" stroke-linecap="round" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#064E3B" text-anchor="middle">TEA &amp; BEVERAGES</text>
    </svg>
  `)}`,

  'Dairy & Ghee': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="dairyBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FEF9C3" />
          <stop offset="100%" stop-color="#FDE047" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#dairyBg)" />
      <!-- Milk Can / Matka -->
      <ellipse cx="200" cy="110" rx="55" ry="14" fill="#CA8A04" />
      <path d="M150 115 C 130 170, 130 220, 150 240 L 250 240 C 270 220, 270 170, 250 115 Z" fill="#EAB308" />
      <ellipse cx="200" cy="113" rx="46" ry="10" fill="#FEF08A" />
      <circle cx="200" cy="175" r="28" fill="#FFFFFF" opacity="0.9" />
      <path d="M200 155 C 200 155, 185 175, 185 185 C 185 195, 192 200, 200 200 C 208 200, 215 195, 215 185 C 215 175, 200 155, 200 155 Z" fill="#CA8A04" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#854D0E" text-anchor="middle">DAIRY &amp; PURE GHEE</text>
    </svg>
  `)}`,

  'Spices & Masala': `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="spiceBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF1F2" />
          <stop offset="100%" stop-color="#FECDD3" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#spiceBg)" />
      <!-- Spice Bowls -->
      <ellipse cx="145" cy="180" rx="55" ry="32" fill="#E11D48" />
      <ellipse cx="145" cy="172" rx="48" ry="24" fill="#FB7185" />
      <ellipse cx="255" cy="180" rx="55" ry="32" fill="#D97706" />
      <ellipse cx="255" cy="172" rx="48" ry="24" fill="#FBBF24" />
      <!-- Star Anise / Cinnamon icon -->
      <circle cx="200" cy="115" r="22" fill="#7C2D12" />
      <circle cx="200" cy="115" r="14" fill="#9A3412" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#9F1239" text-anchor="middle">SPICES &amp; MASALA</text>
    </svg>
  `)}`,

  default: `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <linearGradient id="defBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F1F5F9" />
          <stop offset="100%" stop-color="#CBD5E1" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" rx="16" fill="url(#defBg)" />
      <!-- Store Box / Package -->
      <rect x="135" y="105" width="130" height="120" rx="12" fill="#059669" />
      <path d="M135 145 L 265 145" stroke="#047857" stroke-width="4" />
      <path d="M200 105 L 200 225" stroke="#047857" stroke-width="4" />
      <!-- Check mark or ribbon -->
      <circle cx="200" cy="105" r="20" fill="#10B981" />
      <path d="M192 105 L 198 111 L 209 100" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <text x="200" y="278" font-family="system-ui, sans-serif" font-weight="bold" font-size="16" fill="#334155" text-anchor="middle">COOPERATIVE PRODUCT</text>
    </svg>
  `)}`,
};

/**
 * Returns a meaningful fallback image for a category
 */
export function getDefaultCategoryImage(category: string = ''): string {
  const trimmed = (category || '').trim();
  if (CATEGORY_DEFAULT_SVGS[trimmed]) {
    return CATEGORY_DEFAULT_SVGS[trimmed];
  }

  // Soft fuzzy match
  const lower = trimmed.toLowerCase();
  if (lower.includes('grain') || lower.includes('rice') || lower.includes('flour') || lower.includes('atta')) {
    return CATEGORY_DEFAULT_SVGS['Grains & Staples'];
  }
  if (lower.includes('oil') || lower.includes('ghee') || lower.includes('mustard')) {
    return CATEGORY_DEFAULT_SVGS['Edible Oils'];
  }
  if (lower.includes('dal') || lower.includes('pulse') || lower.includes('chana') || lower.includes('lentil')) {
    return CATEGORY_DEFAULT_SVGS['Pulses & Dal'];
  }
  if (lower.includes('snack') || lower.includes('biscuit') || lower.includes('cookie')) {
    return CATEGORY_DEFAULT_SVGS['Snacks & Biscuits'];
  }
  if (lower.includes('tea') || lower.includes('coffee') || lower.includes('beverage') || lower.includes('drink')) {
    return CATEGORY_DEFAULT_SVGS['Tea & Beverages'];
  }
  if (lower.includes('dairy') || lower.includes('milk') || lower.includes('paneer') || lower.includes('curd')) {
    return CATEGORY_DEFAULT_SVGS['Dairy & Ghee'];
  }
  if (lower.includes('spice') || lower.includes('masala') || lower.includes('haldi') || lower.includes('chilli')) {
    return CATEGORY_DEFAULT_SVGS['Spices & Masala'];
  }

  return CATEGORY_DEFAULT_SVGS.default;
}

/**
 * Returns valid product image URL or default category image
 */
export function getProductImage(product?: Partial<Product> | null): string {
  if (!product) return CATEGORY_DEFAULT_SVGS.default;
  if (product.image && (product.image || '').trim().length > 0) {
    return product.image;
  }
  return getDefaultCategoryImage(product.category);
}

/**
 * File validation: Checks file type and ensures size is <= 2 MB
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file format (${file.type || 'unknown'}). Please upload a JPG, PNG, WEBP, or GIF image.`,
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size too large (${fileSizeMB} MB). Maximum allowed size is ${MAX_IMAGE_SIZE_LABEL} to ensure fast app performance and storage safety.`,
    };
  }

  return { valid: true };
}

/**
 * Converts a selected image File to base64 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to data URL.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('File reading error.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Formats bytes into human-readable text
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Checks if a given barcode already exists among other products
 */
export function checkDuplicateBarcode(
  barcode: string,
  products: Product[],
  currentProductId?: number
): { isDuplicate: boolean; duplicateProduct?: Product } {
  const cleanBarcode = (barcode || '').trim();
  if (!cleanBarcode) return { isDuplicate: false };

  const match = products.find(
    (p) => (p.barcode || '').trim() === cleanBarcode && (currentProductId === undefined || p.id !== currentProductId)
  );

  return {
    isDuplicate: !!match,
    duplicateProduct: match,
  };
}

/**
 * Generates an assured unique 12-digit standard barcode for cooperative catalog
 */
export function generateUniqueBarcode(products: Product[]): string {
  const existingSet = new Set(products.map((p) => (p.barcode || '').trim()));
  let candidate = '';
  let attempts = 0;

  while (attempts < 1000) {
    // Standard India prefix 890100 + 6 randomized digits
    const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
    candidate = `890100${randomSuffix}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
    attempts++;
  }

  return `890100${Date.now().toString().slice(-6)}`;
}
