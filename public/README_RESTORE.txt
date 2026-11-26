=====================================================
NABKUL COOPERATIVE SOCIETY POS - RESTORATION GUIDE
=====================================================

Thank you for downloading the complete system backup of Nabkul Cooperative Society POS.

CONTENTS OF THIS BACKUP:
-----------------------------------------------------
1. database_backup.sql
   - Complete MySQL database dump (Database: nabkul_pos)
   - Tables: products, sale_transactions, cashiers with initial records

2. public/Piem Img/
   - All offline product images and assets ready for offline local hosting without internet

3. src/ & index.html & server.ts
   - Complete application source code (React + TypeScript + Vite + Express)

HOW TO RUN LOCALLY ON YOUR COMPUTER:
-----------------------------------------------------
Prerequisites:
- Node.js (version 18 or newer): https://nodejs.org
- MySQL (XAMPP, WAMP, MySQL Workbench, or MariaDB): Optional if you want to import the .sql database

Step 1: Extract this .zip folder to your preferred folder (e.g., C:\nabkul_pos).
Step 2: Open terminal / command prompt inside the extracted folder.
Step 3: Run:
    npm install
Step 4: Start the application:
    npm run dev
Step 5: Open your web browser at:
    http://localhost:3000

HOW TO IMPORT MYSQL DATABASE (database_backup.sql):
-----------------------------------------------------
Using MySQL Command Line:
    mysql -u root -p < database_backup.sql

Using phpMyAdmin (XAMPP / WAMP):
1. Open phpMyAdmin at http://localhost/phpmyadmin
2. Click on "Import" in the top navigation bar.
3. Choose "database_backup.sql" from this folder.
4. Click "Import" at the bottom.
=====================================================
