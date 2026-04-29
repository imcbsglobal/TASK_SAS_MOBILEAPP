# Multi-License / Multi-Shop Implementation

## Overview
This implementation adds support for multiple licenses/shops with the ability to switch between them within a 24-hour session without re-login.

## Key Features

### 1. Multiple License Storage
- All activated licenses are stored in AsyncStorage under the key `activatedLicenses` as a JSON array
- Each license contains:
  - `license_key`: The license key
  - `client_id`: Unique client identifier
  - `shop_name`: Display name of the shop (from customer_name)
  - `customer_name`: Company name
  - `modules`: Array of activated modules for this license
  - `isDemo`: Boolean indicating if it's a demo license
  - `expires_at`: Expiration date (for demo licenses)

### 2. License Activation Updates
**File: `src/screens/LicenseActivationScreen.js`**

- Added `addLicenseToStorage()` helper function to manage the licenses array
- When a license is activated, it's automatically added to the `activatedLicenses` array
- Existing licenses are updated if re-activated
- Each license maintains its own modules and settings

### 3. Login Screen Updates
**File: `src/screens/LoginScreen.js`**

#### New Features:
- **Shop Selector Dropdown**: Displays all activated licenses before login
- **Auto-Selection**: If only one license exists, it's auto-selected
- **Last Used Shop**: Remembers and pre-selects the last used shop
- **Shop Information Display**: Shows shop name, client ID, and demo status

#### UI Components:
- Shop selector button with business icon
- Modal picker showing all available shops
- Visual indication of selected shop
- Demo license badge for demo shops

### 4. Home Screen Shop Switcher
**File: `app/(tabs)/Home.js`**

#### New Features:
- **Switch Shop Button**: Appears in header when multiple licenses are available
- **Current Shop Display**: Shows currently active shop name below the date
- **24-Hour Session Check**: Validates session before allowing shop switch
- **Modal Shop Picker**: Full-screen modal to select different shop

#### Functionality:
- Loads all available licenses on mount
- Displays current shop in header
- Switch shop button (swap icon) only shows if multiple licenses exist
- Session validation ensures 24-hour limit is respected
- Automatic data refresh after shop switch

### 5. Data Isolation
Each shop maintains completely separate data:
- Customer lists
- Transactions (orders, sales, returns, collections)
- Punch-in records
- Modules and permissions
- Demo status

When switching shops:
- `clientId` is updated
- `licenseKey` is updated
- `customerName` (shop name) is updated
- `activatedModules` are updated for the new shop
- Demo status is updated if applicable
- App reloads to fetch new shop's data

### 6. Session Management
- Login timestamp is preserved across shop switches
- 24-hour session timer starts from initial login
- Session expiration forces re-login
- Shop switching does NOT reset the 24-hour timer

## User Flow

### First Time Setup:
1. User activates license → License added to `activatedLicenses` array
2. User can activate multiple licenses (each gets added to array)
3. Each license activation stores shop name from API

### Login Flow:
1. User opens app → Login screen loads all activated licenses
2. User selects shop from dropdown (shows shop name)
3. User enters username and password
4. Login validates selected shop's license
5. User is logged in to selected shop

### Shop Switching (Within 24 Hours):
1. User is on Home screen
2. User taps "Switch Shop" button (swap icon)
3. Modal shows all available shops
4. User selects different shop
5. System validates 24-hour session
6. Shop data is switched
7. App reloads with new shop's data
8. User continues working without re-entering password

### Session Expiry:
1. After 24 hours from initial login
2. User attempts to switch shop
3. System detects expired session
4. Alert shown: "Session Expired"
5. User redirected to login screen
6. Must re-enter credentials

## Storage Keys

### Global Keys (Shared):
- `activatedLicenses`: Array of all activated licenses
- `licenseActivated`: Boolean flag
- `deviceId`: Device identifier
- `projectName`: Project name
- `authToken`: Authentication token
- `user`: User object
- `username`: Username
- `loginTimestamp`: Login time for 24-hour session

### Shop-Specific Keys (Changes on Switch):
- `clientId`: Current shop's client ID
- `licenseKey`: Current shop's license key
- `customerName`: Current shop's name
- `activatedModules`: Current shop's modules
- `isDemo`: Current shop's demo status
- `demoExpiresAt`: Current shop's demo expiry

## API Integration

### License Activation API:
- Endpoint: `https://activate.imcbs.com/mobileapp/api/project/tasksas/`
- Returns: Customer data with `customer_name` (used as shop name)
- Each customer has unique `client_id`

### Login API:
- Endpoint: `https://tasksas.com/api/login/`
- Requires: `username`, `password`, `client_id`
- Validates against selected shop's client_id

## Safety Features

1. **Data Isolation**: Each shop's data is completely separate
2. **Session Validation**: 24-hour limit strictly enforced
3. **No Data Loss**: Switching shops preserves all data
4. **Automatic Refresh**: App reloads after switch to ensure clean state
5. **Error Handling**: Graceful fallbacks if switch fails
6. **Visual Feedback**: Loading indicators during switch
7. **Current Shop Display**: Always shows which shop is active

## Testing Checklist

- [ ] Activate multiple licenses
- [ ] Login with shop selection
- [ ] Add license from login screen
- [ ] Verify shop name displays correctly
- [ ] Switch between shops within 24 hours (from Home)
- [ ] Switch between shops within 24 hours (from Dashboard)
- [ ] Verify data isolation (different customers per shop)
- [ ] Test session expiry after 24 hours
- [ ] Verify demo license badge shows correctly
- [ ] Test with only one license (no switch button)
- [ ] Verify modules are shop-specific
- [ ] Test app reload after shop switch
- [ ] Test back button on license activation when adding

## UI Components Added

### Login Screen:
- **Shop Selector**: Dropdown showing all activated licenses with shop names
- **Add License Button**: Dashed border button with "+" icon to add more licenses
- **Shop Picker Modal**: Full-screen modal with list of shops, visual selection

### Home Screen:
- **Current Shop Display**: Shows active shop name below date
- **Switch Shop Button**: Swap icon button (only visible with multiple licenses)
- **Shop Switcher Modal**: Bottom sheet modal with shop list

### Dashboard Screen:
- **Current Shop Display**: Shows active shop name below subtitle
- **Switch Shop Button**: Button with swap icon and "Switch Shop" text
- **Shop Switcher Modal**: Bottom sheet modal with shop list (dark theme)

### License Activation Screen:
- **Back Button**: Appears when adding license from login (not on first activation)
- **Navigation**: Returns to login screen after successful activation

## Notes

- Shop name comes from `customer_name` field in license API
- Client ID is the unique identifier for each shop
- Session timer is NOT reset when switching shops
- All licenses must be activated on the same device
- Remove license feature removes ALL licenses (temporary)
