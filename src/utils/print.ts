import { CompleteInvoice, SocietyProfile } from '../types';
import { formatQuantityWithSubunit } from './looseBarcode';

export type PrintPaperFormat = '58mm' | '80mm' | 'A4';

export const printElement = (elementId: string, paperFormat?: PrintPaperFormat) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found:', elementId);
    return;
  }

  // Remove any leftover print containers or dynamic page styles
  document.querySelectorAll('.print-container').forEach((node) => node.remove());
  const existingPageStyle = document.getElementById('dynamic-print-page-style');
  if (existingPageStyle) existingPageStyle.remove();

  // Inject exact paper size rules for thermal (58mm/80mm) or A4 printers
  let pageStyle: HTMLStyleElement | null = null;
  if (paperFormat) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-print-page-style';
    if (paperFormat === '58mm') {
      pageStyle.textContent = `
        @media print {
          @page { size: 58mm auto; margin: 1mm; }
          .print-container { width: 56mm !important; padding: 0 !important; margin: 0 !important; }
          .print-container > * { max-width: 100% !important; border: none !important; box-shadow: none !important; padding: 4px !important; }
        }
      `;
    } else if (paperFormat === '80mm') {
      pageStyle.textContent = `
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          .print-container { width: 76mm !important; padding: 0 !important; margin: 0 !important; }
          .print-container > * { max-width: 100% !important; border: none !important; box-shadow: none !important; padding: 6px !important; }
        }
      `;
    } else {
      pageStyle.textContent = `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .print-container { width: 100% !important; padding: 0 !important; }
          .print-container > * { max-width: 100% !important; border: none !important; box-shadow: none !important; }
        }
      `;
    }
    document.head.appendChild(pageStyle);
  }

  // Clone the element to avoid removing it from the document
  const clone = element.cloneNode(true) as HTMLElement;
  clone.id = `${elementId}-print-clone`;

  // Create a container for printing
  const container = document.createElement('div');
  container.className = 'print-container';
  container.appendChild(clone);
  document.body.appendChild(container);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    if (container.parentNode) container.parentNode.removeChild(container);
    if (pageStyle && pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
  };

  window.addEventListener('afterprint', cleanup);

  // Trigger native browser print (sends straight to default printer when Chrome --kiosk-printing is enabled)
  window.print();

  // Safety fallback cleanup in case afterprint does not fire
  window.setTimeout(cleanup, 1500);
};

// Direct ESC/POS Thermal Printing via Web Serial API (Zero Print Dialog / Zero PDF in Chrome & Edge)
let cachedSerialPort: any = null;

export const isDirectThermalSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
};

export const printReceiptDirectThermal = async (
  invoice: CompleteInvoice,
  society: SocietyProfile,
  paperFormat: PrintPaperFormat = '80mm'
): Promise<{ ok: boolean; message: string }> => {
  if (!isDirectThermalSupported()) {
    return {
      ok: false,
      message: 'Direct USB/Serial thermal printing requires Chrome or Edge on desktop.',
    };
  }

  try {
    const navSerial = (navigator as any).serial;
    if (!cachedSerialPort) {
      const existingPorts = await navSerial.getPorts();
      cachedSerialPort = existingPorts?.[0] || (await navSerial.requestPort());
    }

    if (!cachedSerialPort.readable && !cachedSerialPort.writable) {
      await cachedSerialPort.open({ baudRate: 9600 });
    }

    const cols = paperFormat === '58mm' ? 32 : 42;
    const hr = '-'.repeat(cols);
    const padLR = (left: string, right: string) => {
      const space = Math.max(1, cols - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };
    const center = (text: string) => {
      const clean = text.slice(0, cols);
      const pad = Math.max(0, Math.floor((cols - clean.length) / 2));
      return ' '.repeat(pad) + clean;
    };

    const lines: string[] = [
      center(society.name.toUpperCase()),
      center(society.address),
      center(`Ph: ${society.phone}`),
      society.regNo ? center(`Reg: ${society.regNo}`) : '',
      society.email ? center(`Email: ${society.email}`) : '',
      society.gstin ? center(`GSTIN: ${society.gstin}`) : '',
      center('GST TAX INVOICE / RETAIL MEMO'),
      hr,
      padLR('Invoice:', invoice.invoiceNo),
      padLR('Date:', invoice.saleDate),
      padLR('Customer:', (invoice.customerName || 'Walk-in').slice(0, cols - 10)),
      padLR('Mode:', invoice.paymentMode),
      hr,
      padLR('Item / Qty', 'Total'),
      hr,
    ].filter(Boolean);

    for (const item of invoice.items) {
      const qtyStr = formatQuantityWithSubunit(item.quantity, item.unitType);
      lines.push(item.productName.slice(0, cols));
      lines.push(padLR(`  ${qtyStr}`, `Rs.${item.lineTotal.toFixed(2)}`));
    }

    lines.push(hr);
    lines.push(padLR('Taxable Base:', `Rs.${(invoice.baseAmount ?? invoice.subtotal).toFixed(2)}`));
    if ((invoice.totalGst || 0) > 0) {
      lines.push(padLR('CGST:', `Rs.${(invoice.cgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}`));
      lines.push(padLR('SGST:', `Rs.${(invoice.sgstAmount ?? (invoice.totalGst || 0) / 2).toFixed(2)}`));
      lines.push(padLR('Total GST:', `Rs.${(invoice.totalGst || 0).toFixed(2)}`));
    }
    if (invoice.discount > 0) {
      lines.push(padLR('Discount:', `-Rs.${invoice.discount.toFixed(2)}`));
    }
    if (invoice.roundOff && Math.abs(invoice.roundOff) > 0.001) {
      lines.push(
        padLR(
          'Round Off:',
          `${invoice.roundOff > 0 ? '+' : '-'}Rs.${Math.abs(invoice.roundOff).toFixed(2)}`
        )
      );
    }
    lines.push(hr);
    lines.push(padLR('NET PAYABLE:', `Rs.${invoice.grandTotal.toFixed(2)}`));
    lines.push(hr);
    lines.push(center('Thank you for patronizing'));
    lines.push(center(society.name));
    lines.push('\n\n\n');

    const encoder = new TextEncoder();
    const escInit = new Uint8Array([0x1b, 0x40]); // ESC @ initialize printer
    const escCut = new Uint8Array([0x1d, 0x56, 0x41, 0x10]); // GS V A partial cut
    const bodyBytes = encoder.encode(lines.join('\n'));

    const payload = new Uint8Array(escInit.length + bodyBytes.length + escCut.length);
    payload.set(escInit, 0);
    payload.set(bodyBytes, escInit.length);
    payload.set(escCut, escInit.length + bodyBytes.length);

    const writer = cachedSerialPort.writable.getWriter();
    try {
      await writer.write(payload);
    } finally {
      writer.releaseLock();
    }

    return { ok: true, message: 'Receipt sent directly to thermal printer!' };
  } catch (err: any) {
    cachedSerialPort = null;
    if (err?.name === 'NotFoundError') {
      return { ok: false, message: 'No serial thermal printer selected.' };
    }
    return {
      ok: false,
      message: err?.message || 'Unable to connect to USB/Serial thermal printer.',
    };
  }
};
