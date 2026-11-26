import { Product, UnitType, LoosePacket } from '../types';

export interface LooseBarcodeResult {
  product: Product;
  quantityInBaseUnit: number; // e.g. 0.25 for 250 GM on a KG item
  weightText: string; // e.g. "250 GM" or "500 ML"
  calculatedPrice: number;
  packet?: LoosePacket;
  alreadySold?: boolean;
  alreadySoldInfo?: string;
}

/**
 * Loose packets are stored and fetched directly from Supabase (loose_packets table).
 * LocalStorage caching is disabled.
 */
export function getStoredLoosePackets(): LoosePacket[] {
  return [];
}

/**
 * No-op: Loose packets are saved exclusively to the Supabase loose_packets table.
 */
export function saveLoosePackets(_packets: LoosePacket[]): void {
  // Intentionally disabled: All data is saved exclusively to Supabase tables.
}

/**
 * Check if a barcode is duplicate (exists in product catalog or existing loose packets)
 */
export function isBarcodeDuplicate(
  barcode: string,
  products: Product[],
  packets: LoosePacket[]
): boolean {
  const clean = (barcode || '').trim().toLowerCase();
  if (!clean) return false;

  const existsInProducts = products.some(
    (p) => (p.barcode || '').trim().toLowerCase() === clean
  );
  const existsInPackets = packets.some(
    (pk) => (pk.uniqueBarcode || '').trim().toLowerCase() === clean
  );

  return existsInProducts || existsInPackets;
}

/**
 * Generates a guaranteed unique barcode for a measured loose package.
 * Format: BASECODE-WEIGHT-SEQ (e.g., 890100100101-250G-1001)
 */
export function generateUniqueLooseBarcode(
  product: Product,
  gramsOrMl: number,
  packets: LoosePacket[],
  products: Product[]
): string {
  const isVol = product.unit === 'LTR' || product.unit === 'ML';
  const unitSuffix = isVol ? 'ML' : 'G';
  const basePrefix = `${product.barcode}-${gramsOrMl}${unitSuffix}`;

  // Find existing count for this prefix to generate unique sequence
  let seq = 1001;
  let candidate = `${basePrefix}-${seq}`;

  while (isBarcodeDuplicate(candidate, products, packets)) {
    seq++;
    candidate = `${basePrefix}-${seq}`;
  }

  return candidate;
}

/**
 * Parses a scanned or entered barcode string to see if it represents a loose item.
 * First checks registered unique loose packets!
 */
export function parseLooseBarcode(
  scannedCode: string,
  products: Product[],
  packets: LoosePacket[] = getStoredLoosePackets()
): LooseBarcodeResult | null {
  const cleanCode = (scannedCode || '').trim();
  if (!cleanCode) return null;

  // 1. Check Registered Loose Packets Database first!
  const matchedPacket = packets.find(
    (pk) => (pk.uniqueBarcode || '').toLowerCase() === cleanCode.toLowerCase()
  );

  if (matchedPacket) {
    const parentProd = products.find((p) => p.id === matchedPacket.productId) || {
      id: matchedPacket.productId,
      name: matchedPacket.productName,
      category: 'Fertilizer',
      barcode: matchedPacket.baseBarcode,
      unit: matchedPacket.unit,
      sellingPrice: matchedPacket.unitPrice,
      costPrice: matchedPacket.unitPrice * 0.8,
      stock: 100,
      minStockLevel: 10,
      batchNo: 'B-2026',
      image: '',
    };

    if (matchedPacket.status === 'SOLD') {
      return {
        product: parentProd as Product,
        quantityInBaseUnit: matchedPacket.quantityInBaseUnit,
        weightText: matchedPacket.weightText,
        calculatedPrice: matchedPacket.calculatedPrice,
        packet: matchedPacket,
        alreadySold: true,
        alreadySoldInfo: `⚠️ Package #${matchedPacket.uniqueBarcode} was ALREADY SOLD on ${matchedPacket.soldDate || 'previous sale'} (Invoice: ${matchedPacket.soldAtInvoiceNo || 'N/A'})!`,
      };
    }

    return {
      product: parentProd as Product,
      quantityInBaseUnit: matchedPacket.quantityInBaseUnit,
      weightText: matchedPacket.weightText,
      calculatedPrice: matchedPacket.calculatedPrice,
      packet: matchedPacket,
      alreadySold: false,
    };
  }

  // 2. Direct Catalog Barcode match check
  const exactMatch = products.find(
    (p) => (p.barcode || '').toLowerCase() === cleanCode.toLowerCase()
  );

  // 3. Loose Suffix pattern check e.g. "BASECODE-250G", "BASECODE-500ML-1001"
  if (cleanCode.includes('-')) {
    const parts = cleanCode.split('-');
    const baseCode = parts[0].trim();
    const suffix = parts[1]?.toUpperCase().trim() || '';

    const matchedProd = products.find(
      (p) => (p.barcode || '').toLowerCase() === baseCode.toLowerCase()
    );

    if (matchedProd) {
      let gramsOrMl = 0;
      let weightText = '';

      if (suffix.endsWith('GM') || suffix.endsWith('G')) {
        const num = parseFloat(suffix.replace(/GM|G/g, ''));
        if (!isNaN(num) && num > 0) {
          gramsOrMl = num;
          weightText = `${num} GM`;
        }
      } else if (suffix.endsWith('ML')) {
        const num = parseFloat(suffix.replace(/ML/g, ''));
        if (!isNaN(num) && num > 0) {
          gramsOrMl = num;
          weightText = `${num} ML`;
        }
      } else if (suffix.endsWith('KG')) {
        const num = parseFloat(suffix.replace(/KG/g, ''));
        if (!isNaN(num) && num > 0) {
          gramsOrMl = num * 1000;
          weightText = `${num * 1000} GM (${num} KG)`;
        }
      } else if (suffix.endsWith('LTR') || suffix.endsWith('L')) {
        const num = parseFloat(suffix.replace(/LTR|L/g, ''));
        if (!isNaN(num) && num > 0) {
          gramsOrMl = num * 1000;
          weightText = `${num * 1000} ML (${num} LTR)`;
        }
      } else {
        const num = parseFloat(suffix);
        if (!isNaN(num) && num > 0) {
          gramsOrMl = num;
          weightText = `${num} GM/ML`;
        }
      }

      if (gramsOrMl > 0) {
        const qtyInBase = gramsOrMl / 1000;
        const calculatedPrice = matchedProd.sellingPrice * qtyInBase;
        return {
          product: matchedProd,
          quantityInBaseUnit: qtyInBase,
          weightText,
          calculatedPrice,
        };
      }
    }
  }

  // 4. EAN-13 Scale Barcode pattern check e.g. "20" + 5 digits SKU + 5 digits Grams
  if (cleanCode.length >= 12 && cleanCode.startsWith('20')) {
    const skuPart = cleanCode.substring(2, 7);
    const weightPart = cleanCode.substring(7, 12);
    const grams = parseInt(weightPart, 10);

    const matchedProd = products.find(
      (p) =>
        p.barcode.endsWith(skuPart) ||
        p.id.toString().padStart(5, '0') === skuPart
    );

    if (matchedProd && !isNaN(grams) && grams > 0) {
      const qtyInBase = grams / 1000;
      const calculatedPrice = matchedProd.sellingPrice * qtyInBase;
      return {
        product: matchedProd,
        quantityInBaseUnit: qtyInBase,
        weightText: `${grams} GM`,
        calculatedPrice,
      };
    }
  }

  // Fallback to exact catalog match if available
  if (exactMatch) {
    return {
      product: exactMatch,
      quantityInBaseUnit: 1,
      weightText: `1 ${exactMatch.unit}`,
      calculatedPrice: exactMatch.sellingPrice,
    };
  }

  return null;
}

/**
 * Format helper for unit conversion e.g. 0.25 KG -> 250 GM
 */
export function formatQuantityWithSubunit(
  qty: number,
  unit: UnitType
): string {
  if (unit === 'KG') {
    if (qty < 1) {
      return `${Math.round(qty * 1000)} GM`;
    }
    return `${qty} KG`;
  }
  if (unit === 'LTR') {
    if (qty < 1) {
      return `${Math.round(qty * 1000)} ML`;
    }
    return `${qty} LTR`;
  }
  if (unit === 'GM') {
    return `${qty} GM`;
  }
  if (unit === 'ML') {
    return `${qty} ML`;
  }
  return `${qty} ${unit}`;
}
