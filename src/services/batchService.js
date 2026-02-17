// src/services/batchService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import dbService from './database';

const API_BASE_URL = 'https://tasksas.com/api';

class BatchService {
    constructor() {
        this.isFetching = false;
    }

    async getAuthToken() {
        try {
            const token = await AsyncStorage.getItem('authToken');
            if (!token) {
                throw new Error('No auth token found. Please login again.');
            }
            return token;
        } catch (error) {
            console.error('Error getting auth token:', error);
            throw error;
        }
    }

    /**
     * Fetch products with batches from API
     * Tries multiple possible endpoints
     */
    async fetchProductsWithBatches() {
        if (this.isFetching) {
            console.log('[BatchService] Fetch already in progress');
            return null;
        }

        this.isFetching = true;

        try {
            const token = await this.getAuthToken();

            // Try different possible endpoints
            const endpoints = [
                `${API_BASE_URL}/product/get-products-with-batches`,
                `${API_BASE_URL}/products/batches`,
                `${API_BASE_URL}/product/get-product-details`, // Fallback to existing endpoint
            ];

            let productsData = null;

            for (const endpoint of endpoints) {
                try {
                    console.log(`[BatchService] Trying endpoint: ${endpoint}`);
                    const response = await fetch(endpoint, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`[BatchService] Response from ${endpoint}:`, typeof data);

                        // Handle different response formats
                        if (data.success && Array.isArray(data.products)) {
                            productsData = data.products;
                        } else if (Array.isArray(data)) {
                            productsData = data;
                        } else if (data.data && Array.isArray(data.data)) {
                            productsData = data.data;
                        }

                        if (productsData && productsData.length > 0) {
                            console.log(`[BatchService] ✅ Found ${productsData.length} products from ${endpoint}`);
                            break;
                        }
                    } else {
                        console.log(`[BatchService] ${endpoint} returned ${response.status}`);
                    }
                } catch (err) {
                    console.log(`[BatchService] Failed to fetch from ${endpoint}:`, err.message);
                    continue;
                }
            }

            if (!productsData || productsData.length === 0) {
                console.warn('[BatchService] ⚠️ No products with batches found from API');
                return null;
            }

            return productsData;
        } catch (error) {
            console.error('[BatchService] Error fetching products with batches:', error);
            throw error;
        } finally {
            this.isFetching = false;
        }
    }

    /**
     * Cache product batches to database
     */
    async cacheProductBatches(productsData) {
        try {
            console.log(`[BatchService] Caching ${productsData.length} products with batches...`);

            await dbService.init();

            let totalBatches = 0;
            let totalPhotos = 0;
            let totalGoddowns = 0;
            let processedCount = 0;

            // Process in chunks to show progress
            const chunkSize = 100;
            for (let i = 0; i < productsData.length; i += chunkSize) {
                const chunk = productsData.slice(i, i + chunkSize);

                for (const product of chunk) {
                    const productCode = product.code;

                    if (!productCode) {
                        continue;
                    }

                    // Save batches
                    if (product.batches && Array.isArray(product.batches) && product.batches.length > 0) {
                        await dbService.saveBatches(productCode, product.batches);
                        totalBatches += product.batches.length;
                    }

                    // Save photos
                    if (product.photos && Array.isArray(product.photos) && product.photos.length > 0) {
                        await dbService.saveProductPhotos(productCode, product.photos);
                        totalPhotos += product.photos.length;
                    }

                    // Save goddowns
                    if (product.goddowns && Array.isArray(product.goddowns) && product.goddowns.length > 0) {
                        await dbService.saveProductGoddowns(productCode, product.goddowns);
                        totalGoddowns += product.goddowns.length;
                    }

                    processedCount++;
                }

                // CRITICAL FIX: Save the actual product definitions (with department_name)
                // batchService was previously only saving batches/photos/goddowns but relying on syncService for products?
                // We MUST save products here to ensure department_name is captured from this API response.
                if (chunk.length > 0) {
                    await dbService.saveProducts(chunk);
                }

                // Log progress every 500 products
                if (processedCount % 500 === 0 || processedCount === productsData.length) {
                    console.log(`[BatchService] Progress: ${processedCount}/${productsData.length} products (${totalBatches} batches)`);
                }
            }

            console.log(`[BatchService] ✅ Cached ${totalBatches} batches, ${totalPhotos} photos, ${totalGoddowns} goddowns`);

            return {
                products: productsData.length,
                batches: totalBatches,
                photos: totalPhotos,
                goddowns: totalGoddowns
            };
        } catch (error) {
            console.error('[BatchService] Error caching product batches:', error);
            throw error;
        }
    }

    /**
     * Get products with batches from offline database
     * OPTIMIZED: Uses bulk queries to avoid N+1 query problem
     * @param {number} limit - Optional limit for pagination (null = all)
     * @param {number} offset - Optional offset for pagination (default 0)
     * @param {object} filters - Filter options including sortBy
     */
    async getProductBatchesOffline(limit = null, offset = 0, filters = {}) {
        try {
            const startTime = Date.now();
            console.log('[BatchService] Loading batches from offline database...', { limit, offset, filters });

            await dbService.init();

            // Get products with optional pagination and filters
            let query = 'SELECT * FROM products WHERE 1=1';
            const params = [];

            // Apply filters
            if (filters.brands && filters.brands.length > 0) {
                const placeholders = filters.brands.map(() => '?').join(',');
                query += ` AND brand IN (${placeholders})`;
                params.push(...filters.brands);
            }

            if (filters.categories && filters.categories.length > 0) {
                const placeholders = filters.categories.map(() => '?').join(',');
                query += ` AND category IN (${placeholders})`;
                params.push(...filters.categories);
            }

            if (filters.departments && filters.departments.length > 0) {
                const placeholders = filters.departments.map(() => '?').join(',');
                query += ` AND department_name IN (${placeholders})`;
                params.push(...filters.departments);
            }

            if (filters.search) {
                const term = `%${filters.search}%`;
                query += ` AND (name LIKE ? OR code LIKE ? OR barcode LIKE ? OR brand LIKE ? OR category LIKE ?)`;
                params.push(term, term, term, term, term);
            }

            if (filters.inStock) {
                query += ' AND stock > 0';
            }

            // Apply sorting based on sortBy parameter
            if (filters.sortBy === 'barcode') {
                // Sort by barcode (CAST to INTEGER for numeric sorting if possible, fallback to text)
                // USER REQUEST: Sort by Code (not barcode) when barcode_based_list is true
                // "list by the code in teh product"
                query += ' ORDER BY CAST(code AS INTEGER) ASC, code ASC';
            } else {
                query += ' ORDER BY name ASC';
            }

            if (limit !== null) {
                query += ' LIMIT ? OFFSET ?';
                params.push(limit, offset);
            }

            const products = await dbService.db.getAllAsync(query, params);

            if (products.length === 0) {
                console.log('[BatchService] No products found in database');
                return [];
            }

            console.log(`[BatchService] ✅ Loaded ${products.length} products from database`);

            // OPTIMIZED: Get ALL batches in a single query instead of N queries
            const allBatches = await dbService.getAllBatches();

            // Group batches by product code for O(1) lookup
            const batchesByProduct = {};
            for (const batch of allBatches) {
                if (!batchesByProduct[batch.product_code]) {
                    batchesByProduct[batch.product_code] = [];
                }
                batchesByProduct[batch.product_code].push(batch);
            }

            // OPTIMIZED: Get ALL photos and goddowns in single queries instead of N queries each
            const allPhotos = await dbService.getAllProductPhotos(); // Returns Map<product_code, photos[]>
            const allGoddowns = await dbService.getAllProductGoddowns(); // Returns Map<product_code, goddowns[]>

            // Combine products with their batches, photos, and goddowns
            const productsWithBatches = [];

            for (const product of products) {
                const batches = batchesByProduct[product.code] || [];
                const photos = allPhotos.get(product.code) || [];
                const goddowns = allGoddowns.get(product.code) || [];

                productsWithBatches.push({
                    ...product,
                    batches,
                    photos,
                    goddowns
                });
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[BatchService] ✅ Loaded ${productsWithBatches.length} products with batches in ${duration}s`);
            console.log(`[BatchService] Total batches: ${allBatches.length}, photos: ${allPhotos.size} products, goddowns: ${allGoddowns.size} products`);

            return productsWithBatches;
        } catch (error) {
            console.error('[BatchService] Error getting product batches offline:', error);
            return [];
        }
    }

    /**
     * Helper function to safely parse float values
     */
    parsePrice(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Transform products with batches into flat batch card list
     * Each batch becomes a separate card
     * @param {Array} productsWithBatches - Products with their batches
     * @param {string} sortBy - Sort method: 'barcode' or 'name' (default)
     */
    transformBatchesToCards(productsWithBatches, sortBy = 'name') {
        try {
            console.log(`[BatchService] Transforming ${productsWithBatches.length} products to batch cards...`);

            const batchCards = [];

            for (const product of productsWithBatches) {
                // If product has batches, create a card for each batch
                if (product.batches && product.batches.length > 0) {
                    for (const batch of product.batches) {
                        // Parse all price fields carefully
                        const mrp = this.parsePrice(batch.MRP || batch.mrp);
                        const retail = this.parsePrice(batch.RETAIL || batch.retail);
                        const dp = this.parsePrice(batch['D.P'] || batch.dp);
                        const cb = this.parsePrice(batch.CB || batch.cb);
                        const cost = this.parsePrice(batch.COST || batch.cost);
                        const netRate = this.parsePrice(batch['NET RATE'] || batch.net_rate || batch.netrate);
                        const pkShop = this.parsePrice(batch['PK SHOP'] || batch.pk_shop || batch.pkshop);
                        const quantity = this.parsePrice(batch.quantity);

                        batchCards.push({
                            // Unique ID for the card
                            // Use batch.id (unique) + product code to guarantee uniqueness
                            // Fallback to barcode if id missing, but add index-like suffix if needed (though batch.id should exist)
                            id: `${product.code}_${batch.barcode || batch.id || batch.batch_id}`,

                            // Product info
                            code: product.code,
                            name: product.name,
                            brand: product.brand || '', // Brand for filtering
                            unit: product.unit || '',
                            taxcode: product.taxcode || '',
                            text6: product.text6 || '', // HSN Code
                            productCategory: product.category || '', // Category for filtering (from 'product' field in API),

                            // Batch-specific info
                            batchId: batch.id || batch.batch_id,
                            barcode: batch.barcode || '',
                            mrp: mrp,
                            price: retail > 0 ? retail : mrp, // Use retail as price, fallback to MRP
                            stock: quantity,

                            // Additional batch prices
                            retail: retail,
                            dp: dp,
                            cb: cb,
                            cost: cost,
                            secondPrice: this.parsePrice(batch.second_price),
                            thirdPrice: this.parsePrice(batch.third_price),
                            netRate: netRate,
                            pkShop: pkShop,
                            sales: this.parsePrice(batch.sales || batch.Sales),
                            fourthPrice: this.parsePrice(batch.fourth_price || batch.fourthprice || batch.fourthPrice),
                            nlc1: this.parsePrice(batch.nlc1),
                            bmrp: this.parsePrice(batch.bmrp || batch.BMRP),
                            expiryDate: batch.expirydate || batch.expiry_date || null,

                            // Photos (shared across all batches of same product)
                            photos: product.photos || [],

                            // Goddowns (apply product godowns to all batches since they lack barcode)
                            goddowns: product.goddowns || [],

                            // Prices array for dynamic display
                            prices: batch.prices || [],

                            // Full batch object for reference
                            batch: batch
                        });

                        // Debug log for first few items
                        if (batchCards.length <= 3) {
                            console.log(`[BatchService] Sample card ${batchCards.length}:`, {
                                name: product.name,
                                barcode: batch.barcode,
                                mrp: mrp,
                                retail: retail,
                                price: retail > 0 ? retail : mrp,
                                photos: product.photos?.length || 0
                            });
                        }
                    }
                } else {
                    // If no batches, create a single card from product data
                    const productMrp = this.parsePrice(product.mrp);
                    const productPrice = this.parsePrice(product.price);

                    batchCards.push({
                        id: product.code,
                        code: product.code,
                        name: product.name,
                        brand: product.brand || '',
                        unit: product.unit || '',
                        taxcode: product.taxcode || '',
                        text6: product.text6 || '', // HSN Code
                        productCategory: product.category || '',
                        batchId: null,
                        barcode: product.barcode || product.code,
                        mrp: productMrp,
                        price: productPrice > 0 ? productPrice : productMrp,
                        stock: this.parsePrice(product.stock),
                        retail: productPrice,
                        dp: 0,
                        cb: 0,
                        cost: 0,
                        secondPrice: 0,
                        thirdPrice: 0,
                        fourthPrice: 0,
                        sales: 0,
                        nlc1: 0,
                        bmrp: 0,
                        netRate: productPrice,
                        pkShop: 0,
                        expiryDate: null,
                        photos: product.photos || [],
                        goddowns: product.goddowns || [],
                        batch: null
                    });
                }
            }
            // Sort the batch cards based on sortBy parameter
            if (sortBy === 'barcode') {
                console.log('[BatchService] Sorting batch cards by CODE (numeric safe)...');
                batchCards.sort((a, b) => {
                    const strA = String(a.code || '').trim();
                    const strB = String(b.code || '').trim();

                    // Try to parse as numbers
                    const numA = parseFloat(strA);
                    const numB = parseFloat(strB);

                    const isNumA = !isNaN(numA) && isFinite(numA);
                    const isNumB = !isNaN(numB) && isFinite(numB);

                    // If both are valid numbers, sort numerically
                    if (isNumA && isNumB) {
                        return numA - numB;
                    }

                    // If only A is number, put it first (or last depending on preference, usually numbers first)
                    if (isNumA && !isNumB) return -1;
                    if (!isNumA && isNumB) return 1;

                    // Fallback to string comparison
                    return strA.localeCompare(strB);
                });
            } else {
                // Default: sort by name
                batchCards.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            }

            console.log(`[BatchService] ✅ Created ${batchCards.length} batch cards (sorted by ${sortBy})`);

            return batchCards;

            return batchCards;
        } catch (error) {
            console.error('[BatchService] Error transforming batches to cards:', error);
        }
    }

    /**
     * Download and cache products with batches
     */
    async downloadAndCache() {
        try {
            console.log('[BatchService] Starting download and cache...');

            // Fetch from API
            const productsData = await this.fetchProductsWithBatches();

            if (!productsData) {
                console.log('[BatchService] No data fetched from API');
                return null;
            }

            // Cache to database
            const stats = await this.cacheProductBatches(productsData);

            console.log('[BatchService] ✅ Download and cache complete:', stats);

            return stats;
        } catch (error) {
            console.error('[BatchService] Error in download and cache:', error);
            throw error;
        }
    }
}



// Create singleton instance
const batchService = new BatchService();

export default batchService;