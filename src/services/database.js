// src/services/database.js - COMPLETE FIXED VERSION
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'taskprime_v2.db';
const DB_VERSION = 15; // Bumped to 15 for client_id field
const CURRENT_VERSION = DB_VERSION;
class DatabaseService {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized && this.db) {
            console.log('[DB] Database already initialized');
            return true;
        }

        try {
            console.log('[DB] Initializing database:', DB_NAME);
            // Use useNewConnection option to prevent NullPointerException on Android
            // This is a known issue with expo-sqlite v16 on Android devices
            this.db = await SQLite.openDatabaseAsync(DB_NAME, { useNewConnection: true });

            // Simple connection test
            await this.db.getFirstAsync('SELECT 1');

            await this.checkAndMigrate();
            await this.createTables();
            await this.cleanupCollections();

            this.isInitialized = true;
            console.log('[DB] ✅ Database initialized successfully');
            return true;
        } catch (error) {
            console.error('[DB] ❌ Database initialization error:', error);
            this.isInitialized = false;
            this.db = null;
            // No more complex delete logic - if v2 fails, we need manual intervention or next version bump
            throw error;
        }
    }

    async checkAndMigrate() {
        try {
            if (!this.db) {
                throw new Error('Database not initialized in checkAndMigrate');
            }

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS db_version (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL);'
            );

            const result = await this.db.getFirstAsync('SELECT version FROM db_version WHERE id = 1');
            const currentVersion = result?.version || 0;

            console.log('[DB] Current version: ' + currentVersion + ', Required: ' + DB_VERSION);

            if (currentVersion < DB_VERSION) {
                console.log('[DB] Schema update needed - migrating...');

                // Migration for v5 (Ensure mrp/taxcode exist)
                if (currentVersion < 5) {
                    try {
                        console.log('[DB] Migrating to v5 - Ensuring mrp and taxcode exist...');
                        try {
                            await this.db.runAsync('ALTER TABLE products ADD COLUMN mrp REAL DEFAULT 0');
                        } catch (e) { /* ignore */ }

                        try {
                            await this.db.runAsync("ALTER TABLE products ADD COLUMN taxcode TEXT DEFAULT ''");
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.log('[DB] Migration minor error (ignored):', e);
                    }
                }

                // Migration for v6 (Ensure text6 exists)
                if (currentVersion < 6) {
                    try {
                        console.log('[DB] Migrating to v6 - Ensuring text6 (HSN) exists...');
                        try {
                            await this.db.runAsync("ALTER TABLE products ADD COLUMN text6 TEXT DEFAULT ''");
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.log('[DB] Migration minor error (ignored):', e);
                    }
                }


                // Migration for v7 (Ensure sales, fourth_price, nlc1, bmrp exist)
                if (currentVersion < 7) {
                    try {
                        console.log('[DB] Migrating to v7 - Ensuring extended price fields exist...');
                        const columns = ['sales', 'fourth_price', 'nlc1', 'bmrp'];
                        for (const col of columns) {
                            try {
                                await this.db.runAsync(`ALTER TABLE batches ADD COLUMN ${col} REAL DEFAULT 0`);
                            } catch (e) { /* ignore */ }
                        }
                    } catch (e) {
                        console.log('[DB] Migration minor error (ignored):', e);
                    }
                }

                // Migration for v8 (Add prices JSON column)
                // We check specifically if the column exists to be safe, or just run ADD COLUMN and ignore specific error
                if (currentVersion < 8) {
                    try {
                        console.log('[DB] Migrating to v8 - Adding prices JSON column...');
                        try {
                            // Check if column exists first logic is hard in sqlite/expo without pragma
                            // simpler is to try add and catch error
                            await this.db.runAsync('ALTER TABLE batches ADD COLUMN prices TEXT');
                        } catch (e) {
                            // If error contains "duplicate column name", it's fine
                            if (e.message && e.message.includes("duplicate column")) {
                                console.log('[DB] prices column already exists');
                            } else {
                                // log but don't crash, maybe it was created by clean install
                                console.log('[DB] Note: ' + e.message);
                            }
                        }
                    } catch (e) {
                        console.log('[DB] Migration minor error (ignored):', e);
                    }
                }

                // Migration for v9 (Duplicate check for prices column for safety)
                if (currentVersion < 9) {
                    try {
                        console.log('[DB] Migrating to v9 - Verifying prices column...');
                        try {
                            await this.db.runAsync('ALTER TABLE batches ADD COLUMN prices TEXT');
                            console.log('[DB] Added prices column in v9 migration');
                        } catch (e) {
                            if (e.message && e.message.includes("duplicate column")) {
                                console.log('[DB] prices column already exists (v9 check)');
                            }
                        }
                    } catch (e) {

                        console.log('[DB] Migration v9 minor error:', e);
                    }
                }

                // Migration for v10 (Add remarkcolumntitle to customers)
                if (currentVersion < 10) {
                    try {
                        console.log('[DB] Migrating to v10 - Adding remarkcolumntitle to customers...');
                        try {
                            await this.db.runAsync(`ALTER TABLE customers ADD COLUMN remarkcolumntitle TEXT DEFAULT ''`);
                            console.log('[DB] Added remarkcolumntitle to customers table');
                        } catch (e) {
                            if (e.message && e.message.includes("duplicate column")) {
                                console.log('[DB] remarkcolumntitle column already exists');
                            } else {
                                console.log('[DB] Note: ' + e.message);
                            }
                        }
                    } catch (e) {
                        console.log('[DB] Migration v10 minor error:', e);
                    }
                }

                // Migration for v11 (Add department_name to products)
                if (currentVersion < 11) {
                    try {
                        console.log('[DB] Migrating to v11 - Adding department_name to products...');
                        try {
                            await this.db.runAsync(`ALTER TABLE products ADD COLUMN department_name TEXT DEFAULT ''`);
                            console.log('[DB] Added department_name to products table');
                        } catch (e) {
                            if (e.message && e.message.includes("duplicate column")) {
                                console.log('[DB] department_name column already exists');
                            } else {
                                console.log('[DB] Note: ' + e.message);
                            }
                        }
                    } catch (e) {
                        console.log('[DB] Migration v11 minor error:', e);
                    }
                }

                // Migration for v13 (Add username to offline tables)
                if (currentVersion < 13) {
                    try {
                        console.log('[DB] Migrating to v13 - Adding username to offline tables...');
                        try {
                            await this.db.runAsync('ALTER TABLE offline_collections ADD COLUMN username TEXT');
                            console.log('[DB] Added username to offline_collections');
                        } catch (e) { /* ignore */ }

                        try {
                            await this.db.runAsync('ALTER TABLE offline_orders ADD COLUMN username TEXT');
                            console.log('[DB] Added username to offline_orders');
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.log('[DB] Migration v13 minor error:', e);
                    }
                }

                // Migration for v14 (Add client_id to customers for shop isolation)
                if (currentVersion < 14) {
                    try {
                        console.log('[DB] Migrating to v14 - Adding client_id to customers...');
                        try {
                            await this.db.runAsync('ALTER TABLE customers ADD COLUMN client_id TEXT');
                            console.log('[DB] Added client_id to customers');
                        } catch (e) { /* ignore */ }
                    } catch (e) {
                        console.log('[DB] Migration v14 minor error:', e);
                    }
                }

                // Migration for v15 (Ensure client_id exists)
                if (currentVersion < 15) {
                    try {
                        console.log('[DB] Migrating to v15 - Ensuring client_id exists...');
                        try {
                            await this.db.runAsync('ALTER TABLE customers ADD COLUMN client_id TEXT');
                            console.log('[DB] Added client_id to customers in v15');
                        } catch (e) {
                            if (e.message && e.message.includes('duplicate column')) {
                                console.log('[DB] client_id column already exists');
                            }
                        }
                    } catch (e) {
                        console.log('[DB] Migration v15 minor error:', e);
                    }
                }

                // Update version after ALL migrations
                await this.db.runAsync('INSERT OR REPLACE INTO db_version (id, version) VALUES (1, ?)', [DB_VERSION]);
                console.log('[DB] ✅ Migration complete to version ' + DB_VERSION);
            }
        } catch (error) {
            console.error('[DB] Migration failed:', error);
            throw error;
        }
    }

    async createTables() {
        try {
            if (!this.db) {
                throw new Error('Database not initialized in createTables');
            }

            console.log('[DB] Creating/verifying tables...');

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS customers (code TEXT PRIMARY KEY, name TEXT NOT NULL, place TEXT, area TEXT, phone TEXT, phone2 TEXT, super_code TEXT, balance REAL DEFAULT 0, master_debit REAL DEFAULT 0, master_credit REAL DEFAULT 0, remarkcolumntitle TEXT, client_id TEXT, created_at TEXT, updated_at TEXT);'
            );

            await this.db.runAsync(
                "CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT NOT NULL, barcode TEXT, price REAL DEFAULT 0, stock REAL DEFAULT 0, unit TEXT, brand TEXT, category TEXT, description TEXT, mrp REAL DEFAULT 0, taxcode TEXT DEFAULT '', text6 TEXT DEFAULT '', department_name TEXT DEFAULT '', created_at TEXT, updated_at TEXT);"
            );

            // Migration: Add brand column if it doesn't exist (for existing databases)
            try {
                await this.db.runAsync('ALTER TABLE products ADD COLUMN brand TEXT');
                console.log('[DB] ✅ Added brand column to products table');
            } catch (error) {
                // Column already exists, ignore error
                if (error && error.message && !error.message.includes('duplicate column')) {
                    // ignore
                }
            }

            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_code ON products(code)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_products_dept ON products(department_name)');

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS company_info (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT UNIQUE, name TEXT, address TEXT, phone TEXT, email TEXT, data TEXT, created_at TEXT, updated_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS offline_collections (id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT UNIQUE, customer_code TEXT, customer_name TEXT, customer_place TEXT, customer_phone TEXT, amount REAL, payment_type TEXT, cheque_number TEXT, remarks TEXT, date TEXT, synced INTEGER DEFAULT 0, username TEXT, created_at TEXT, updated_at TEXT, synced_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS offline_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT UNIQUE, customer_code TEXT, customer_name TEXT, area TEXT, payment_type TEXT, items TEXT, total_amount REAL, date TEXT, synced INTEGER DEFAULT 0, username TEXT, created_at TEXT, updated_at TEXT, synced_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS customer_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_code TEXT, voucher_no TEXT, date TEXT, particulars TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, balance REAL DEFAULT 0, created_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS areas (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT, updated_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)'
            );

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY AUTOINCREMENT, product_code TEXT NOT NULL, batch_id INTEGER, barcode TEXT, mrp REAL DEFAULT 0, retail REAL DEFAULT 0, dp REAL DEFAULT 0, cb REAL DEFAULT 0, cost REAL DEFAULT 0, quantity REAL DEFAULT 0, expiry_date TEXT, second_price REAL DEFAULT 0, third_price REAL DEFAULT 0, net_rate REAL DEFAULT 0, pk_shop REAL DEFAULT 0, sales REAL DEFAULT 0, fourth_price REAL DEFAULT 0, nlc1 REAL DEFAULT 0, bmrp REAL DEFAULT 0, prices TEXT, created_at TEXT, updated_at TEXT, FOREIGN KEY(product_code) REFERENCES products(code))'
            );

            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_batches_product_code ON batches(product_code)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_batches_barcode ON batches(barcode)');

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS product_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, product_code TEXT NOT NULL, url TEXT NOT NULL, order_index INTEGER DEFAULT 0, created_at TEXT, FOREIGN KEY(product_code) REFERENCES products(code))'
            );

            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_product_photos_code ON product_photos(product_code)');

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS product_goddowns (id INTEGER PRIMARY KEY AUTOINCREMENT, product_code TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL, quantity REAL DEFAULT 0, created_at TEXT, FOREIGN KEY(product_code) REFERENCES products(code))'
            );

            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_goddowns_product_code ON product_goddowns(product_code)');
            await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_goddowns_barcode ON product_goddowns(barcode)');

            await this.db.runAsync(
                'CREATE TABLE IF NOT EXISTS godown_stock (id INTEGER PRIMARY KEY, goddownid TEXT, product TEXT, quantity REAL, barcode TEXT, product_name TEXT, goddown_name TEXT, updated_at TEXT);'
            );

            console.log('[DB] ✅ All tables created/verified');
        } catch (error) {
            console.error('[DB] ❌ Error creating tables:', error);
            throw error;
        }
    }

    // ==================== GEO LOCATION ====================
    async saveCustomerLocation(customerCode, latitude, longitude) {
        try {
            await this.db.runAsync(
                'INSERT OR REPLACE INTO customer_geo_data (customer_code, latitude, longitude, captured_at, is_synced) VALUES (?, ?, ?, ?, 0)',
                [customerCode, latitude, longitude, new Date().toISOString()]
            );
            return true;
        } catch (error) {
            console.error('[DB] Error saving customer location:', error);
            return false;
        }
    }

    async getCustomerLocations() {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM customer_geo_data');
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting customer locations:', error);
            return [];
        }
    }

    async getCustomerLocation(customerCode) {
        try {
            const result = await this.db.getFirstAsync('SELECT * FROM customer_geo_data WHERE customer_code = ?', [customerCode]);
            return result;
        } catch (error) {
            console.error('[DB] Error getting customer location:', error);
            return null;
        }
    }

    // ==================== CUSTOMERS ====================
    async saveCustomers(customers) {
        try {
            if (!customers || customers.length === 0) return true;
            console.log('[DB] Saving ' + customers.length + ' customers...');

            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                // Determine existing customer count for optimization decision if needed, 
                // but for now we just use REPLACE to handle updates/inserts efficiently

                // Reduced chunk size for iOS stability (30 * 13 = 390 params)
                const chunkSize = 30;
                let insertedCount = 0;

                for (let i = 0; i < customers.length; i += chunkSize) {
                    const chunk = customers.slice(i, i + chunkSize);

                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const customer of chunk) {
                        values.push(
                            customer.code,
                            customer.name,
                            customer.place || '',
                            customer.area || '',
                            customer.phone || '',
                            customer.phone2 || '',
                            customer.super_code || '',
                            customer.balance || 0,
                            customer.master_debit || 0,
                            customer.master_credit || 0,
                            customer.remarkcolumntitle || '',
                            customer.client_id || '',
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT OR REPLACE INTO customers (code, name, place, area, phone, phone2, super_code, balance, master_debit, master_credit, remarkcolumntitle, client_id, updated_at) VALUES ' + placeholders,
                        values
                    );

                    insertedCount += chunk.length;
                    if (insertedCount % 500 === 0) console.log(`[DB] Saved ${insertedCount}/${customers.length} customers`);
                }

                await this.db.runAsync('COMMIT');
                console.log('[DB] ✅ Bulk saved ' + customers.length + ' customers');
                return true;
            } catch (error) {
                console.error('[DB] Error executing customer batch:', error);
                await this.db.runAsync('ROLLBACK');
                
                // Self-healing: Check for missing client_id column
                if (error && error.message && error.message.includes('no column named client_id')) {
                    console.log('[DB] Detected missing client_id column - attempting to fix...');
                    try {
                        await this.db.runAsync('ALTER TABLE customers ADD COLUMN client_id TEXT');
                        console.log('[DB] ✅ Successfully added missing client_id column. Retrying save...');
                        // Retry the save
                        return await this.saveCustomers(customers);
                    } catch (alterError) {
                        console.error('[DB] Failed to auto-fix missing column:', alterError);
                        throw error;
                    }
                }
                
                throw error;
            }
        } catch (error) {
            console.error('[DB] Error saving customers:', error);
            throw error;
        }
    }

    async getCustomers(superCode = null) {
        try {
            if (!this.db) {
                console.warn('[DB] Database not initialized in getCustomers, initializing...');
                await this.init();
            }

            let query = 'SELECT * FROM customers';
            let params = [];
            if (superCode) {
                query += ' WHERE super_code = ?';
                params.push(superCode);
            }
            query += ' ORDER BY name ASC';

            // Safe execution: handle empty params case explicitly for some native versions
            const result = (params.length > 0)
                ? await this.db.getAllAsync(query, params)
                : await this.db.getAllAsync(query, []);

            return result || [];
        } catch (error) {
            console.error('[DB] Error getting customers:', error);
            return [];
        }
    }

    async getCustomerByCode(code) {
        try {
            const result = await this.db.getFirstAsync('SELECT * FROM customers WHERE code = ?', [code]);
            return result;
        } catch (error) {
            console.error('[DB] Error getting customer:', error);
            return null;
        }
    }

    async searchCustomers(query, superCode = null) {
        try {
            if (!this.db) await this.init();

            let sql = 'SELECT * FROM customers WHERE(name LIKE ? OR code LIKE ? OR phone LIKE ? OR area LIKE ?)';
            const searchTerm = '% ' + query + '% ';
            let params = [searchTerm, searchTerm, searchTerm, searchTerm];
            if (superCode) {
                sql += ' AND super_code = ?';
                params.push(superCode);
            }
            sql += ' ORDER BY name ASC LIMIT 50';
            const result = await this.db.getAllAsync(sql, params);
            return result || [];
        } catch (error) {
            console.error('[DB] Error searching customers:', error);
            return [];
        }
    }

    // ==================== PRODUCTS ====================
    async getDistinctBrands() {
        try {
            const result = await this.db.getAllAsync('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != "" ORDER BY brand ASC');
            return (result || []).map(row => row.brand);
        } catch (error) {
            console.error('[DB] Error getting distinct brands:', error);
            return [];
        }
    }

    async getDistinctCategories() {
        try {
            const result = await this.db.getAllAsync('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != "" ORDER BY category ASC');
            return (result || []).map(row => row.category);
        } catch (error) {
            console.error('[DB] Error getting distinct categories:', error);
            return [];
        }
    }

    async getDistinctDepartments() {
        try {
            const result = await this.db.getAllAsync('SELECT DISTINCT department_name FROM products WHERE department_name IS NOT NULL AND department_name != "" ORDER BY department_name ASC');
            return (result || []).map(row => row.department_name);
        } catch (error) {
            console.error('[DB] Error getting distinct departments:', error);
            return [];
        }
    }

    async saveProducts(products) {
        try {
            if (!products || products.length === 0) return true;
            console.log('[DB] Saving ' + products.length + ' products...');

            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                // Reduced chunk size for iOS stability (25 * 14 = 350 params)
                const chunkSize = 25;
                let insertedCount = 0;

                for (let i = 0; i < products.length; i += chunkSize) {
                    const chunk = products.slice(i, i + chunkSize);

                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const product of chunk) {
                        values.push(
                            product.code || product.id,
                            product.name,
                            product.barcode || '',
                            product.price || 0,
                            product.stock || 0,
                            product.unit || '',
                            product.brand || '',
                            product.category || product.catagory || '', // Handle API typo
                            product.description || '',
                            product.mrp || 0,
                            product.taxcode || '',
                            product.text6 || '',
                            product.department_name || product.DEPARTMENT || product.department || product.DEPT || product.dept || '',
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT OR REPLACE INTO products (code, name, barcode, price, stock, unit, brand, category, description, mrp, taxcode, text6, department_name, updated_at) VALUES ' + placeholders,
                        values
                    );

                    insertedCount += chunk.length;
                    if (insertedCount % 500 === 0) console.log(`[DB] Saved ${insertedCount}/${products.length} products`);
                }

                await this.db.runAsync('COMMIT');
                console.log('[DB] ✅ Bulk saved ' + products.length + ' products');
                return true;
            } catch (error) {
                console.error('[DB] Error executing product batch:', error);
                await this.db.runAsync('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('[DB] Error saving products:', error);
            throw error;
        }
    }

    async getProducts() {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM products ORDER BY name ASC');
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting products:', error);
            return [];
        }
    }

    async getProductByCode(code) {
        try {
            const result = await this.db.getFirstAsync('SELECT * FROM products WHERE code = ?', [code]);
            return result;
        } catch (error) {
            console.error('[DB] Error getting product by code:', error);
            return null;
        }
    }

    async getProductByBarcode(barcode) {
        try {
            console.log('[DB] Searching for barcode:', barcode);

            // 1. First, try searching in batches table (more detailed info)
            let batchResult = await this.db.getFirstAsync(
                'SELECT p.*, b.*, b.barcode as batch_barcode, b.mrp as batch_mrp, b.quantity as batch_quantity ' +
                'FROM batches b ' +
                'JOIN products p ON b.product_code = p.code ' +
                'WHERE b.barcode = ? LIMIT 1',
                [barcode]
            );

            if (batchResult) {
                console.log('[DB] Found via batch barcode:', batchResult.name);
                return {
                    ...batchResult,
                    barcode: batchResult.batch_barcode || batchResult.barcode,
                    mrp: batchResult.batch_mrp || batchResult.mrp || 0,
                    stock: batchResult.batch_quantity || batchResult.stock || 0,
                    price: batchResult.retail || batchResult.price || 0,
                    batchId: batchResult.batch_id,
                    expiryDate: batchResult.expiry_date,
                    // Map common prices to camelCase for UI consistency with batchService
                    netRate: batchResult.net_rate || 0,
                    pkShop: batchResult.pk_shop || 0,
                    secondPrice: batchResult.second_price || 0,
                    thirdPrice: batchResult.third_price || 0,
                    fourthPrice: batchResult.fourth_price || 0,
                };
            }

            // 2. If not found in batches, check products table
            let productResult = await this.db.getFirstAsync('SELECT * FROM products WHERE barcode = ? OR code = ?', [barcode, barcode]);
            if (productResult) {
                console.log('[DB] Found via product barcode/code:', productResult.name);

                // Try to get ANY batch for this product to get pricing levels
                const firstBatch = await this.db.getFirstAsync(
                    'SELECT * FROM batches WHERE product_code = ? LIMIT 1',
                    [productResult.code]
                );

                if (firstBatch) {
                    return {
                        ...productResult,
                        ...firstBatch,
                        barcode: firstBatch.barcode || productResult.barcode,
                        price: firstBatch.retail || productResult.price || 0,
                        stock: firstBatch.quantity || productResult.stock || 0,
                        mrp: firstBatch.mrp || productResult.mrp || 0,
                        batchId: firstBatch.batch_id,
                        // Map common prices to camelCase for UI consistency
                        netRate: firstBatch.net_rate || 0,
                        pkShop: firstBatch.pk_shop || 0,
                        secondPrice: firstBatch.second_price || 0,
                        thirdPrice: firstBatch.third_price || 0,
                        fourthPrice: firstBatch.fourth_price || 0,
                    };
                }
                return productResult;
            }

            return null;
        } catch (error) {
            console.error('[DB] Error getting product by barcode:', error);
            return null;
        }
    }

    async searchProducts(query) {
        try {
            const searchTerm = '% ' + query + '% ';

            // Search both products table and batches table
            const result = await this.db.getAllAsync(
                'SELECT DISTINCT p.* FROM products p WHERE p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? UNION SELECT DISTINCT p.* FROM products p JOIN batches b ON b.product_code = p.code WHERE b.barcode LIKE ? ORDER BY name ASC LIMIT 50',
                [searchTerm, searchTerm, searchTerm, searchTerm]
            );
            return result || [];
        } catch (error) {
            console.error('[DB] Error searching products:', error);
            return [];
        }
    }

    // ==================== AREAS ====================
    async saveAreas(areas) {
        try {
            console.log('[DB] Saving ' + areas.length + ' areas...');
            for (const area of areas) {
                await this.db.runAsync('INSERT OR REPLACE INTO areas(name, updated_at) VALUES(?, ?)',
                    [area, new Date().toISOString()]);
            }
            console.log('[DB] ✅ Saved ' + areas.length + ' areas');
            return true;
        } catch (error) {
            console.error('[DB] Error saving areas:', error);
            throw error;
        }
    }

    async getAreas() {
        try {
            const result = await this.db.getAllAsync('SELECT name FROM areas ORDER BY name ASC');
            const areas = (result || []).map(row => row.name);
            return areas;
        } catch (error) {
            console.error('[DB] Error getting areas:', error);
            return [];
        }
    }

    // ==================== BATCHES ====================
    async saveBatches(productCode, batches) {
        try {
            await this.db.runAsync('DELETE FROM batches WHERE product_code = ?', [productCode]);

            for (const batch of batches) {
                // Extract prices from prices array if available
                let mrp = 0, sales = 0, cost = 0, retail = 0, dp = 0, cb = 0, netRate = 0, pkShop = 0;
                let pricesJson = null;

                if (batch.prices && Array.isArray(batch.prices)) {
                    // Store prices as JSON
                    pricesJson = JSON.stringify(batch.prices);

                    // Extract common prices for backward compatibility
                    batch.prices.forEach(priceObj => {
                        const code = priceObj.price_code;
                        const value = parseFloat(priceObj.value || 0);

                        if (code === 'MR') mrp = value;
                        else if (code === 'S1') sales = value;
                        else if (code === 'CO') cost = value;
                        else if (code === 'S2') retail = value;
                        else if (code === 'S3') dp = value;
                        else if (code === 'S4') cb = value;
                        else if (code === 'S5') netRate = value;
                    });
                } else {
                    // Fallback to old format
                    mrp = parseFloat(batch.MRP || batch.mrp || 0);
                    retail = parseFloat(batch.RETAIL || batch.retail || 0);
                    dp = parseFloat(batch['D.P'] || batch.dp || 0);
                    cb = parseFloat(batch.CB || batch.cb || 0);
                    cost = parseFloat(batch.COST || batch.cost || 0);
                    sales = parseFloat(batch.sales || batch.Sales || 0);
                    netRate = parseFloat(batch['NET RATE'] || batch.net_rate || batch.netrate || 0);
                    pkShop = parseFloat(batch['PK SHOP'] || batch.pk_shop || batch.pkshop || 0);
                }

                // Explicit field values override array extraction if present
                if (batch.MRP || batch.mrp) mrp = parseFloat(batch.MRP || batch.mrp || 0);
                if (batch.RETAIL || batch.retail) retail = parseFloat(batch.RETAIL || batch.retail || 0);
                if (batch['D.P'] || batch.dp) dp = parseFloat(batch['D.P'] || batch.dp || 0);
                if (batch.CB || batch.cb) cb = parseFloat(batch.CB || batch.cb || 0);
                if (batch.COST || batch.cost) cost = parseFloat(batch.COST || batch.cost || 0);
                if (batch.sales || batch.Sales) sales = parseFloat(batch.sales || batch.Sales || 0);

                const quantity = parseFloat(batch.quantity || 0);
                const secondPrice = parseFloat(batch.second_price || 0);
                const thirdPrice = parseFloat(batch.third_price || 0);
                const fourthPrice = parseFloat(batch.fourth_price || batch.fourthprice || 0);
                const nlc1 = parseFloat(batch.nlc1 || 0);
                const bmrp = parseFloat(batch.bmrp || 0);

                await this.db.runAsync(
                    'INSERT INTO batches (product_code, batch_id, barcode, mrp, retail, dp, cb, cost, quantity, expiry_date, second_price, third_price, net_rate, pk_shop, sales, fourth_price, nlc1, bmrp, prices, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [productCode, batch.id || batch.batch_id || null, batch.barcode || '', mrp, retail,
                        dp, cb, cost, quantity, batch.expirydate || batch.expiry_date || null,
                        secondPrice, thirdPrice, netRate, pkShop, sales, fourthPrice, nlc1, bmrp,
                        pricesJson,
                        new Date().toISOString(), new Date().toISOString()]
                );
            }

            return true;
        } catch (error) {
            console.error('[DB] Error saving batches for ' + productCode + ': ', error);
            // Auto-fix column if missing
            if (error && error.message && error.message.includes('no column named prices')) {
                try {
                    console.log('[DB] Auto-adding prices column to batches...');
                    await this.db.runAsync('ALTER TABLE batches ADD COLUMN prices TEXT');
                    return await this.saveBatches(productCode, batches);
                } catch (e) { console.error('Failed to autofix', e); }
            }
            return false;
        }
    }

    async getBatchesByProductCode(productCode) {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM batches WHERE product_code = ? ORDER BY barcode ASC', [productCode]);

            // Parse prices JSON for each batch
            return (result || []).map(batch => {
                if (batch.prices) {
                    try {
                        batch.prices = JSON.parse(batch.prices);
                    } catch (e) {
                        console.error('[DB] Error parsing prices JSON:', e);
                        batch.prices = [];
                    }
                } else {
                    batch.prices = [];
                }
                return batch;
            });
        } catch (error) {
            console.error('[DB] Error getting batches:', error);
            return [];
        }
    }

    async getBatchByBarcode(barcode) {
        try {
            const result = await this.db.getFirstAsync('SELECT * FROM batches WHERE barcode = ?', [barcode]);
            return result;
        } catch (error) {
            console.error('[DB] Error getting batch:', error);
            return null;
        }
    }

    async getAllBatches() {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM batches ORDER BY product_code, barcode ASC');

            // Parse prices JSON for each batch
            return (result || []).map(batch => {
                if (batch.prices) {
                    try {
                        batch.prices = JSON.parse(batch.prices);
                    } catch (e) {
                        console.error('[DB] Error parsing prices JSON:', e);
                        batch.prices = [];
                    }
                } else {
                    batch.prices = [];
                }
                return batch;
            });
        } catch (error) {
            console.error('[DB] Error getting all batches:', error);
            return [];
        }
    }

    /**
     * Get batches for a specific list of product codes
     */
    async getBatchesByProductCodes(productCodes) {
        try {
            if (!productCodes || productCodes.length === 0) return [];
            const placeholders = productCodes.map(() => '?').join(',');
            const result = await this.db.getAllAsync(
                `SELECT * FROM batches WHERE product_code IN (${placeholders}) ORDER BY product_code, barcode ASC`,
                productCodes
            );

            return (result || []).map(batch => {
                if (batch.prices) {
                    try {
                        batch.prices = JSON.parse(batch.prices);
                    } catch (e) {
                        batch.prices = [];
                    }
                } else {
                    batch.prices = [];
                }
                return batch;
            });
        } catch (error) {
            console.error('[DB] Error getting batches by codes:', error);
            return [];
        }
    }

    // ==================== BULK INSERT FOR BATCHES (OPTIMIZED WITH TRANSACTION) ====================
    async saveBatchesBulk(batchesWithProductCode) {
        try {
            if (!batchesWithProductCode || batchesWithProductCode.length === 0) {
                console.log('[DB] No batches to save');
                return true;
            }

            console.log('[DB] Bulk inserting ' + batchesWithProductCode.length + ' batches...');
            const startTime = Date.now();

            // Use a single transaction for ALL inserts - this is MUCH faster
            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                // Clear all existing batches first
                await this.db.runAsync('DELETE FROM batches');

                // Reduced chunk size for iOS stability (20 * 21 = 420 params)
                const chunkSize = 20;
                let insertedCount = 0;

                for (let i = 0; i < batchesWithProductCode.length; i += chunkSize) {
                    const chunk = batchesWithProductCode.slice(i, i + chunkSize);

                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const item of chunk) {
                        const batch = item.batch || item;
                        const productCode = item.product_code;

                        // Extract prices from prices array if available
                        let mrp = 0, sales = 0, cost = 0, retail = 0, dp = 0, cb = 0, netRate = 0, pkShop = 0;
                        let pricesJson = null;

                        if (batch.prices && Array.isArray(batch.prices)) {
                            // Store prices as JSON
                            pricesJson = JSON.stringify(batch.prices);

                            // Extract common prices for backward compatibility
                            batch.prices.forEach(priceObj => {
                                const code = priceObj.price_code;
                                const value = parseFloat(priceObj.value || 0);

                                if (code === 'MR') mrp = value;
                                else if (code === 'S1') sales = value;
                                else if (code === 'CO') cost = value;
                                else if (code === 'S2') retail = value;
                                else if (code === 'S3') dp = value;
                                else if (code === 'S4') cb = value;
                                else if (code === 'S5') netRate = value;
                            });
                        } else {
                            // Fallback to old format
                            mrp = parseFloat(batch.MRP || batch.mrp || 0);
                            retail = parseFloat(batch.RETAIL || batch.retail || 0);
                            dp = parseFloat(batch['D.P'] || batch.dp || 0);
                            cb = parseFloat(batch.CB || batch.cb || 0);
                            cost = parseFloat(batch.COST || batch.cost || 0);
                            sales = parseFloat(batch.sales || batch.Sales || 0);
                            netRate = parseFloat(batch['NET RATE'] || batch.net_rate || batch.netrate || 0);
                            pkShop = parseFloat(batch['PK SHOP'] || batch.pk_shop || batch.pkshop || 0);
                        }

                        values.push(
                            productCode,
                            batch.id || batch.batch_id || null,
                            batch.barcode || '',
                            mrp,
                            retail,
                            dp,
                            cb,
                            cost,
                            parseFloat(batch.quantity || 0),
                            batch.expirydate || batch.expiry_date || null,
                            parseFloat(batch.second_price || 0),
                            parseFloat(batch.third_price || 0),
                            netRate,
                            pkShop,
                            sales,
                            parseFloat(batch.fourth_price || batch.fourthprice || 0),
                            parseFloat(batch.nlc1 || 0),
                            parseFloat(batch.bmrp || 0),
                            pricesJson, // Store prices JSON
                            new Date().toISOString(),
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT OR REPLACE INTO batches (product_code, batch_id, barcode, mrp, retail, dp, cb, cost, quantity, expiry_date, second_price, third_price, net_rate, pk_shop, sales, fourth_price, nlc1, bmrp, prices, created_at, updated_at) VALUES ' + placeholders,
                        values
                    );

                    insertedCount += chunk.length;
                    if (insertedCount % 1000 === 0) {
                        console.log('[DB] Batch progress: ' + insertedCount + '/' + batchesWithProductCode.length);
                    }
                }

                await this.db.runAsync('COMMIT');

                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[DB] ✅ Bulk inserted ' + insertedCount + ' batches in ' + duration + 's');
                return true;

            } catch (error) {
                // Rollback on error
                await this.db.runAsync('ROLLBACK');

                // Self-healing: Check for missing 'prices' column
                if (error && error.message && error.message.includes('table batches has no column named prices')) {
                    console.log('[DB] Detected missing prices column in saveBatchesBulk - attempting to fix...');
                    try {
                        await this.db.runAsync('ALTER TABLE batches ADD COLUMN prices TEXT');
                        console.log('[DB] ✅ Successfully added missing prices column. Retrying bulk insert...');

                        // Retry the ENTIRE operation
                        // We must re-start transaction and loop since we rolled back
                        return await this.saveBatchesBulk(batchesWithProductCode);
                    } catch (alterError) {
                        console.error('[DB] Failed to auto-fix missing column:', alterError);
                        throw error; // Throw original error
                    }
                }

                throw error;
            }
        } catch (error) {
            console.error('[DB] Error bulk inserting batches:', error);
            throw error;
        }
    }

    // ==================== PRODUCT PHOTOS ====================
    async saveProductPhotos(productCode, photos) {
        try {
            if (!photos || photos.length === 0) return true;
            await this.db.runAsync('DELETE FROM product_photos WHERE product_code = ?', [productCode]);

            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                await this.db.runAsync(
                    'INSERT INTO product_photos (product_code, url, order_index, created_at) VALUES (?, ?, ?, ?)',
                    [productCode, photo.url || photo, i, new Date().toISOString()]
                );
            }
            return true;
        } catch (error) {
            console.error('[DB] Error saving photos:', error);
            throw error;
        }
    }

    async getProductPhotos(productCode) {
        try {
            const result = await this.db.getAllAsync(
                'SELECT url, order_index FROM product_photos WHERE product_code = ? ORDER BY order_index ASC', [productCode]
            );
            return (result || []).map(row => ({ url: row.url }));
        } catch (error) {
            console.error('[DB] Error getting photos:', error);
            return [];
        }
    }

    // ==================== BULK INSERT FOR PHOTOS (OPTIMIZED WITH TRANSACTION) ====================
    async savePhotosBulk(photosWithProductCode) {
        try {
            if (!photosWithProductCode || photosWithProductCode.length === 0) {
                console.log('[DB] No photos to save');
                return true;
            }

            console.log('[DB] Bulk inserting ' + photosWithProductCode.length + ' photos...');
            const startTime = Date.now();

            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                await this.db.runAsync('DELETE FROM product_photos');

                // Further reduced chunk size for iOS stability (25 * 21 = 525 params)
                const chunkSize = 25;
                let insertedCount = 0;

                for (let i = 0; i < photosWithProductCode.length; i += chunkSize) {
                    const chunk = photosWithProductCode.slice(i, i + chunkSize);

                    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const item of chunk) {
                        const photo = item.photo || item;
                        values.push(
                            item.product_code,
                            photo.url || photo,
                            item.order_index || 0,
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT OR REPLACE INTO product_photos (product_code, url, order_index, created_at) VALUES ' + placeholders,
                        values
                    );

                    insertedCount += chunk.length;
                }

                await this.db.runAsync('COMMIT');
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[DB] ✅ Bulk inserted ' + insertedCount + ' photos in ' + duration + 's');
                return true;

            } catch (error) {
                await this.db.runAsync('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('[DB] Error bulk inserting photos:', error);
            throw error;
        }
    }

    // ==================== OPTIMIZED BULK QUERIES (FIX N+1 PROBLEM) ====================
    /**
     * Get ALL product photos in a single query and return as Map grouped by product_code
     * This is MUCH faster than calling getProductPhotos() for each product
     */
    async getAllProductPhotos() {
        try {
            const result = await this.db.getAllAsync(
                'SELECT product_code, url, order_index FROM product_photos ORDER BY product_code, order_index ASC'
            );

            // Group photos by product_code for O(1) lookup
            const photosByProduct = new Map();
            for (const photo of result || []) {
                if (!photosByProduct.has(photo.product_code)) {
                    photosByProduct.set(photo.product_code, []);
                }
                photosByProduct.get(photo.product_code).push({ url: photo.url });
            }

            console.log('[DB] ✅ Loaded ' + (result?.length || 0) + ' photos for ' + photosByProduct.size + ' products in single query');
            return photosByProduct;
        } catch (error) {
            console.error('[DB] Error getting all photos:', error);
            return new Map();
        }
    }

    /**
     * Get photos for a specific list of product codes
     */
    async getPhotosByProductCodes(productCodes) {
        try {
            if (!productCodes || productCodes.length === 0) return new Map();
            const placeholders = productCodes.map(() => '?').join(',');
            const result = await this.db.getAllAsync(
                `SELECT product_code, url, order_index FROM product_photos WHERE product_code IN (${placeholders}) ORDER BY product_code, order_index ASC`,
                productCodes
            );

            const photosByProduct = new Map();
            for (const photo of result || []) {
                if (!photosByProduct.has(photo.product_code)) {
                    photosByProduct.set(photo.product_code, []);
                }
                photosByProduct.get(photo.product_code).push({ url: photo.url });
            }
            return photosByProduct;
        } catch (error) {
            console.error('[DB] Error getting photos by codes:', error);
            return new Map();
        }
    }

    /**
     * Get ALL product goddowns in a single query and return as Map grouped by product_code
     * This is MUCH faster than calling getProductGoddowns() for each product
     */
    async getAllProductGoddowns() {
        try {
            const result = await this.db.getAllAsync(
                'SELECT product_code, barcode, name, quantity FROM product_goddowns ORDER BY product_code, name ASC'
            );

            // Group goddowns by product_code for O(1) lookup
            const goddownsByProduct = new Map();
            for (const godown of result || []) {
                if (!goddownsByProduct.has(godown.product_code)) {
                    goddownsByProduct.set(godown.product_code, []);
                }
                goddownsByProduct.get(godown.product_code).push({
                    barcode: godown.barcode,
                    name: godown.name,
                    quantity: godown.quantity
                });
            }

            console.log('[DB] ✅ Loaded ' + (result?.length || 0) + ' goddowns for ' + goddownsByProduct.size + ' products in single query');
            return goddownsByProduct;
        } catch (error) {
            console.error('[DB] Error getting all goddowns:', error);
            return new Map();
        }
    }

    /**
     * Get goddowns for a specific list of product codes
     */
    async getGoddownsByProductCodes(productCodes) {
        try {
            if (!productCodes || productCodes.length === 0) return new Map();
            const placeholders = productCodes.map(() => '?').join(',');
            const result = await this.db.getAllAsync(
                `SELECT product_code, barcode, name, quantity FROM product_goddowns WHERE product_code IN (${placeholders}) ORDER BY product_code, name ASC`,
                productCodes
            );

            const goddownsByProduct = new Map();
            for (const godown of result || []) {
                if (!goddownsByProduct.has(godown.product_code)) {
                    goddownsByProduct.set(godown.product_code, []);
                }
                goddownsByProduct.get(godown.product_code).push({
                    barcode: godown.barcode,
                    name: godown.name,
                    quantity: godown.quantity
                });
            }
            return goddownsByProduct;
        } catch (error) {
            console.error('[DB] Error getting goddowns by codes:', error);
            return new Map();
        }
    }

    // ==================== PRODUCT GODDOWNS ====================
    async saveProductGoddowns(productCode, goddowns) {
        try {
            if (!goddowns || goddowns.length === 0) return true;
            await this.db.runAsync('DELETE FROM product_goddowns WHERE product_code = ?', [productCode]);

            for (const godown of goddowns) {
                const name = godown.goddown_name || godown.name || '';
                await this.db.runAsync(
                    'INSERT INTO product_goddowns (product_code, barcode, name, quantity, created_at) VALUES (?, ?, ?, ?, ?)',
                    [productCode, godown.barcode || '', name, parseFloat(godown.quantity || 0), new Date().toISOString()]
                );
            }
            return true;
        } catch (error) {
            console.error('[DB] Error saving goddowns:', error);
            throw error;
        }
    }

    async getProductGoddowns(productCode) {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM product_goddowns WHERE product_code = ? ORDER BY name ASC', [productCode]);
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting goddowns:', error);
            return [];
        }
    }

    async getGoddownsByBarcode(barcode) {
        try {
            const result = await this.db.getAllAsync('SELECT * FROM product_goddowns WHERE barcode = ? ORDER BY name ASC', [barcode]);
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting goddowns:', error);
            return [];
        }
    }

    // ==================== BULK INSERT FOR GODDOWNS (OPTIMIZED WITH TRANSACTION) ====================
    async saveGoddownsBulk(goddownsWithProductCode) {
        try {
            if (!goddownsWithProductCode || goddownsWithProductCode.length === 0) {
                console.log('[DB] No goddowns to save');
                return true;
            }

            console.log('[DB] Bulk inserting ' + goddownsWithProductCode.length + ' goddowns...');
            const startTime = Date.now();

            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                await this.db.runAsync('DELETE FROM product_goddowns');

                const chunkSize = 100; // Safe for 5 params * 100 = 500
                let insertedCount = 0;

                for (let i = 0; i < goddownsWithProductCode.length; i += chunkSize) {
                    const chunk = goddownsWithProductCode.slice(i, i + chunkSize);

                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const item of chunk) {
                        const godown = item.godown || item;
                        const name = godown.goddown_name || godown.name || '';

                        values.push(
                            item.product_code,
                            godown.barcode || '',
                            name,
                            parseFloat(godown.quantity || 0),
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT OR REPLACE INTO product_goddowns (product_code, barcode, name, quantity, created_at) VALUES ' + placeholders,
                        values
                    );

                    insertedCount += chunk.length;
                }

                await this.db.runAsync('COMMIT');
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[DB] ✅ Bulk inserted ' + insertedCount + ' goddowns in ' + duration + 's');
                return true;

            } catch (error) {
                await this.db.runAsync('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('[DB] Error bulk inserting goddowns:', error);
            throw error;
        }
    }

    // ==================== OFFLINE COLLECTIONS ====================
    async saveOfflineCollection(collection, username = null) {
        try {
            const localId = collection.local_id || 'col_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            await this.db.runAsync(
                'INSERT INTO offline_collections (local_id, customer_code, customer_name, customer_place, customer_phone, amount, payment_type, cheque_number, remarks, date, username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [localId, collection.customer_code || collection.code, collection.customer_name || collection.name,
                    collection.customer_place || collection.place || null, collection.customer_phone || collection.phone || null,
                    collection.amount, collection.payment_type || collection.type, collection.cheque_number || null,
                    collection.remarks || null, collection.date || new Date().toISOString(), username, new Date().toISOString()]
            );
            console.log('[DB] Offline collection saved:', localId, 'for user:', username);
            return localId;
        } catch (error) {
            console.error('[DB] Error saving collection:', error);
            throw error;
        }
    }

    async getOfflineCollections(syncedOnly) {
        try {
            let query = 'SELECT * FROM offline_collections';
            if (syncedOnly !== undefined && syncedOnly !== null) {
                query += ' WHERE synced = ' + (syncedOnly ? 1 : 0);
            }
            query += ' ORDER BY created_at DESC';
            const result = await this.db.getAllAsync(query);
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting collections:', error);
            return [];
        }
    }

    async getSavedCollections() {
        return this.getOfflineCollections(true);
    }

    async markCollectionAsSynced(localId) {
        try {
            await this.db.runAsync('UPDATE offline_collections SET synced = 1, synced_at = ? WHERE local_id = ?',
                [new Date().toISOString(), localId]);
            return true;
        } catch (error) {
            console.error('[DB] Error marking collection synced:', error);
            return false;
        }
    }

    async revertCollectionToPending(localId) {
        try {
            await this.db.runAsync('UPDATE offline_collections SET synced = 0, synced_at = NULL WHERE local_id = ?',
                [localId]);
            return true;
        } catch (error) {
            console.error('[DB] Error reverting collection:', error);
            return false;
        }
    }

    async updateOfflineCollection(id, collection) {
        try {
            await this.db.runAsync(
                'UPDATE offline_collections SET amount = ?, payment_type = ?, cheque_number = ?, remarks = ?, updated_at = ? WHERE id = ?',
                [collection.amount, collection.payment_type || collection.type, collection.cheque_number || null,
                collection.remarks || null, new Date().toISOString(), id]
            );
            console.log('[DB] Offline collection updated:', id);
            return true;
        } catch (error) {
            console.error('[DB] Error updating collection:', error);
            throw error;
        }
    }

    async deleteCollection(collectionId) {
        try {
            await this.db.runAsync('DELETE FROM offline_collections WHERE id = ?', [collectionId]);
            return true;
        } catch (error) {
            console.error('[DB] Error deleting collection:', error);
            return false;
        }
    }

    async cleanupCollections() {
        try {
            if (!this.db) return;

            // 1. Keep synced collections for 48 hours for the "Saved" section
            const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
            const cutoffTime = new Date(Date.now() - FORTY_EIGHT_HOURS_MS).toISOString();

            const resultSynced = await this.db.runAsync(
                'DELETE FROM offline_collections WHERE synced = 1 AND synced_at < ?',
                [cutoffTime]
            );

            // 2. Keep un-synced collections for at least 7 days for safety
            const resultPending = await this.db.runAsync(
                "DELETE FROM offline_collections WHERE synced = 0 AND date < datetime('now', '-7 days')"
            );

            if ((resultSynced?.changes || 0) > 0 || (resultPending?.changes || 0) > 0) {
                console.log(`[DB] Cleanup complete. Synced removed: ${resultSynced?.changes || 0}, Pending removed: ${resultPending?.changes || 0}`);
            }
        } catch (error) {
            console.error('[DB] Error cleaning up collections:', error);
        }
    }

    // ==================== OFFLINE ORDERS ====================
    async saveOfflineOrder(order, username = null) {
        try {
            const localId = order.local_id || 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            await this.db.runAsync(
                'INSERT INTO offline_orders (local_id, customer_code, customer_name, area, payment_type, items, total_amount, date, username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [localId, order.customer_code, order.customer_name, order.area || '', order.payment_type,
                    JSON.stringify(order.items), order.total_amount, order.date || new Date().toISOString(), username, new Date().toISOString()]
            );
            console.log('[DB] Offline order saved:', localId, 'for user:', username);
            return localId;
        } catch (error) {
            console.error('[DB] Error saving order:', error);
            throw error;
        }
    }

    async getOfflineOrders(syncedOnly = false) {
        try {
            let query = 'SELECT * FROM offline_orders';
            if (syncedOnly !== null) {
                query += ' WHERE synced = ' + (syncedOnly ? 1 : 0);
            }
            query += ' ORDER BY created_at DESC';
            const result = await this.db.getAllAsync(query);
            return (result || []).map(order => ({ ...order, items: JSON.parse(order.items || '[]') }));
        } catch (error) {
            console.error('[DB] Error getting orders:', error);
            return [];
        }
    }

    async markOrderAsSynced(localId) {
        try {
            await this.db.runAsync('UPDATE offline_orders SET synced = 1, synced_at = ? WHERE local_id = ?',
                [new Date().toISOString(), localId]);
            return true;
        } catch (error) {
            console.error('[DB] Error marking order synced:', error);
            return false;
        }
    }

    // ==================== CUSTOMER LEDGER ====================
    async saveCustomerLedger(customerCode, ledgerEntries) {
        try {
            await this.db.runAsync('DELETE FROM customer_ledger WHERE customer_code = ?', [customerCode]);
            for (const entry of ledgerEntries) {
                await this.db.runAsync(
                    'INSERT INTO customer_ledger (customer_code, voucher_no, date, particulars, debit, credit, balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [customerCode, entry.voucher_no || '', entry.date || '', entry.particulars || '',
                        entry.debit || 0, entry.credit || 0, entry.balance || 0, new Date().toISOString()]
                );
            }
            return true;
        } catch (error) {
            console.error('[DB] Error saving ledger:', error);
            throw error;
        }
    }

    async getCustomerLedger(customerCode) {
        try {
            const result = await this.db.getAllAsync(
                'SELECT * FROM customer_ledger WHERE customer_code = ? ORDER BY date DESC', [customerCode]
            );
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting ledger:', error);
            return [];
        }
    }

    // ==================== GODOWN STOCK ====================
    async saveGodownStock(stockData) {
        try {
            if (!stockData || stockData.length === 0) return true;
            console.log('[DB] Saving ' + stockData.length + ' godown stock records...');

            await this.db.runAsync('BEGIN TRANSACTION');

            try {
                // First clear existing stock data as we get a full fresh list
                await this.db.runAsync('DELETE FROM godown_stock');

                const chunkSize = 50;
                for (let i = 0; i < stockData.length; i += chunkSize) {
                    const chunk = stockData.slice(i, i + chunkSize);
                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
                    const values = [];

                    for (const item of chunk) {
                        values.push(
                            item.id,
                            item.goddownid || '',
                            item.product || '',
                            parseFloat(item.quantity || 0),
                            item.barcode || '',
                            item.product_name || '',
                            item.goddown_name || '',
                            new Date().toISOString()
                        );
                    }

                    await this.db.runAsync(
                        'INSERT INTO godown_stock (id, goddownid, product, quantity, barcode, product_name, goddown_name, updated_at) VALUES ' + placeholders,
                        values
                    );
                }

                await this.db.runAsync('COMMIT');
                console.log('[DB] ✅ Saved ' + stockData.length + ' godown stock records');
                return true;
            } catch (error) {
                await this.db.runAsync('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error('[DB] Error saving godown stock:', error);
            throw error;
        }
    }

    async getGodownStock() {
        try {
            if (!this.db || !this.isInitialized) await this.init();
            const result = await this.db.getAllAsync('SELECT * FROM godown_stock ORDER BY product_name ASC');
            return result || [];
        } catch (error) {
            console.error('[DB] Error getting godown stock:', error);
            return [];
        }
    }

    // ==================== SYNC METADATA ====================
    async setSyncMetadata(key, value) {
        try {
            await this.db.runAsync('INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
                [key, JSON.stringify(value), new Date().toISOString()]);
            return true;
        } catch (error) {
            console.error('[DB] Error setting metadata:', error);
            return false;
        }
    }

    async getSyncMetadata(key) {
        try {
            // Ensure database is initialized
            if (!this.db || !this.isInitialized) {
                console.log('[DB] Database not initialized yet, initializing...');
                await this.init();
            }

            const result = await this.db.getFirstAsync('SELECT value FROM sync_metadata WHERE key = ?', [key]);
            return result?.value || null;
        } catch (error) {
            console.error('[DB] Error getting metadata:', error);
            return null;
        }
    }

    async getLastSyncTime() {
        return await this.getSyncMetadata('last_sync_time');
    }

    async setLastSyncTime(time) {
        return await this.setSyncMetadata('last_sync_time', time);
    }

    // ==================== UTILITY ====================
    async clearDownloadableData() {
        try {
            await this.db.runAsync('DELETE FROM customers');
            await this.db.runAsync('DELETE FROM products');
            await this.db.runAsync('DELETE FROM areas');
            await this.db.runAsync('DELETE FROM customer_ledger');
            await this.db.runAsync('DELETE FROM batches');
            await this.db.runAsync('DELETE FROM product_photos');
            await this.db.runAsync('DELETE FROM product_goddowns');
            await this.db.runAsync('DELETE FROM godown_stock');
            console.log('[DB] ✅ Downloadable data cleared');
            return true;
        } catch (error) {
            console.error('[DB] Error clearing data:', error);
            return false;
        }
    }

    async clearAllData() {
        try {
            await this.db.runAsync('DELETE FROM customers');
            await this.db.runAsync('DELETE FROM products');
            await this.db.runAsync('DELETE FROM areas');
            await this.db.runAsync('DELETE FROM offline_collections');
            await this.db.runAsync('DELETE FROM offline_orders');
            await this.db.runAsync('DELETE FROM customer_ledger');
            await this.db.runAsync('DELETE FROM company_info');
            await this.db.runAsync('DELETE FROM sync_metadata');
            await this.db.runAsync('DELETE FROM batches');
            await this.db.runAsync('DELETE FROM product_photos');
            await this.db.runAsync('DELETE FROM product_goddowns');
            await this.db.runAsync('DELETE FROM godown_stock');
            console.log('[DB] ✅ All data cleared');
            return true;
        } catch (error) {
            console.error('[DB] Error clearing all data:', error);
            return false;
        }
    }

    async getLastSyncTime() {
        try {
            if (!this.db || !this.isInitialized) await this.init();
            const result = await this.db.getFirstAsync('SELECT value FROM sync_metadata WHERE key = ?', ['last_sync_time']);
            return result ? result.value : null;
        } catch (error) {
            console.error('[DB] Error getting last sync time:', error);
            return null;
        }
    }

    async setLastSyncTime(timestamp) {
        try {
            if (!this.db || !this.isInitialized) await this.init();
            await this.db.runAsync(
                'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
                ['last_sync_time', timestamp, new Date().toISOString()]
            );
            return true;
        } catch (error) {
            console.error('[DB] Error setting last sync time:', error);
            throw error;
        }
    }

    async getDataStats() {
        try {
            // Ensure database is initialized
            if (!this.db || !this.isInitialized) {
                console.log('[DB] Database not initialized yet, initializing...');
                await this.init();
            }

            const stats = {
                customers: 0,
                products: 0,
                offlineCollections: 0,
                offlineOrders: 0,
                pendingCollections: 0,
                pendingOrders: 0
            };

            const customerCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM customers');
            stats.customers = customerCount?.count || 0;

            const productCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM products');
            stats.products = productCount?.count || 0;

            const collectionCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM offline_collections');
            stats.offlineCollections = collectionCount?.count || 0;

            const orderCount = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM offline_orders');
            stats.offlineOrders = orderCount?.count || 0;

            const pendingCollections = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM offline_collections WHERE synced = 0');
            stats.pendingCollections = pendingCollections?.count || 0;

            const pendingOrders = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM offline_orders WHERE synced = 0');
            stats.pendingOrders = pendingOrders?.count || 0;

            return stats;
        } catch (error) {
            console.error('[DB] Error getting data stats:', error);
            return {
                customers: 0,
                products: 0,
                offlineCollections: 0,
                offlineOrders: 0,
                pendingCollections: 0,
                pendingOrders: 0
            };
        }
    }
}

// Create singleton instance
const dbService = new DatabaseService();
export default dbService;