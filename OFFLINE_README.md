# TaskPrimeSAS - Offline-First Mobile AppP

React Native mobile application with comprehensive offline functionality using SQLite database.

## 🚀 Quick Start

### First Time Setup
1. Start the app: `npm start`
2. Login with your credentials
3. On Home screen, click **"Download Data"** button
4. Wait for download to complete
5. App is now ready for offline use!

## ✨ Features

### Offline Capabilities
- ✅ **Download all data** (customers, products) to local SQLite database
- ✅ **Work 100% offline** after initial download
- ✅ **Create orders offline** - queued for upload
- ✅ **Create collections offline** - queued for upload
- ✅ **Search and browse** customers/products offline
- ✅ **Auto-sync** pending data when back online

### User Interface
- ✅ **Download button** on Home screen with progress tracking
- ✅ **Offline indicator** shows connection status
- ✅ **Data statistics** display (customer count, product count, pending uploads)
- ✅ **Sync status** with last sync timestamp

## 📁 Project Structure

```
TaskPrimeSAS/
├── src/
│   ├── services/
│   │   ├── database.js       # SQLite database service
│   │   └── syncService.js    # Data sync service
│   └── components/
│       ├── DownloadButton.js # Download/sync UI component
│       └── OfflineIndicator.js # Offline status badge
├── app/
│   ├── (tabs)/
│   │   └── Home.js           # Home screen (updated)
│   ├── Order/
│   │   ├── Entry.js          # Order entry (updated)
│   │   └── OrderDetails.js   # Order details
│   └── Collection/
│       └── AddCollection.js  # Add collection (updated)
```

## 🗄️ Database Schema

SQLite database with 7 tables:
- **customers** - Customer/debtor information
- **products** - Product catalog with pricing
- **offline_collections** - Collections created offline
- **offline_orders** - Orders created offline  
- **customer_ledger** - Cached ledger entries
- **company_info** - Company information
- **sync_metadata** - Sync timestamps and status

## 🔄 How It Works

### Download Process
1. User clicks "Download Data" button
2. Fetches customers from `/api/debtors/get-debtors/`
3. Fetches products from `/api/products/`
4. Saves everything to SQLite database
5. Updates last sync timestamp

### Offline Mode
1. User turns off internet
2. App loads data from SQLite database
3. User creates orders/collections
4. Data saved to local database with `synced=0` flag

### Sync Process
1. User goes back online
2. Click "Sync Now" button
3. Uploads pending collections to `/api/collections/save/`
4. Uploads pending orders to `/api/orders/save/`
5. Marks records as `synced=1`
6. Optionally refreshes data from server

## 📱 Usage Guide

### For Users

**Initial Download:**
```
1. Login → 2. Home Screen → 3. Click "Download Data" → 4. Wait for completion
```

**Working Offline:**
```
1. Turn off internet → 2. Use app normally → 3. Orders/collections queue for upload
```

**Syncing Data:**
```
1. Turn on internet → 2. Home Screen → 3. Click "Sync Now" → 4. Data uploads automatically
```

### For Developers

**Access Database:**
```javascript
import dbService from './src/services/database';

// Get customers
const customers = await dbService.getCustomers('DEBTO');

// Search customers
const results = await dbService.searchCustomers('John');

// Save offline collection
const id = await dbService.saveOfflineCollection({
  customer_code: 'C001',
  amount: 1500.00,
  payment_type: 'cash'
});
```

**Use Sync Service:**
```javascript
import syncService from './src/services/syncService';

// Download all data
const result = await syncService.downloadAllData();

// Upload pending data
const uploadResult = await syncService.uploadPendingData();

// Get statistics
const stats = await syncService.getStats();
```

## 🔧 Configuration

### API Endpoints
Configure in `src/services/syncService.js`:
- Customers: `https://tasksas.com/api/debtors/get-debtors/`
- Products: `https://tasksas.com/api/products/`
- Collections: `https://tasksas.com/api/collections/save/`
- Orders: `https://tasksas.com/api/orders/save/`

### Database
- Database name: `taskprime.db`
- Located in app's local storage
- Can be cleared and re-downloaded anytime

## 📊 Data Flow

```
┌─────────────┐
│   Server    │
│   (APIs)    │
└──────┬──────┘
       │ Download
       ▼
┌─────────────┐
│   SQLite    │
│  Database   │
└──────┬──────┘
       │ Read/Write
       ▼
┌─────────────┐
│   App UI    │
│  (Screens)  │
└──────┬──────┘
       │ User Actions
       ▼
┌─────────────┐
│   Offline   │
│   Queue     │
└──────┬──────┘
       │ Sync
       ▼
┌─────────────┐
│   Server    │
│   (Upload)  │
└─────────────┘
```

## ✅ Implementation Status

- ✅ SQLite database service
- ✅ Sync service with download/upload
- ✅ Download button UI component  
- ✅ Offline indicator badge
- ✅ Home screen integration
- ✅ Order Entry screen (offline)
- ✅ Add Collection screen (offline)
- ⏳ Order Details screen (can be enhanced)
- ⏳ Customer Ledger (can be cached)

## 📝 Notes

- First download required after login
- Large datasets may take time to download
- Pending uploads auto-sync when online
- Clear and re-download anytime from Home screen
- All offline data persists until manually cleared

## 🐛 Troubleshooting

**"No Data" message:**
- Go to Home screen and download data first

**Download fails:**
- Check internet connection
- Verify API endpoints are accessible
- Check auth token is valid

**Sync fails:**
- Check internet connection
- Verify upload API endpoints
- Check pending data in database

## 📞 Support

For issues or questions, check:
- Walkthrough document: `C:\Users\AFIS\.gemini\antigravity\brain\...\walkthrough.md`
- Implementation plan: `C:\Users\AFIS\.gemini\antigravity\brain\...\implementation_plan.md`

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-13
