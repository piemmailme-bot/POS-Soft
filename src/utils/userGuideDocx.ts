import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  InternalHyperlink,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const COLOR_DARK = '0F172A';
const COLOR_ACCENT = '059669';
const COLOR_GOLD = 'B45309';
const COLOR_MUTED = '475569';
const COLOR_LIGHT_BG = 'F8FAFC';
const COLOR_ALT_BG = 'F1F5F9';
const COLOR_ACCENT_BG = 'ECFDF5';
const COLOR_BORDER = 'CBD5E1';

interface IndexEntry {
  secNo: string;
  title: string;
  bookmarkId: string;
  roleAccess: string;
  summary: string;
}

const INDEX_ENTRIES: IndexEntry[] = [
  {
    secNo: '01',
    title: 'Workspace Layout & Right-Side Navigation Sidebar',
    bookmarkId: 'sec_01',
    roleAccess: 'All Staff',
    summary: 'Top Action Bar (POS, Scanner, Refresh) & Categorized Right Sidebar',
  },
  {
    secNo: '02',
    title: 'Getting Started, Role-Based Sign In & Password Reset',
    bookmarkId: 'sec_02',
    roleAccess: 'All Staff',
    summary: 'Cashier & Admin Portals, RBAC Permissions & Password Updates',
  },
  {
    secNo: '03',
    title: 'Smart POS & Billing Terminal (Checkout, Split & Credit)',
    bookmarkId: 'sec_03',
    roleAccess: 'All Cashiers',
    summary: 'Shortcuts, Expiry Warnings, Hold/Resume, UPI/Cash/Split/Udhaar & Tax Invoice',
  },
  {
    secNo: '04',
    title: 'Product & Stock Catalog, Expiry Alerts & Restocking',
    bookmarkId: 'sec_04',
    roleAccess: 'All Staff',
    summary: 'HSN Codes, Weighted-Avg Cost, Batch Expiry Filters & Bulk Excel Import',
  },
  {
    secNo: '05',
    title: 'Daily Reports, Z-Report Drawer & Purchase/Sell Summary',
    bookmarkId: 'sec_05',
    roleAccess: 'Cashier / Sr.',
    summary: 'Day Summary, Cash Drawer Z-Report Closing, Invoices & Purchase and Sell summary',
  },
  {
    secNo: '06',
    title: 'Indian Standard Final Accounts & Balance Sheet',
    bookmarkId: 'sec_06',
    roleAccess: 'Sr. / Mgr / Admin',
    summary: 'Trading A/c, P&L A/c, Double-Column Cash & Bank Book, Balance Sheet & Trial Balance',
  },
  {
    secNo: '07',
    title: 'Ledger Vouchers, Parties, Credit/Debit Returns & Fixed Assets',
    bookmarkId: 'sec_07',
    roleAccess: 'Sr. / Mgr / Admin',
    summary: 'Salary/Expense & Income Vouchers, Contra, Suppliers/Members, Returns & Depreciation',
  },
  {
    secNo: '08',
    title: 'GST Compliance, GSTR-1 HSN Summary & PMT-06 Challan',
    bookmarkId: 'sec_08',
    roleAccess: 'Sr. / Mgr / Admin',
    summary: 'Output vs Input ITC, B2B/B2C Split, Table 12 HSN Summary & Challan Payments',
  },
  {
    secNo: '09',
    title: 'Admin Control Center & Security Policies',
    bookmarkId: 'sec_09',
    roleAccess: 'System Admin',
    summary: '4-Mode Transaction Freeze, Staff RBAC, Strict UTR, Audit Logs & DB Viewer',
  },
  {
    secNo: '10',
    title: 'Cloud Storage, Auto-Snapshots & Full Backup / Restore',
    bookmarkId: 'sec_10',
    roleAccess: 'System Admin',
    summary: 'Supabase PostgreSQL Sync, JSON & SQL Dumps, Daily Snapshots & Restore',
  },
  {
    secNo: '11',
    title: 'Quick Troubleshooting & Operational Checklist',
    bookmarkId: 'sec_11',
    roleAccess: 'All Staff',
    summary: 'Sign-In Checks, Transaction Holds, Expiry Locks & Cloud Sync Verification',
  },
];

function heading1(text: string, bookmarkId?: string): Paragraph {
  const titleRun = new TextRun({
    text,
    bold: true,
    size: 28,
    color: COLOR_DARK,
    font: 'Calibri',
  });

  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    border: {
      bottom: { color: COLOR_ACCENT, space: 4, style: BorderStyle.SINGLE, size: 8 },
    },
    children: bookmarkId
      ? [
          new Bookmark({
            id: bookmarkId,
            children: [titleRun],
          }),
        ]
      : [titleRun],
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 23,
        color: COLOR_ACCENT,
        font: 'Calibri',
      }),
    ],
  });
}

function bodyPara(text: string, boldPrefix?: string): Paragraph {
  const runs: TextRun[] = [];
  if (boldPrefix) {
    runs.push(
      new TextRun({
        text: boldPrefix,
        bold: true,
        size: 21,
        color: COLOR_DARK,
        font: 'Calibri',
      })
    );
  }
  runs.push(
    new TextRun({
      text,
      size: 21,
      color: '1E293B',
      font: 'Calibri',
    })
  );
  return new Paragraph({
    spacing: { after: 90, line: 270 },
    children: runs,
  });
}

function bulletItem(text: string, boldPrefix?: string): Paragraph {
  const runs: TextRun[] = [];
  if (boldPrefix) {
    runs.push(
      new TextRun({
        text: boldPrefix,
        bold: true,
        size: 21,
        color: COLOR_DARK,
        font: 'Calibri',
      })
    );
  }
  runs.push(
    new TextRun({
      text,
      size: 21,
      color: '1E293B',
      font: 'Calibri',
    })
  );
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 65, line: 260 },
    children: runs,
  });
}

function calloutBox(title: string, text: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: COLOR_ACCENT_BG, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
              left: { style: BorderStyle.SINGLE, size: 18, color: COLOR_ACCENT },
              right: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT },
            },
            margins: { top: 110, bottom: 110, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 45 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 21,
                    color: COLOR_ACCENT,
                    font: 'Calibri',
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text,
                    size: 20,
                    color: COLOR_DARK,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildIndexTable(): Table {
  const headers = ['Sec.', 'Module & Topic Title (Click to Jump)', 'Access Role', 'Key Operations Covered'];
  const headerWidths = [8, 38, 17, 37];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, idx) =>
        new TableCell({
          width: { size: headerWidths[idx], type: WidthType.PERCENTAGE },
          shading: { fill: COLOR_DARK, type: ShadingType.CLEAR },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
          },
          margins: { top: 90, bottom: 90, left: 110, right: 110 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  size: 19,
                  color: 'FFFFFF',
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        })
    ),
  });

  const rows = INDEX_ENTRIES.map(
    (entry, idx) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 8, type: WidthType.PERCENTAGE },
            shading: { fill: idx % 2 === 1 ? COLOR_ALT_BG : COLOR_LIGHT_BG, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            },
            margins: { top: 75, bottom: 75, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: entry.secNo,
                    bold: true,
                    size: 19,
                    color: COLOR_ACCENT,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 38, type: WidthType.PERCENTAGE },
            shading: { fill: idx % 2 === 1 ? COLOR_ALT_BG : 'FFFFFF', type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            },
            margins: { top: 75, bottom: 75, left: 110, right: 110 },
            children: [
              new Paragraph({
                children: [
                  new InternalHyperlink({
                    anchor: entry.bookmarkId,
                    children: [
                      new TextRun({
                        text: entry.title,
                        bold: true,
                        size: 19,
                        color: COLOR_DARK,
                        underline: {},
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 17, type: WidthType.PERCENTAGE },
            shading: { fill: idx % 2 === 1 ? COLOR_ALT_BG : 'FFFFFF', type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            },
            margins: { top: 75, bottom: 75, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.roleAccess,
                    bold: true,
                    size: 18,
                    color: entry.roleAccess.includes('Admin') ? COLOR_GOLD : COLOR_MUTED,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 37, type: WidthType.PERCENTAGE },
            shading: { fill: idx % 2 === 1 ? COLOR_ALT_BG : 'FFFFFF', type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
            },
            margins: { top: 75, bottom: 75, left: 110, right: 110 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.summary,
                    size: 18,
                    color: '334155',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  });
}

function simpleTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          shading: { fill: COLOR_DARK, type: ShadingType.CLEAR },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_DARK },
          },
          margins: { top: 90, bottom: 90, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  size: 19,
                  color: 'FFFFFF',
                  font: 'Calibri',
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = rows.map(
    (row, idx) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              shading: {
                fill: idx % 2 === 1 ? COLOR_ALT_BG : 'FFFFFF',
                type: ShadingType.CLEAR,
              },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell,
                      size: 19,
                      color: '1E293B',
                      font: 'Calibri',
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

export function buildUserGuideDocument(): Document {
  return new Document({
    creator: 'Deganga CADPFSCS Ltd',
    title: 'Deganga CADPFSCS Ltd - POS, Inventory, GST & Accounting Operations Manual',
    description:
      'Complete operations guide with clickable index covering POS billing, inventory, Z-Report, Indian Standard Final Accounts, GST compliance, and cloud backup.',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 960, right: 960, bottom: 960, left: 960 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Deganga CADPFSCS Ltd · Village : Berachampa, Dist. North 24 Parganas',
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Deganga CADPFSCS Ltd — Smart POS & Indian Accounting Guide  |  Page ',
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    text: ' of ',
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // =====================================================================
          // PAGE 1 & 2: COVER TITLE BANNER + CLICKABLE INDEX / TABLE OF CONTENTS
          // =====================================================================
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 60 },
            children: [
              new TextRun({
                text: 'DEGANGA CADPFSCS LTD',
                bold: true,
                size: 44,
                color: COLOR_DARK,
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: 'Village : Berachampa  ·  Dist. North 24 Parganas, West Bengal',
                bold: true,
                size: 23,
                color: COLOR_ACCENT,
                font: 'Calibri',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: 'Complete User & Administrator Operations Guide — Smart POS, Inventory, GST & Indian Final Accounts',
                size: 24,
                color: COLOR_MUTED,
                font: 'Calibri',
              }),
            ],
          }),

          calloutBox(
            'About This Operations Manual',
            'This manual covers daily counter billing (barcode & loose weighed items), Split & Cooperative Member Credit checkout, expiry-aware inventory management, Day-End Z-Report drawer closing, Indian Standard Final Accounts (Trading A/c, P&L A/c, Cash & Bank Book, Balance Sheet, Trial Balance), GST GSTR-1 / HSN compliance, Role-Based Access Control, and Cloud Database Backup.'
          ),

          new Paragraph({
            spacing: { before: 220, after: 100 },
            border: {
              bottom: { color: COLOR_ACCENT, space: 4, style: BorderStyle.SINGLE, size: 8 },
            },
            children: [
              new TextRun({
                text: 'INDEX — QUICK NAVIGATION & SECTION DIRECTORY',
                bold: true,
                size: 26,
                color: COLOR_DARK,
                font: 'Calibri',
              }),
            ],
          }),
          bodyPara(
            'Use the clickable index below (hold Ctrl + Click in Microsoft Word) to jump directly to any module or accounting procedure:'
          ),

          buildIndexTable(),

          new Paragraph({
            spacing: { before: 140 },
            children: [
              new TextRun({
                text: 'Tip: Keep Page 1–2 printed at the POS counter for fast staff onboarding and day-end closing checks.',
                italics: true,
                size: 19,
                color: COLOR_MUTED,
                font: 'Calibri',
              }),
            ],
          }),

          // Clean Page Break after Index so Section 1 begins on a fresh page
          new Paragraph({
            children: [new PageBreak()],
          }),

          // =====================================================================
          // SECTION 1: WORKSPACE LAYOUT & RIGHT-SIDEBAR NAVIGATION
          // =====================================================================
          heading1('1. Workspace Layout & Right-Side Navigation Sidebar', 'sec_01'),
          bodyPara(
            'The application uses a clean, distraction-free workspace with three primary controls pinned in the Top Header and all categorized modules organized inside the Right-Side Control Sidebar.'
          ),
          heading2('1.1 Top Header Controls (Always Visible)'),
          bulletItem('Returns immediately to the active billing terminal from any report or screen, showing the live cart item counter.', 'Smart POS & Billing: '),
          bulletItem('Opens the camera or handheld USB barcode/QR scanner modal to scan items straight into the active bill.', 'Scan QR / Barcode: '),
          bulletItem('Synchronizes products, stock levels, sales, purchases, vouchers, and cloud status from the backend database.', 'Refresh: '),
          bulletItem('Shows live Supabase Cloud sync status, society address, live clock, and active cashier name/role.', 'Top Micro-Bar: '),

          heading2('1.2 Right-Side Categorized Sidebar'),
          bodyPara(
            'All operational screens and tools are grouped into four color-coded categories on the right side of the workspace (with a Collapse/Expand rail button on desktop and a Menu drawer button on tablets/phones):'
          ),
          simpleTable(
            ['Sidebar Category', 'Included Menus & Tools', 'Who Can Access'],
            [
              ['Inventory & Barcodes', 'Product & Stock Catalog (with low-stock alert badge), Weigh & Print Barcode, Print Barcodes', 'All Signed-In Staff'],
              ['Sales & Daily Ops', 'Day & Cashier Summary, Cash Drawer (Z-Report), Invoice Analytics', 'All Signed-In Staff'],
              ['Accounts, Tax & Audit', 'Purchase and Sell summary, Accounts & Balance Sheet, GST Analysis', 'Senior Cashier, Society Manager, System Admin'],
              ['System & Security', 'Admin Center (Admin only), Cloud Backup & Restore, User Guide (.docx), Reset Password, Lock / Log Out', 'Role-Based / All Staff'],
            ]
          ),
          new Paragraph({ spacing: { after: 100 } }),

          // =====================================================================
          // SECTION 2: GETTING STARTED, LOGIN & PASSWORD RESET
          // =====================================================================
          heading1('2. Getting Started, Role-Based Sign In & Password Reset', 'sec_02'),
          bodyPara(
            'Authentication is verified server-side with salted scrypt password hashing and HMAC session tokens. Choose Cashier Staff Sign In or Administrator Login at the bottom of the sign-in screen.'
          ),
          heading2('2.1 Role-Based Access Control (RBAC)'),
          bulletItem('Access to Smart POS & Billing, Product & Stock Catalog, Day & Cashier Summary, Cash Drawer (Z-Report), and Invoice Analytics.', 'POS Cashier: '),
          bulletItem('Includes all Cashier screens plus Purchase and Sell summary, Accounts & Balance Sheet, and GST Analysis.', 'Senior Cashier / Society Manager: '),
          bulletItem('Full access including Admin Center, Staff Accounts, Transaction Freeze controls, Audit Logs, Database Table Viewer, and Cloud Backup/Restore.', 'System Admin: '),
          heading2('2.2 Resetting Your Password (User & Admin)'),
          bulletItem('Click "Reset Password" on the Sign-In screen or inside the System & Security section of the Right Sidebar.', 'Open Reset Window: '),
          bulletItem('Select Account Type ("Cashier / User" or "Administrator"), verify your Existing Password, enter your New Password (minimum 4 characters), and click "Update Password".', 'Verify & Save: '),

          // =====================================================================
          // SECTION 3: SMART POS & BILLING TERMINAL
          // =====================================================================
          heading1('3. Smart POS & Billing Terminal (Checkout, Split & Credit)', 'sec_03'),
          bodyPara(
            'The Smart POS & Billing screen calculates GST cleanly once on the Excl.-GST base rate (CGST + SGST) and rounds the final payable amount consistently across invoices and accounts.'
          ),
          heading2('3.1 Fast Billing, Shortcuts & Expiry Safety'),
          bulletItem('Press F2 to jump straight to Product Search, F4 to open Barcode/QR Scanner, F8 for UPI Checkout, and F9 for Cash Checkout.', 'Keyboard Shortcuts: '),
          bulletItem('Use "Weigh & Print Barcode" for loose packed bags or "Direct Scale" to enter loose grams/milliliters directly on the counter.', 'Loose Weight Items: '),
          bulletItem('Products past their expiry date or expiring within 30 days display clear visual badges and confirmation warnings before billing.', 'Batch Expiry Alerts: '),
          heading2('3.2 Customer Modes, Member Discount & Hold/Park Bills'),
          bulletItem('Bill as "Walk-in Customer" or select a registered Cooperative Farmer Member to track credit limits and optionally apply the Co-op Member Rebate %.', 'Member & B2B GSTIN: '),
          bulletItem('Enter an optional Buyer GSTIN on the bill to classify the invoice as a B2B Tax Invoice in GSTR-1 Table 4A.', 'Buyer GSTIN (B2B): '),
          bulletItem('Click "Hold Bill" to park an active customer cart while serving the next customer, then click "Resume" when they return.', 'Hold / Resume Bill: '),
          heading2('3.3 Four Checkout Modes & Multi-Format Receipt Printing'),
          bulletItem('Displays the official Indian Bank QR and dynamic Auto-Amount UPI QR (21785723893@indianbk) for exact invoice amounts. If Strict UTR Validation is enabled by Admin, a valid 12-digit UTR/reference is required.', '1. UPI / Official Bank QR: '),
          bulletItem('Enter cash received from the customer to compute exact change due automatically.', '2. Cash Payment: '),
          bulletItem('Accept part payment in Cash and the remainder via UPI QR on the same invoice.', '3. Split Payment (Cash + UPI): '),
          bulletItem('Bill registered Cooperative Members on Udhaar (Sundry Debtors), with optional Cash down-payment.', '4. Member Credit (Udhaar): '),
          bulletItem('After checkout, print Tax Invoices in 58mm Thermal, 80mm Thermal, or A4 Tax Invoice format (including Society GSTIN, HSN codes, and CGST/SGST split).', 'Receipt Formats: '),

          // =====================================================================
          // SECTION 4: PRODUCT & STOCK CATALOG
          // =====================================================================
          heading1('4. Product & Stock Catalog, Expiry Alerts & Restocking', 'sec_04'),
          bodyPara(
            'Manage fertilizers, pesticides, seeds, and cooperative store items from Inventory & Barcodes -> Product & Stock Catalog in the Right Sidebar.'
          ),
          bulletItem('Register items with Barcode, HSN/SAC Code (e.g., 3105 Fertilizers, 3808 Pesticides), Category, Unit, Purchase Cost (Excl. GST), Selling Rate, GST %, Batch No., Expiry Date, and Min Stock Level.', 'Add / Edit Product: '),
          bulletItem('Use "Fill Existing Stock" to record incoming stock with Supplier selection, Supplier Invoice No., Payment Status (Credit / Cash / Bank UPI), and optional Weighted-Average Cost update.', 'Restock & Weighted-Avg Cost: '),
          bulletItem('Use the quick status filters ("Low Stock", "Out of Stock", "Expired", "Expiring ≤ 30d", "Expiring ≤ 60d") to audit shelf stock before sale.', 'Expiry & Stock Filters: '),
          bulletItem('Import product sheets via Bulk Excel Import or print product Barcode/QR stickers cleanly.', 'Bulk Import & Stickers: '),

          // =====================================================================
          // SECTION 5: DAILY REPORTS, Z-REPORT & PURCHASE AND SELL SUMMARY
          // =====================================================================
          heading1('5. Daily Reports, Z-Report Drawer & Purchase/Sell Summary', 'sec_05'),
          simpleTable(
            ['Menu Name', 'Purpose & Key Metrics', 'Actions Available'],
            [
              [
                'Day & Cashier Summary',
                'Shows active business dates and cashiers with sales > 0, gross turnover, and payment breakdown.',
                'Filter by date/cashier, open invoices, export CSV.',
              ],
              [
                'Cash Drawer (Z-Report)',
                'Date-scoped daily drawer reconciliation: Opening Float + Cash Sales (incl. Split Cash) + Cash Receipts - Cash Outflows/Purchases/Refunds.',
                'Count note denominations, Auto-Match, Save & Print Z-Report Closing.',
              ],
              [
                'Invoice Analytics',
                'Full invoice ledger showing taxable base, CGST/SGST, Buyer GSTIN, split amounts, and items.',
                'Search bills, reprint 58mm/80mm/A4 Tax Invoice, export CSV.',
              ],
              [
                'Purchase and Sell summary',
                'Side-by-side product-wise stock purchased vs. sold, Input GST paid vs. Output GST collected, and profit margin.',
                'Click Utilize per product, filter scope, Download Excel, Print.',
              ],
            ]
          ),
          new Paragraph({ spacing: { after: 100 } }),

          // =====================================================================
          // SECTION 6: INDIAN STANDARD FINAL ACCOUNTS & BALANCE SHEET
          // =====================================================================
          heading1('6. Indian Standard Final Accounts & Balance Sheet', 'sec_06'),
          bodyPara(
            'Located under Accounts, Tax & Audit -> Accounts & Balance Sheet. Follows standard Indian accounting principles where raw Purchases and Sales remain in the Trading Account and only Net Profit/Loss transfers to Capital on the Balance Sheet.'
          ),
          bulletItem('Displays Opening Stock, Purchases (less Debit Notes), Direct Sales (Excl. GST less Credit Notes), Closing Stock Valuation, Cost of Goods Sold (COGS), and Gross Profit / Gross Loss.', '1. Trading Account: '),
          bulletItem('Carries forward Gross Profit, adds Round-off & Other Income vouchers, deducts Operating Expenses (Staff Salary, Shop Rent, Electricity, etc.) and Fixed Asset Depreciation to compute Net Profit / Net Loss.', '2. Profit & Loss Account: '),
          bulletItem('Tracks every Cash and Bank/UPI inflow & outflow including Sales, Split Receipts, Supplier Payments, Member Dues Receipts, Contra Transfers, Expense/Income Vouchers, Returns, and PMT-06 GST Challans.', '3. Double-Column Cash & Bank Book: '),
          bulletItem('Shows Liabilities & Capital (Opening Capital, Share Capital, Cooperative Reserve Fund, Net Profit, Sundry Creditors, Net GST Payable) balanced identically against Assets (Fixed Assets Net Block, Closing Stock, Sundry Debtors, Cash in Hand, Bank/UPI Balance, ITC Receivable) with ₹0.00 variance.', '4. Cooperative Balance Sheet: '),
          bulletItem('Summarizes all Debit and Credit ledger balances with Total Dr = Total Cr verification.', '5. Trial Balance: '),
          bodyPara(
            'Use "Day Wise" or "Date Range Wise" filters, adjust Opening Cash/Bank & Purchase Settlement Mode (saved to the database), and click "Print" (current statement) or "Print All" (complete financial package).'
          ),

          // =====================================================================
          // SECTION 7: LEDGER VOUCHERS, PARTIES, RETURNS & FIXED ASSETS
          // =====================================================================
          heading1('7. Ledger Vouchers, Parties, Returns & Fixed Assets', 'sec_07'),
          bodyPara(
            'Inside Accounts & Balance Sheet, sub-tabs 6 through 9 handle all non-billing accounting entries without distorting product stock counts:'
          ),
          bulletItem('Record Staff Salary, Rent, Electricity, or Other Income (Scrap/Interest/Commission), plus Contra Vouchers (Cash deposited to Bank or Cash withdrawn from Bank), Supplier Bill Payments, and Member Dues Receipts.', '6. Ledger Vouchers: '),
          bulletItem('Maintain Supplier (Sundry Creditors) and Co-op Farmer Member (Sundry Debtors) accounts with opening balances, GSTIN/Member Code, and credit limits.', '7. Suppliers & Members Master: '),
          bulletItem('Issue Credit Notes (Sales Returns) or Debit Notes (Purchase Returns) to automatically reverse inventory stock, GST Output/ITC, and Cash/Bank/Party balances.', '8. Credit / Debit Returns: '),
          bulletItem('Register weighing scales, computers, racks, and buildings with annual depreciation % flowing automatically to P&L Depreciation and Balance Sheet Net Fixed Assets.', '9. Fixed Assets & Depreciation: '),

          // =====================================================================
          // SECTION 8: GST COMPLIANCE & ANALYSIS
          // =====================================================================
          heading1('8. GST Compliance, GSTR-1 HSN Summary & PMT-06 Challan', 'sec_08'),
          bodyPara(
            'Open Accounts, Tax & Audit -> GST Analysis to monitor monthly or period GST compliance:'
          ),
          bulletItem('Compares Output CGST/SGST from Sales (less Credit Notes) against Input CGST/SGST ITC from Purchases (less Debit Notes) plus Opening CGST/SGST ITC.', 'Output vs. Input ITC Ledger: '),
          bulletItem('Automatically separates B2B Tax Invoices (GSTR-1 Table 4A, where Buyer GSTIN is entered) from retail B2C Supplies (GSTR-1 Table 7).', 'B2B vs. B2C Split: '),
          bulletItem('Aggregates outward supplies by HSN/SAC Code, Unit (UQC), Taxable Value, CGST, SGST, and GST Rate for effortless GSTR-1 filing.', 'GSTR-1 Table 12 HSN Summary: '),
          bulletItem('Log monthly PMT-06 challan payments paid via Bank/UPI or Cash, automatically reducing Net GST Payable on the Balance Sheet.', 'Govt GST Challan (PMT-06): '),

          // =====================================================================
          // SECTION 9: ADMIN CONTROL CENTER
          // =====================================================================
          heading1('9. Admin Control Center & Security Policies', 'sec_09'),
          bodyPara(
            'Available exclusively to System Admin users via System & Security -> Admin Center:'
          ),
          heading2('9.1 Four-Category Transaction Controls'),
          simpleTable(
            ['Mode', 'POS Sales (Sell)', 'Stock Purchases / Edits', 'Recommended Use'],
            [
              ['Stop Transaction', 'Paused', 'Paused', 'Audit freeze, stock verification, or society holiday.'],
              ['Only Sell', 'Active', 'Paused', 'Allow customer billing while locking inventory changes.'],
              ['Only Purchase', 'Paused', 'Active', 'Allow stock receiving while POS billing is closed.'],
              ['Both', 'Active', 'Active', 'Standard daily store operations.'],
            ]
          ),
          new Paragraph({ spacing: { after: 90 } }),
          bulletItem('Add cashiers, assign roles (POS Cashier, Senior Cashier, Society Manager, System Admin), activate/deactivate accounts, or reset PINs.', 'Cashier Staff Management: '),
          bulletItem('Configure UPI/Cash/Member Credit toggles, strict 12-digit UPI UTR enforcement, Co-op Member Rebate %, Society GSTIN, State Code, Financial Year, Share Capital, and Reserve Fund.', 'Policies & Society Config: '),
          bulletItem('Inspect timestamped security audit logs and query all 14 live database tables directly with JSON/CSV export.', 'Audit Logs & Database Tables: '),

          // =====================================================================
          // SECTION 10: CLOUD STORAGE & BACKUP
          // =====================================================================
          heading1('10. Cloud Storage, Auto-Snapshots & Full Backup / Restore', 'sec_10'),
          bodyPara(
            'The system persists all 14 operational & accounting tables to Supabase PostgreSQL with local disk protection and automatic daily snapshot retention.'
          ),
          bulletItem('Downloads a single JSON archive containing products, invoices, purchases, GST payments, ledger vouchers, suppliers/members, return notes, fixed assets, drawer Z-Reports, settings, and logs.', 'Download Full JSON Backup: '),
          bulletItem('Generates a complete PostgreSQL .sql dump with UPSERT statements covering all tables.', 'Download SQL Dump (.sql): '),
          bulletItem('Create, download, restore, or delete server-side snapshots, or upload a .json backup file to restore the full store.', 'Server Snapshots & Restore: '),

          // =====================================================================
          // SECTION 11: TROUBLESHOOTING
          // =====================================================================
          heading1('11. Quick Troubleshooting & Operational Checklist', 'sec_11'),
          bulletItem('Confirm you are on the right tab ("Cashier Login" vs. "Admin Login") and verify your Login ID/PIN. Use "Reset Password" if needed.', 'Unable to Sign In: '),
          bulletItem('Check the top alert banner; an Administrator may have enabled "Stop Transaction", "Only Sell", or "Only Purchase".', 'POS Checkout or Stock Add Blocked: '),
          bulletItem('On UPI checkout, check whether Strict UTR Validation is enabled in Admin Center—if so, enter the customer’s 12-digit UTR number.', 'UPI Confirm Button Disabled: '),
          bulletItem('Click "Refresh" in the top bar or open Cloud Backup & Restore -> "Sync Now" to verify Supabase cloud connectivity.', 'Data Not Appearing Across Counters: '),
        ],
      },
    ],
  });
}

export async function buildUserGuideBuffer(): Promise<Buffer> {
  const doc = buildUserGuideDocument();
  return await Packer.toBuffer(doc);
}
