-- MySQL Backend Database Backup for Nabkul Cooperative Society POS
-- Generated on: 2026-10-31

CREATE DATABASE IF NOT EXISTS nabkul_pos;
USE nabkul_pos;

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    barcode VARCHAR(50) UNIQUE,
    unit VARCHAR(10),
    sellingPrice DECIMAL(10, 2),
    costPrice DECIMAL(10, 2),
    stock DECIMAL(10, 3),
    minStockLevel DECIMAL(10, 3),
    batchNo VARCHAR(50),
    expiryDate DATE,
    image TEXT,
    description TEXT,
    featured BOOLEAN DEFAULT FALSE
);

INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description, featured) VALUES (101, 'Basmati Rice (Premium)', 'Grains & Staples', '890100100101', 'KG', 100.0, 84.0, 135.5, 30.0, 'B-RICE-26A', '2027-06-30', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80', 'Aromatic extra long grain premium Basmati Rice directly sourced from cooperative mill.', 1);
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (102, 'Sona Masoori Rice (Boiled)', 'Grains & Staples', '890100100102', 'KG', 62.0, 52.0, 210.0, 50.0, 'B-SONA-26B', '2027-08-15', 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=500&q=80', 'Lightweight, healthy daily boiled rice favorite across Bengal households.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description, featured) VALUES (103, 'Sharbati Wheat Flour (Atta)', 'Grains & Staples', '890100200201', 'KG', 45.0, 38.0, 75.0, 25.0, 'B-ATTA-26C', '2027-03-31', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=500&q=80', '100% stone-ground Sharbati whole wheat chakki fresh atta for soft rotis.', 1);
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (104, 'Refined Sugar (S-30 Grade)', 'Grocery & Essentials', '890100300301', 'KG', 44.0, 39.5, 94.0, 20.0, 'B-SUG-26D', '2027-12-31', 'https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&w=500&q=80', 'Sparkling white sulfurless refined sugar crystals from cooperative sugar federation.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description, featured) VALUES (105, 'Sunflower Oil 1L Pouch', 'Edible Oils', '890100400401', 'PKT', 130.0, 114.0, 32.0, 15.0, 'B-OIL-SUN26', '2027-05-20', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80', 'Refined light sunflower cooking oil fortified with Vitamin A & D.', 1);
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description, featured) VALUES (106, 'Mustard Oil 1L Bottle (Kachi Ghani)', 'Edible Oils', '890100400402', 'LTR', 160.0, 138.0, 47.0, 15.0, 'B-OIL-MUST26', '2027-07-10', 'https://images.unsplash.com/photo-1620706857370-e1b9770e8bb1?auto=format&fit=crop&w=500&q=80', 'Cold pressed pungent pure Mustard oil ideal for traditional Kolkata fish and curries.', 1);
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (107, 'Parle-G Biscuit 100g', 'Snacks & Biscuits', '890100500501', 'PCS', 10.0, 8.5, 145.0, 40.0, 'B-SNK-PARLE', '2027-04-18', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80', 'India’s favorite glucose biscuit for morning chai.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (108, 'Chana Dal (Desi Polished)', 'Pulses & Dal', '890100600601', 'KG', 88.0, 74.0, 65.0, 20.0, 'B-DAL-CHANA26', '2027-09-30', 'https://images.unsplash.com/photo-1585994192700-4e16104b28ba?auto=format&fit=crop&w=500&q=80', 'High protein unpolished Bengal gram dal for luchi and cholar dal recipes.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (109, 'Tata Iodised Salt 1kg', 'Grocery & Essentials', '890100700701', 'PKT', 28.0, 24.0, 110.0, 30.0, 'B-SALT-TATA', '2028-01-01', 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?auto=format&fit=crop&w=500&q=80', 'Desh Ka Namak vacuum evaporated iodised salt.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description, featured) VALUES (110, 'Darjeeling Tea (Leaf Blend) 250g', 'Tea & Beverages', '890100800801', 'PKT', 145.0, 118.0, 42.0, 12.0, 'B-TEA-DARJ26', '2027-11-20', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80', 'Selected fragrant high-grown Darjeeling orthodox leaf blend.', 1);
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (111, 'Pure Cow Ghee 500ml', 'Dairy & Ghee', '890100900901', 'JAR', 320.0, 275.0, 24.0, 8.0, 'B-GHEE-COW26', '2027-08-30', 'https://images.unsplash.com/photo-1631451095765-2c91616fc9e6?auto=format&fit=crop&w=500&q=80', 'Traditional granular aromatic pure cow clarified butter.');
INSERT INTO products (id, name, category, barcode, unit, sellingPrice, costPrice, stock, minStockLevel, batchNo, expiryDate, image, description) VALUES (112, 'Turmeric Powder (Haldi) 200g', 'Spices & Masala', '890101001001', 'PKT', 52.0, 42.0, 60.0, 15.0, 'B-SPICE-HLD26', '2027-10-15', 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=500&q=80', 'High-curcumin golden yellow pure turmeric ground hygienically.');

-- Sales Ledger Table
CREATE TABLE IF NOT EXISTS sale_transactions (
    saleItemId INT PRIMARY KEY,
    saleId INT NOT NULL,
    invoiceNo VARCHAR(50),
    saleDate DATETIME,
    customerName VARCHAR(255),
    paymentMode ENUM('UPI', 'CASH'),
    productId INT,
    productName VARCHAR(255),
    barcode VARCHAR(100),
    quantity DECIMAL(10, 3),
    unitType VARCHAR(10),
    sellingPrice DECIMAL(10, 2),
    lineTotal DECIMAL(10, 2),
    cashierName VARCHAR(255)
);

INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9001, 8001, 'POS-2026-0001', '2026-10-28 09:15', 'Ramesh Sharma', 'CASH', 101, 'Basmati Rice (Premium)', '890100100101', 5.5, 'KG', 100.0, 550.0, 'Subrata Roy');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9002, 8001, 'POS-2026-0001', '2026-10-28 09:15', 'Ramesh Sharma', 'CASH', 104, 'Refined Sugar', '890100300301', 2.0, 'KG', 44.0, 88.0, 'Subrata Roy');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9004, 8002, 'POS-2026-0002', '2026-10-28 10:45', 'Walk-in Customer', 'UPI', 105, 'Sunflower Oil 1L Pouch', '890100400401', 2.0, 'PKT', 130.0, 260.0, 'Priya Ghosh');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9006, 8003, 'POS-2026-0003', '2026-10-29 16:30', 'Amitabh Joshi', 'CASH', 106, 'Mustard Oil 1L Bottle', '890100400402', 1.0, 'LTR', 160.0, 160.0, 'Subrata Roy');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9007, 8004, 'POS-2026-0004', '2026-10-30 11:20', 'Sujata Sen', 'UPI', 110, 'Darjeeling Tea 250g', '890100800801', 1.0, 'PKT', 145.0, 145.0, 'Subrata Roy');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9008, 8005, 'POS-2026-0005', '2026-10-31 14:15', 'Pradip Das', 'CASH', 111, 'Pure Cow Ghee 500ml', '890100900901', 1.0, 'JAR', 320.0, 320.0, 'Priya Ghosh');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9009, 8006, 'POS-2026-0006', '2026-11-01 10:05', 'Tapan Kumar', 'CASH', 102, 'Sona Masoori Rice (Boiled)', '890100100102', 10.0, 'KG', 62.0, 620.0, 'Subrata Roy');
INSERT INTO sale_transactions (saleItemId, saleId, invoiceNo, saleDate, customerName, paymentMode, productId, productName, barcode, quantity, unitType, sellingPrice, lineTotal, cashierName) VALUES (9010, 8006, 'POS-2026-0006', '2026-11-01 10:05', 'Tapan Kumar', 'CASH', 112, 'Turmeric Powder 200g', '890101001001', 2.0, 'PKT', 52.0, 104.0, 'Subrata Roy');

-- Cashiers Table
CREATE TABLE IF NOT EXISTS cashiers (
    id VARCHAR(50) PRIMARY KEY,
    loginId VARCHAR(50) UNIQUE NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    staffCode VARCHAR(50),
    role VARCHAR(50),
    assignedCounter VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE,
    createdAt DATE
);

INSERT INTO cashiers (id, loginId, passwordHash, name, staffCode, role, assignedCounter, isActive, createdAt) VALUES ('admin-001', 'admin', 'admin@nabkul', 'Society Administrator', 'ADMIN #01', 'System Admin', 'ADMIN DESK (CENTRAL)', 1, '2026-10-25');
INSERT INTO cashiers (id, loginId, passwordHash, name, staffCode, role, assignedCounter, isActive, createdAt) VALUES ('cashier-402', 'subrata', 'nabkul@123', 'Subrata Roy', 'Staff #402', 'Senior Cashier', 'COUNTER-01 (KOL-NORTH)', 1, '2026-10-26');
INSERT INTO cashiers (id, loginId, passwordHash, name, staffCode, role, assignedCounter, isActive, createdAt) VALUES ('cashier-405', 'priya', 'nabkul@123', 'Priya Ghosh', 'Staff #405', 'POS Cashier', 'COUNTER-02 (KOL-NORTH)', 1, '2026-10-27');
INSERT INTO cashiers (id, loginId, passwordHash, name, staffCode, role, assignedCounter, isActive, createdAt) VALUES ('cashier-101', 'manager', 'admin@nabkul', 'Bimalendu Sarkar', 'Staff #101', 'Society Manager', 'CENTRAL DESK', 1, '2026-10-25');
