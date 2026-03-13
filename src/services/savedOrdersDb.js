import * as SQLite from 'expo-sqlite';

class SavedOrdersDbService {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized && this.db) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                console.log('[SavedOrdersDB] 🔄 Initializing database: saved_orders_v1.db');

                // Use useNewConnection: true to prevent NullPointerException on Android (known issue with expo-sqlite v16)
                this.db = await SQLite.openDatabaseAsync('saved_orders_v1.db', {
                    useNewConnection: true
                });

                if (!this.db) {
                    throw new Error('Failed to open database handle');
                }

                // Simple connection test
                await this.db.getFirstAsync('SELECT 1');

                // Table for Orders, Sales, and Returns
                await this.db.execAsync(`
                    CREATE TABLE IF NOT EXISTS saved_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        transaction_id TEXT NOT NULL DEFAULT "",
                        type TEXT NOT NULL DEFAULT "Order",
                        data TEXT NOT NULL DEFAULT "{}",
                        created_at TEXT NOT NULL DEFAULT ""
                    );
                `);

                // Comprehensive Migration Check
                try {
                    if (this.schemaChecked) return;

                    const tableInfo = await this.db.getAllAsync("PRAGMA table_info(saved_transactions)");
                    const existingColumns = tableInfo.map(col => col.name);

                    // CRITICAL FIX: If legacy 'order_data' exists, it often has 
                    // a strict NOT NULL constraint that prevents uploads.
                    // The safest and most reliable fix is to drop and recreate.
                    if (existingColumns.includes('order_data')) {
                        console.log('[SavedOrdersDB] 🛠️ Legacy schema detected (order_data). Performing hard reset...');

                        await this.db.execAsync('DROP TABLE IF EXISTS saved_transactions;');

                        await this.db.execAsync(`
                            CREATE TABLE saved_transactions (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                transaction_id TEXT NOT NULL DEFAULT "",
                                type TEXT NOT NULL DEFAULT "Order",
                                data TEXT NOT NULL DEFAULT "{}",
                                created_at TEXT NOT NULL DEFAULT ""
                            );
                        `);
                        console.log('[SavedOrdersDB] ✅ Hard reset complete. Schema is now clean.');

                        // Update lists for subsequent checks
                        existingColumns.length = 0;
                        const newInfo = await this.db.getAllAsync("PRAGMA table_info(saved_transactions)");
                        existingColumns.push(...newInfo.map(col => col.name));
                    }

                    const requiredColumns = [
                        { name: 'transaction_id', type: 'TEXT NOT NULL DEFAULT ""' },
                        { name: 'type', type: 'TEXT NOT NULL DEFAULT "Order"' },
                        { name: 'data', type: 'TEXT NOT NULL DEFAULT "{}"' },
                        { name: 'created_at', type: `TEXT NOT NULL DEFAULT '${new Date().toISOString()}'` }
                    ];

                    for (const col of requiredColumns) {
                        if (!existingColumns.includes(col.name)) {
                            await this.db.execAsync(`ALTER TABLE saved_transactions ADD COLUMN ${col.name} ${col.type}`);
                            console.log(`[SavedOrdersDB] Migration: Added missing ${col.name} column`);
                        }
                    }
                } catch (migErr) {
                    console.error('[SavedOrdersDB] ❌ Migration check failed:', migErr);
                }

                this.schemaChecked = true;

                this.isInitialized = true;
                this.initPromise = null;
                console.log('[SavedOrdersDB] ✅ Database initialized successfully');

                // Cleanup in background - don't block
                setTimeout(() => this.cleanupOldTransactions(), 1000);

                return true;
            } catch (error) {
                console.error('[SavedOrdersDB] ❌ Initialization error:', error);
                this.isInitialized = false;
                this.initPromise = null;
                this.db = null;
                throw error;
            }
        })();

        return this.initPromise;
    }

    async saveTransactionLocally(transactionId, type, data) {
        try {
            await this.init();
            if (!this.db) throw new Error('DB handle is null after init');

            const createdAt = new Date().toISOString();
            const jsonData = JSON.stringify(data);

            await this.db.runAsync(
                'INSERT INTO saved_transactions (transaction_id, type, data, created_at) VALUES (?, ?, ?, ?)',
                [transactionId || "", type || "Order", jsonData || "{}", createdAt]
            );
            console.log(`[SavedOrdersDB] ${type} saved locally:`, transactionId);
        } catch (error) {
            console.error('[SavedOrdersDB] Error saving transaction:', error);
        }
    }

    async getSavedTransactions(type) {
        try {
            await this.init();
            if (!this.db) throw new Error('DB handle is null after init');

            const rows = await this.db.getAllAsync(
                'SELECT * FROM saved_transactions WHERE type = ? ORDER BY created_at DESC',
                [type || "Order"]
            );

            return rows.map(row => {
                try {
                    const parsedData = JSON.parse(row.data);
                    return {
                        ...parsedData,
                        local_db_id: row.id,
                        synced_at: row.created_at
                    };
                } catch (e) {
                    return null;
                }
            }).filter(item => item !== null);
        } catch (error) {
            console.error('[SavedOrdersDB] Error fetching transactions:', error);
            return [];
        }
    }

    async deleteSavedTransaction(transactionId) {
        try {
            await this.init();
            if (!this.db) throw new Error('DB handle is null after init');

            await this.db.runAsync(
                'DELETE FROM saved_transactions WHERE transaction_id = ?',
                [transactionId || ""]
            );
            console.log('[SavedOrdersDB] Transaction deleted:', transactionId);
        } catch (error) {
            console.error('[SavedOrdersDB] Error deleting transaction:', error);
        }
    }

    async cleanupOldTransactions() {
        try {
            if (!this.db) return;

            // 48 hour policy
            const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
            const cutoffTime = new Date(Date.now() - FORTY_EIGHT_HOURS_MS).toISOString();

            const result = await this.db.runAsync(
                'DELETE FROM saved_transactions WHERE created_at < ?',
                [cutoffTime]
            );

            if (result.changes > 0) {
                console.log(`[SavedOrdersDB] Cleaned up ${result.changes} old records`);
            }
        } catch (error) {
            console.error('[SavedOrdersDB] Cleanup error:', error);
        }
    }
}

const savedOrdersDbService = new SavedOrdersDbService();
export default savedOrdersDbService;
