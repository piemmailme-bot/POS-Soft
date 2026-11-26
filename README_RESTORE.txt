================================================================================
NABKUL COOPERATIVE SOCIETY - SMART POS & QR STORE
SUPABASE CLOUD DATABASE SETUP & RESTORATION GUIDE
================================================================================

This project uses Supabase as its primary cloud database backend.
No MySQL or local SQL servers are required!

--------------------------------------------------------------------------------
HOW TO CONNECT SUPABASE (STEP-BY-STEP):
--------------------------------------------------------------------------------

STEP 1: Create a Project in Supabase
- Go to https://supabase.com and create a free project.

STEP 2: Run the Database Table Setup Script
- In your Supabase dashboard, click "SQL Editor" on the left menu.
- Click "New query".
- Open the included file "supabase_schema.sql" from this project folder.
- Copy all the SQL code from "supabase_schema.sql" and paste it into the query box.
- Click "Run".
- This creates all 7 tables with Row Level Security (RLS) policies and seed items:
  1. products (Store inventory, prices, barcodes)
  2. sale_transactions (Completed sales and invoices)
  3. cashiers (Authorized cashier staff and PINs)
  4. admin_settings (Emergency halt switch & discount configs)
  5. categories (Product categories)
  6. audit_logs (Security and admin actions)
  7. loose_packets (Weighed packet barcodes and statuses)

STEP 3: Add Your Environment Variables
- In Supabase Dashboard, click on "Project Settings" (the gear icon) -> "API".
- Copy your "Project URL" and your "anon public" API key.
- Open the ".env" file in this project folder and enter:
    SUPABASE_URL=https://your-project-id.supabase.co
    SUPABASE_ANON_KEY=your-anon-key-here

STEP 4: Run the Application
- Open terminal / command prompt in this folder:
    npm install
    npm run dev
- Open your browser:
    http://localhost:3000

All POS transactions, cashier roster updates, inventory items, and label barcodes
will now save directly and in real-time to your Supabase cloud database!
================================================================================
