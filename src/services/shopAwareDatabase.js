// src/services/shopAwareDatabase.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import dbService from './database';

/**
 * Shop-Aware Database Service
 * Wraps the database service to filter data by current shop's client_id
 */
class ShopAwareDatabaseService {
    async getCurrentClientId() {
        try {
            const clientId = await AsyncStorage.getItem('clientId');
            return clientId;
        } catch (error) {
            console.error('[ShopDB] Error getting client ID:', error);
            return null;
        }
    }

    // Customers - filtered by client_id
    async getCustomers(superCode = null) {
        const clientId = await this.getCurrentClientId();
        if (!clientId) {
            console.warn('[ShopDB] No client ID found, returning empty array');
            return [];
        }
        
        // Get all customers and filter by client_id
        const allCustomers = await dbService.getCustomers(superCode);
        const filtered = allCustomers.filter(c => c.client_id === clientId);
        console.log(`[ShopDB] Filtered ${filtered.length} customers for shop ${clientId}`);
        return filtered;
    }

    async searchCustomers(query, superCode = null) {
        const clientId = await this.getCurrentClientId();
        if (!clientId) {
            console.warn('[ShopDB] No client ID found, returning empty array');
            return [];
        }
        
        const allResults = await dbService.searchCustomers(query, superCode);
        return allResults.filter(c => c.client_id === clientId);
    }

    // Pass-through methods that don't need filtering
    async getCustomerByCode(code) {
        return await dbService.getCustomerByCode(code);
    }

    async getProducts() {
        return await dbService.getProducts();
    }

    async getProductByCode(code) {
        return await dbService.getProductByCode(code);
    }

    async getProductByBarcode(barcode) {
        return await dbService.getProductByBarcode(barcode);
    }

    async searchProducts(query) {
        return await dbService.searchProducts(query);
    }

    async getAreas() {
        return await dbService.getAreas();
    }

    async getBatchesByProductCode(productCode) {
        return await dbService.getBatchesByProductCode(productCode);
    }

    async getProductPhotos(productCode) {
        return await dbService.getProductPhotos(productCode);
    }

    async getProductGoddowns(productCode) {
        return await dbService.getProductGoddowns(productCode);
    }

    async getGodownStock() {
        return await dbService.getGodownStock();
    }

    // Offline collections - filtered by username
    async saveOfflineCollection(collection) {
        const username = await AsyncStorage.getItem('username');
        return await dbService.saveOfflineCollection(collection, username);
    }

    async getOfflineCollections(syncedOnly) {
        const username = await AsyncStorage.getItem('username');
        if (!username) return [];
        
        const allCollections = await dbService.getOfflineCollections(syncedOnly);
        // Filter by username
        return allCollections.filter(c => c.username === username);
    }

    async getSavedCollections() {
        return await this.getOfflineCollections(true);
    }

    async markCollectionAsSynced(localId) {
        return await dbService.markCollectionAsSynced(localId);
    }

    async revertCollectionToPending(localId) {
        return await dbService.revertCollectionToPending(localId);
    }

    async updateOfflineCollection(id, collection) {
        return await dbService.updateOfflineCollection(id, collection);
    }

    async deleteCollection(collectionId) {
        return await dbService.deleteCollection(collectionId);
    }

    // Offline orders - filtered by username
    async saveOfflineOrder(order) {
        const username = await AsyncStorage.getItem('username');
        return await dbService.saveOfflineOrder(order, username);
    }

    async getOfflineOrders(syncedOnly = false) {
        const username = await AsyncStorage.getItem('username');
        if (!username) return [];
        
        const allOrders = await dbService.getOfflineOrders(syncedOnly);
        // Filter by username
        return allOrders.filter(o => o.username === username);
    }

    async markOrderAsSynced(localId) {
        return await dbService.markOrderAsSynced(localId);
    }

    // Customer ledger
    async getCustomerLedger(customerCode) {
        return await dbService.getCustomerLedger(customerCode);
    }

    // Utility methods
    async getDataStats() {
        const clientId = await this.getCurrentClientId();
        const username = await AsyncStorage.getItem('username');
        
        if (!clientId || !username) {
            return {
                customers: 0,
                products: 0,
                offlineCollections: 0,
                offlineOrders: 0,
                pendingCollections: 0,
                pendingOrders: 0
            };
        }

        // Get filtered stats
        const customers = await this.getCustomers();
        const collections = await this.getOfflineCollections();
        const orders = await this.getOfflineOrders();
        const pendingCollections = await this.getOfflineCollections(false);
        const pendingOrders = await this.getOfflineOrders(false);

        // Products are shared across shops
        const allStats = await dbService.getDataStats();

        return {
            customers: customers.length,
            products: allStats.products,
            offlineCollections: collections.length,
            offlineOrders: orders.length,
            pendingCollections: pendingCollections.length,
            pendingOrders: pendingOrders.length
        };
    }

    async init() {
        return await dbService.init();
    }

    async getLastSyncTime() {
        return await dbService.getLastSyncTime();
    }

    async setLastSyncTime(timestamp) {
        return await dbService.setLastSyncTime(timestamp);
    }

    // Brand/Category/Department filters
    async getDistinctBrands() {
        return await dbService.getDistinctBrands();
    }

    async getDistinctCategories() {
        return await dbService.getDistinctCategories();
    }

    async getDistinctDepartments() {
        return await dbService.getDistinctDepartments();
    }
}

// Create singleton instance
const shopAwareDbService = new ShopAwareDatabaseService();
export default shopAwareDbService;
