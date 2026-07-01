// src/services/syncService.js - OPTIMIZED VERSION
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import dbService from './database';

const API_BASE_URL = 'https://tasksas.com/api';

class SyncService {
    constructor() {
        this.isDownloading = false;
        this.isUploading = false;
        this.downloadProgress = 0;
        this.progressCallback = null;
        this.abortController = null;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    updateProgress(stage, message, progress, completed = false) {
        this.downloadProgress = progress;
        if (this.progressCallback) {
            this.progressCallback({
                stage,      // 'customers', 'products', 'batches', 'areas'
                message,
                progress,
                completed
            });
        }
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

    // ==================== RETRY HELPER ====================
    async retryWithBackoff(fn, maxRetries = 3, operationName = 'Operation') {
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Sync] ${operationName} - attempt ${attempt}/${maxRetries}`);
                return await fn();
            } catch (error) {
                lastError = error;
                console.error(`[Sync] ${operationName} attempt ${attempt} failed:`, error.message);

                if (attempt === maxRetries) {
                    throw new Error(`${operationName} failed after ${maxRetries} attempts: ${error.message}`);
                }

                // Exponential backoff: 2s, 4s, 8s
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`[Sync] Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        throw lastError;
    }

    // ==================== CHECK IF DATA EXISTS ====================
    async hasDownloadedData() {
        try {
            await dbService.init();
            const stats = await dbService.getDataStats();
            return stats.customers > 0 && stats.products > 0;
        } catch (error) {
            console.error('Error checking downloaded data:', error);
            return false;
        }
    }

    // ==================== DOWNLOAD ALL DATA (OPTIMIZED) ====================
    async downloadAllData(forceRefresh = false) {
        if (this.isDownloading) {
            throw new Error('Download already in progress');
        }

        this.isDownloading = true;
        this.downloadProgress = 0;
        this.abortController = new AbortController();

        const stages = {
            customers: false,
            products: false,
            batches: false,
            areas: false,
            settings: false,
            bankQr: false,
            godownStock: false
        };

        try {
            // Initialize database
            await dbService.init();

            // If force refresh, clear old data
            if (forceRefresh) {
                this.updateProgress('init', 'Clearing old data...', 5);
                await dbService.clearDownloadableData();
            }

            // OPTIMIZATION: Download lighter assets in PARALLEL
            this.updateProgress('parallel', 'Downloading settings and assets...', 10);
            const parallelDownloads = await Promise.allSettled([
                this.downloadSettings(),
                this.downloadUsers(),
                this.downloadLogo(),
                this.downloadBankQr()
            ]);

            // Process Parallel Results
            if (parallelDownloads[0].status === 'fulfilled') {
                stages.settings = true;
                this.updateProgress('settings', 'Settings downloaded', 15, true);
            }
            if (parallelDownloads[2].status === 'fulfilled' && parallelDownloads[2].value === true) {
                console.log('Logo downloaded');
            }
            if (parallelDownloads[3].status === 'fulfilled' && parallelDownloads[3].value === true) {
                stages.bankQr = true;
                console.log('Bank QR downloaded');
            }

            // SEQUENTIAL DATABASE DOWNLOADS (to avoid SQLite transaction conflicts)
            // Areas
            this.updateProgress('areas', 'Downloading areas...', 20);
            if (await this.downloadAreas()) {
                stages.areas = true;
                this.updateProgress('areas', 'Areas downloaded', 22, true);
            }

            // Customers
            this.updateProgress('customers', 'Downloading customers...', 24);
            if (await this.downloadCustomers()) {
                stages.customers = true;
                this.updateProgress('customers', 'Customers downloaded', 30, true);
            }

            // Godown Stock
            this.updateProgress('godownStock', 'Downloading Godown Stock...', 35);
            if (await this.downloadGodownStock()) {
                stages.godownStock = true;
                console.log('Godown Stock downloaded');
            }

            // Stage 2: Download products WITH batches/photos/goddowns (SINGLE CALL WITH RETRY)
            this.updateProgress('products', 'Downloading products with batches...', 30);
            try {
                const stats = await this.retryWithBackoff(
                    () => this.downloadProductsOptimized(),
                    3,
                    'Product download'
                );
                if (stats.products > 0) {
                    stages.products = true;
                    stages.batches = true; // Batches downloaded with products
                    this.updateProgress('products', `${stats.products} products, ${stats.batches} batches downloaded`, 90, true);
                } else {
                    this.updateProgress('products', 'No products found', 90, false);
                }
            } catch (error) {
                console.error('Product download failed after all retries:', error);
                this.updateProgress('products', 'Products failed - check connection', 90, false);
            }

            // Set last sync time
            await dbService.setLastSyncTime(new Date().toISOString());

            this.updateProgress('complete', 'Download complete!', 100, true);

            return {
                success: true,
                stages,
                message: 'Data synchronized successfully'
            };
        } catch (error) {
            console.error('Download error:', error);
            this.updateProgress('error', 'Download failed', 0);
            throw error;
        } finally {
            this.isDownloading = false;
            this.abortController = null;
        }
    }

    // ==================== OPTIMIZED PRODUCT DOWNLOAD (WITH BATCHES) ====================
    async downloadProductsOptimized() {
        try {
            const token = await this.getAuthToken();

            // Primary endpoint (returns products with batches, photos, goddowns)
            const primaryEndpoint = `${API_BASE_URL}/product/get-product-details/`;

            console.log(`[Sync] Fetching products with batches from: ${primaryEndpoint}`);

            // Create AbortController with longer timeout for large data (5 minutes)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.error('[Sync] Product download timed out after 5 minutes');
            }, 300000);

            let response;
            try {
                response = await fetch(primaryEndpoint, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    cache: 'no-store',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Product download timed out. The server may be slow or the data is too large. Please try again.');
                }
                throw fetchError;
            }

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            console.log(`[Sync] Product API response type: ${typeof data}, products count: ${Array.isArray(data) ? data.length : (data.products?.length || data.data?.length || 0)}`);

            // Parse response
            let products = [];
            if (Array.isArray(data)) {
                products = data;
            } else if (data.data && Array.isArray(data.data)) {
                products = data.data;
            } else if (data.products && Array.isArray(data.products)) {
                products = data.products;
            }

            if (products.length === 0) {
                console.warn('[Sync] No products found in response');
                return { products: 0, batches: 0, photos: 0, goddowns: 0 };
            }

            console.log(`[Sync] Processing ${products.length} products with batches...`);

            // Normalize and validate products
            const normalizedProducts = products
                .map(p => ({
                    code: p.code || p.productcode || p.PRODUCTCODE || '',
                    name: p.name || p.productname || p.PRODUCTNAME || '',
                    barcode: p.barcode || p.BARCODE || p.code || '',
                    price: parseFloat(p.price || p['NET RATE'] || p.netrate || p.PRICE || 0),
                    mrp: parseFloat(p.mrp || p.MRP || 0),
                    stock: parseFloat(p.stock || p.STOCK || 0),
                    unit: p.unit || p.packing || p.PACKING || '',
                    brand: p.brand || p.BRAND || '', // Brand field
                    category: p.product || p.category || p.PRODUCT || '', // Category from 'product' field
                    taxcode: p.taxcode || p.TAXCODE || '',
                    text6: p.text6 || p.TEXT6 || '', // HSN Code
                    description: p.description || '',
                    department_name: p.department_name || p.DEPARTMENT || p.department || p.DEPT || p.dept || '',
                }))
                .filter(p => p.code && p.name); // Only valid products

            console.log(`[Sync] Normalized ${normalizedProducts.length} valid products`);

            // Counters for batches, photos, goddowns
            let totalBatches = 0;
            let totalPhotos = 0;
            let totalGoddowns = 0;

            if (normalizedProducts.length > 0) {
                // Save products first
                await dbService.saveProducts(normalizedProducts);

                // Now extract and save batches, photos, goddowns from the SAME response
                // OPTIMIZED: Collect ALL data first, then bulk insert

                const allBatches = [];
                const allPhotos = [];
                const allGoddowns = [];

                for (const product of products) {
                    const productCode = product.code || product.productcode || product.PRODUCTCODE;

                    if (!productCode) continue;

                    // Collect batches with product_code
                    if (product.batches && Array.isArray(product.batches) && product.batches.length > 0) {
                        for (const batch of product.batches) {
                            allBatches.push({ ...batch, product_code: productCode });
                        }
                        totalBatches += product.batches.length;
                    }

                    // Collect photos with product_code
                    if (product.photos && Array.isArray(product.photos) && product.photos.length > 0) {
                        for (let i = 0; i < product.photos.length; i++) {
                            const photo = product.photos[i];
                            allPhotos.push({
                                photo: photo,
                                product_code: productCode,
                                order_index: i
                            });
                        }
                        totalPhotos += product.photos.length;
                    }

                    // Collect goddowns with product_code
                    if (product.goddowns && Array.isArray(product.goddowns) && product.goddowns.length > 0) {
                        for (const godown of product.goddowns) {
                            allGoddowns.push({ ...godown, product_code: productCode });
                        }
                        totalGoddowns += product.goddowns.length;
                    }
                }

                // Bulk insert all collected data
                if (allBatches.length > 0) {
                    await dbService.saveBatchesBulk(allBatches);
                }
                if (allPhotos.length > 0) {
                    await dbService.savePhotosBulk(allPhotos);
                }
                if (allGoddowns.length > 0) {
                    await dbService.saveGoddownsBulk(allGoddowns);
                }
            }

            return {
                products: normalizedProducts.length,
                batches: totalBatches,
                photos: totalPhotos,
                goddowns: totalGoddowns
            };
        } catch (error) {
            console.error('[Sync] Error downloading products:', error);
            throw error;
        }
    }

    async downloadCustomers() {
        try {
            const token = await this.getAuthToken();
            const clientId = await AsyncStorage.getItem('clientId');

            // Create timeout controller for customers (2 minutes)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            const response = await fetch(`${API_BASE_URL}/debtors/get-debtors/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Failed to fetch customers: ${response.status}`);
            }

            const data = await response.json();

            // Handle different response formats
            let customers = [];
            if (Array.isArray(data)) {
                customers = data;
            } else if (data.data && Array.isArray(data.data)) {
                customers = data.data;
            } else if (data.debtors && Array.isArray(data.debtors)) {
                customers = data.debtors;
            }

            // Tag customers with current client_id for shop isolation
            if (clientId) {
                customers = customers.map(c => ({
                    ...c,
                    client_id: clientId
                }));
                console.log(`[Sync] Tagged ${customers.length} customers with client_id: ${clientId}`);
            }

            // Save to database
            await dbService.saveCustomers(customers);

            return customers.length;
        } catch (error) {
            console.error('[Sync] Error downloading customers:', error);
            throw error;
        }
    }

    // ==================== DEPRECATED - Batches now downloaded with products ====================
    // async downloadProductBatches() {
    //     try {
    //         console.log('[Sync] Fetching batches...');
    //         const stats = await batchService.downloadAndCache();

    //         if (!stats) {
    //             console.warn('[Sync] No batch data');
    //             return 0;
    //         }

    //         console.log(`[Sync] ✅ Downloaded ${stats.batches} batches`);
    //         return stats.batches;
    //     } catch (error) {
    //         console.error('[Sync] Error downloading batches:', error);
    //         throw error;
    //     }
    // }

    async downloadAreas() {
        try {
            const token = await this.getAuthToken();

            // Create timeout controller for areas (1 minute - smaller dataset)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(`${API_BASE_URL}/area/list/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Sync] Area API returned ${response.status}`);
                return 0;
            }

            const data = await response.json();

            let areas = [];
            if (data.success && data.areas && Array.isArray(data.areas)) {
                areas = data.areas;
            } else if (Array.isArray(data)) {
                areas = data;
            }

            const validAreas = areas.filter(area =>
                area && typeof area === 'string' && area.trim() !== ''
            );

            await dbService.saveAreas(validAreas);

            return validAreas.length;
        } catch (error) {
            console.error('[Sync] Error downloading areas:', error);
            throw error;
        }
    }

    async downloadSettings() {
        try {
            const token = await this.getAuthToken();
            // 10s timeout for settings
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${API_BASE_URL}/settings/options/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Sync] Settings API returned ${response.status}`);
                return false;
            }

            const data = await response.json();
            // Store entire JSON object
            await AsyncStorage.setItem('app_settings', JSON.stringify(data));
            
            // Map API options to local settings format
            if (data.default_print_form) {
                let formType = 'form1';
                const apiForm = String(data.default_print_form).toLowerCase().replace(/\s+/g, '');
                if (['form1', 'form2', 'form3'].includes(apiForm)) {
                    formType = apiForm;
                }
                await AsyncStorage.setItem('settings_print_form_type', formType);
            }
            
            if (data.tax_type) {
                let taxCode = 'no_tax';
                const apiTax = String(data.tax_type).toLowerCase().replace(/\s+/g, '');
                if (apiTax === 'plustax') taxCode = 'plus_tax';
                else if (apiTax === 'reversetax') taxCode = 'reverse_tax';
                else if (apiTax === 'notax') taxCode = 'no_tax';
                
                await AsyncStorage.setItem('settings_tax_code', taxCode);
            }

            console.log('[Sync] Settings downloaded and saved');
            console.log('[Sync] barcode_based_list:', data.barcode_based_list);
            return true;
        } catch (error) {
            console.error('[Sync] Error downloading settings:', error);
            return false;
        }
    }

    async downloadUsers() {
        try {
            console.log('[Sync] Downloading users...');
            const token = await this.getAuthToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(`${API_BASE_URL}/users_api/list/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Sync] Users API returned ${response.status}`);
                return false;
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.users)) {
                // Get current username to find our specific details
                const currentUsername = await AsyncStorage.getItem('username');

                if (currentUsername) {
                    const currentUser = data.users.find(u =>
                        (u.id || '').toUpperCase() === currentUsername.toUpperCase()
                    );

                    if (currentUser) {
                        console.log(`[Sync] Updated user details for ${currentUsername}: accountcode=${currentUser.accountcode}`);
                        // Update accountcode and role if available
                        await AsyncStorage.setItem('accountcode', currentUser.accountcode || '');
                        if (currentUser.role) await AsyncStorage.setItem('role', currentUser.role);
                        if (currentUser.client_id) await AsyncStorage.setItem('client_id', currentUser.client_id);
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Sync] Error downloading users:', error);
            return false;
        }
    }

    async downloadLogo() {
        try {
            console.log('[Sync] Checking for company logo...');
            const token = await this.getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/settings/logo/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn(`[Sync] Logo API returned ${response.status}`);
                return false;
            }

            const data = await response.json();
            if (data.logo_url) {
                console.log(`[Sync] Found logo URL: ${data.logo_url}`);
                
                const fileUri = FileSystem.documentDirectory + 'printer_logo.png';
                
                // Ensure fresh download by deleting existing file first
                try {
                    const existing = await FileSystem.getInfoAsync(fileUri);
                    if (existing.exists) {
                        await FileSystem.deleteAsync(fileUri, { idempotent: true });
                    }
                } catch (e) { console.log('[Sync] Error clearing old logo', e); }

                // Download image
                const downloadRes = await FileSystem.downloadAsync(
                    data.logo_url,
                    fileUri
                );

                if (downloadRes.status === 200) {
                    await AsyncStorage.setItem('printer_logo_synced', 'true');
                    console.log(`[Sync] Logo downloaded successfully to ${fileUri}`);
                    
                    // Verify base64 content
                    try {
                        const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
                        console.log(`[Sync] Logo Base64 Preview: ${b64.substring(0, 50)}... (Total: ${b64.length})`);
                    } catch (e) { console.warn("[Sync] Could not read logo for preview", e); }
                    
                    return true;
                } else {
                    console.warn(`[Sync] Failed to download logo image. Status: ${downloadRes.status}, URI: ${data.logo_url}`);
                }
            } else {
                console.log('[Sync] No logo URL found in API response. Clearing existing logo.');
                await AsyncStorage.removeItem('printer_logo_synced');
            }
            return false;
        } catch (error) {
            console.error('[Sync] Error downloading logo:', error);
            return false;
        }
    }

    async downloadBankQr() {
        try {
            console.log('[Sync] Checking for bank QR...');
            const token = await this.getAuthToken();
            
            const response = await fetch(`${API_BASE_URL}/settings/bank-qr/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                console.warn(`[Sync] Bank QR API returned ${response.status}`);
                return false;
            }

            const data = await response.json();
            if (data.bank_qr_url) {
                console.log(`[Sync] Found Bank QR URL: ${data.bank_qr_url}`);
                
                const fileUri = FileSystem.documentDirectory + 'bank_qr.png';
                
                // Ensure fresh download by deleting existing file first
                try {
                    const existing = await FileSystem.getInfoAsync(fileUri);
                    if (existing.exists) {
                        await FileSystem.deleteAsync(fileUri, { idempotent: true });
                    }
                } catch (e) { console.log('[Sync] Error clearing old bank QR', e); }

                // Download image
                const downloadRes = await FileSystem.downloadAsync(
                    data.bank_qr_url,
                    fileUri
                );

                if (downloadRes.status === 200) {
                    await AsyncStorage.setItem('bank_qr_synced', 'true');
                    console.log(`[Sync] Bank QR downloaded successfully to ${fileUri}`);
                    return true;
                } else {
                    console.warn(`[Sync] Failed to download bank QR image. Status: ${downloadRes.status}`);
                }
            } else {
                console.log('[Sync] No Bank QR URL found in API response. Clearing status.');
                await AsyncStorage.removeItem('bank_qr_synced');
            }
            return false;
        } catch (error) {
            console.error('[Sync] Error downloading bank QR:', error);
            return false;
        }
    }

    async downloadGodownStock() {
        try {
            console.log('[Sync] Downloading Godown Stock...');
            const token = await this.getAuthToken();
            
            // 30s timeout for godown stock
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(`https://tasksas.com/api/accgoddownstock/goddown-stock/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Sync] Godown Stock API returned ${response.status}`);
                return false;
            }

            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
                await dbService.saveGodownStock(data.data);
                console.log(`[Sync] ✅ Downloaded ${data.data.length} godown stock records`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Sync] Error downloading Godown Stock:', error);
            return false;
        }
    }

    // ==================== UPLOAD PENDING DATA ====================
    async uploadPendingData() {
        if (this.isUploading) {
            throw new Error('Upload already in progress');
        }

        this.isUploading = true;

        try {
            const token = await this.getAuthToken();
            const collectionsUploaded = await this.uploadPendingCollections(token);
            const ordersUploaded = await this.uploadPendingOrders(token);

            return {
                success: true,
                collectionsUploaded,
                ordersUploaded,
                message: `Uploaded ${collectionsUploaded} collections and ${ordersUploaded} orders`
            };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        } finally {
            this.isUploading = false;
        }
    }

    async uploadPendingCollections(token) {
        try {
            const pendingCollections = await dbService.getOfflineCollections(false);

            if (pendingCollections.length === 0) return 0;

            let uploaded = 0;
            for (const collection of pendingCollections) {
                try {
                    const response = await fetch(`${API_BASE_URL}/collections/save/`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            customer_code: collection.customer_code,
                            customer_name: collection.customer_name,
                            amount: collection.amount,
                            payment_type: collection.payment_type,
                            cheque_number: collection.cheque_number,
                            remarks: collection.remarks,
                            date: collection.date,
                        }),
                    });

                    if (response.ok) {
                        await dbService.markCollectionAsSynced(collection.local_id);
                        uploaded++;
                    }
                } catch (error) {
                    console.error(`Error uploading collection:`, error);
                }
            }

            return uploaded;
        } catch (error) {
            console.error('Error in uploadPendingCollections:', error);
            return 0;
        }
    }

    async uploadPendingOrders(token) {
        try {
            const pendingOrders = await dbService.getOfflineOrders(false);

            if (pendingOrders.length === 0) return 0;

            let uploaded = 0;
            for (const order of pendingOrders) {
                try {
                    const response = await fetch(`${API_BASE_URL}/orders/save/`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            customer_code: order.customer_code,
                            customer_name: order.customer_name,
                            area: order.area,
                            payment_type: order.payment_type,
                            items: order.items,
                            total_amount: order.total_amount,
                            date: order.date,
                        }),
                    });

                    if (response.ok) {
                        await dbService.markOrderAsSynced(order.local_id);
                        uploaded++;
                    }
                } catch (error) {
                    console.error(`Error uploading order:`, error);
                }
            }

            return uploaded;
        } catch (error) {
            console.error('Error in uploadPendingOrders:', error);
            return 0;
        }
    }

    // ==================== UTILITY ====================
    async getStats() {
        try {
            await dbService.init();
            const stats = await dbService.getDataStats();
            const lastSync = await dbService.getLastSyncTime();

            return {
                ...stats,
                lastSyncTime: lastSync,
                hasData: stats.customers > 0 || stats.products > 0,
                hasPendingUploads: stats.pendingCollections > 0 || stats.pendingOrders > 0
            };
        } catch (error) {
            console.error('Error getting stats:', error);
            return {
                customers: 0,
                products: 0,
                offlineCollections: 0,
                offlineOrders: 0,
                pendingCollections: 0,
                pendingOrders: 0,
                lastSyncTime: null,
                hasData: false,
                hasPendingUploads: false
            };
        }
    }

    async clearAllData() {
        try {
            await dbService.clearAllData();
            console.log('All offline data cleared');
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            return false;
        }
    }

    // Cancel ongoing download
    cancelDownload() {
        if (this.abortController) {
            this.abortController.abort();
            this.isDownloading = false;
        }
    }
}

const syncService = new SyncService();
export default syncService;