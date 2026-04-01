import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, NativeModules, PermissionsAndroid, Platform } from "react-native";

// Safe Import Pattern
let BLEPrinter, USBPrinter;
try {
    const printerLib = require("react-native-thermal-receipt-printer");

    // Check if Native Module exists (Prevents crash in Expo Go)
    if (!NativeModules.RNBLEPrinter) {
        throw new Error("Native Module RNBLEPrinter not found");
    }

    BLEPrinter = printerLib.BLEPrinter;
    USBPrinter = printerLib.USBPrinter;
} catch (e) {
    console.warn("Printer library not found or failed to load (Native Module missing?). Using mocks.", e);
    BLEPrinter = {
        init: async () => { console.log("Mock BLE Init"); return Promise.resolve(); },
        getDeviceList: async () => [],
        connectPrinter: async () => { console.log("Mock BLE Connect"); return Promise.resolve(true); },
        printPic: async (base64, options) => { console.log("Mock BLE PrintPic", options); return Promise.resolve(); },
        printBill: async () => { console.log("Mock BLE Print"); return Promise.resolve(); },
    };
    USBPrinter = {
        init: async () => { console.log("Mock USB Init"); return Promise.resolve(); },
        getDeviceList: async () => [],
        connectPrinter: async () => { console.log("Mock USB Connect"); return Promise.resolve(true); },
        printPic: async (base64, options) => { console.log("Mock USB PrintPic", options); return Promise.resolve(); },
        printBill: async () => { console.log("Mock USB Print"); return Promise.resolve(); },
    };
}

class PrinterService {
    constructor() {
        this.connected = false;
        this.currentPrinter = null;
        this.connectionType = 'ble'; // 'ble' | 'usb'
        this.isBLEInitialized = false;
        this.isUSBInitialized = false;

        // Printer Settings
        this.printerWidthMM = 58; // Default 58mm
        this.printerCharsPerLine = 32; // Default for 58mm

        // Cache for company info
        this.companyInfo = null;
        this.lastError = null;
    }

    // Load saved settings
    async loadSettings() {
        try {
            const savedWidth = await AsyncStorage.getItem('printer_paper_width_mm');
            if (savedWidth) {
                this.setPaperWidth(parseInt(savedWidth, 10), false); // false = don't save again
            } else {
                this.setPaperWidth(58, false);
            }
        } catch (error) {
            console.warn("[Printer] Failed to load settings:", error);
        }
    }

    // Load or fetch company info
    async loadCompanyInfo() {
        try {
            // 1. Try memory
            if (this.companyInfo) return this.companyInfo;

            // 2. Try Local Cache
            const cached = await AsyncStorage.getItem('printer_company_info');
            if (cached) {
                this.companyInfo = JSON.parse(cached);
                // Background update if online (optional, but good practice)
                this.fetchCompanyInfoFromAPI();
                return this.companyInfo;
            }

            // 3. Fetch from API
            await this.fetchCompanyInfoFromAPI();
            return this.companyInfo;

        } catch (e) {
            console.warn("[Printer] Failed to load company info", e);
            return null;
        }
    }

    async fetchCompanyInfoFromAPI() {
        try {
            const [token, clientId] = await Promise.all([
                AsyncStorage.getItem('authToken'),
                AsyncStorage.getItem('client_id')
            ]);

            if (!token || !clientId) return;

            const API_URL = 'https://tasksas.com/api/get-misel-data/';
            const res = await fetch(`${API_URL}?client_id=${clientId}`, {
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const json = await res.json();
                let info = null;
                if (Array.isArray(json.data) && json.data.length > 0) {
                    info = json.data[0];
                } else if (typeof json.data === 'object') {
                    info = json.data;
                }

                if (info) {
                    this.companyInfo = info;
                    await AsyncStorage.setItem('printer_company_info', JSON.stringify(info));
                }
            }
        } catch (e) {
            console.warn("[Printer] Background fetch failed:", e);
        }
    }

    // Load Terms & Conditions text for print footer
    async loadTermsAndConditions() {
        try {
            const tc = await AsyncStorage.getItem('printer_terms_conditions');
            return (tc && tc.trim()) ? tc.trim() : null;
        } catch (e) {
            console.warn("[Printer] Failed to load T&C:", e);
            return null;
        }
    }

    // Set paper width (mm) and calculate chars per line
    async setPaperWidth(mm, save = true) {
        this.printerWidthMM = mm;

        if (mm <= 0) mm = 58;

        // Formula: Chars = (mm / 58) * 32
        this.printerCharsPerLine = Math.floor((mm / 58) * 32);

        console.log(`[Printer] Set width to ${mm}mm (${this.printerCharsPerLine} chars/line)`);

        if (save) {
            try {
                await AsyncStorage.setItem('printer_paper_width_mm', String(mm));
            } catch (e) {
                console.error("[Printer] Failed to save setting", e);
            }
        }
    }

    async requestPermissions() {
        if (Platform.OS === "android") {
            try {
                if (Platform.Version >= 31) {
                    const grants = await PermissionsAndroid.requestMultiple([
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    ]);

                    if (
                        grants[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                        grants[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
                    ) {
                        return true;
                    }
                } else {
                    const grants = await PermissionsAndroid.requestMultiple([
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH,
                        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN,
                        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    ]);

                    if (grants[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED) {
                        return true;
                    }
                }
                return true;
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    }

    async init(type = 'ble') {
        try {
            await this.loadSettings();
            this.loadCompanyInfo(); // Fire and forget load/cache

            console.log(`[Printer] Starting initialization for ${type}...`);
            const hasPermissions = await this.requestPermissions();

            if (type === 'ble') {
                if (this.isBLEInitialized) return true;

                if (!hasPermissions) {
                    console.warn("[Printer] BLE Permissions denied.");
                    return false;
                }

                try {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (BLEPrinter && BLEPrinter.init) {
                        try {
                            await BLEPrinter.init();
                            this.isBLEInitialized = true;
                            this.lastError = null;
                            console.log("[Printer] BLE Init Success");
                            return true;
                        } catch (bleErr) {
                            const errMsg = bleErr.message || bleErr || "";
                            this.lastError = errMsg;
                            console.warn("[Printer] BLE Init Failed (Native):", errMsg);
                            return false;
                        }
                    } else {
                        console.warn("[Printer] BLEPrinter module undefined");
                        return false;
                    }
                } catch (err) {
                    console.warn("[Printer] BLE Init Failed:", err);
                    return false;
                }
            } else if (type === 'usb') {
                if (this.isUSBInitialized) return true;

                try {
                    if (USBPrinter && USBPrinter.init) {
                        await USBPrinter.init();
                        this.isUSBInitialized = true;
                        console.log("[Printer] USB Init Success");
                        return true;
                    } else {
                        console.warn("[Printer] USBPrinter module undefined");
                        return false;
                    }
                } catch (err) {
                    console.warn("[Printer] USB Init Failed:", err);
                    return false;
                }
            }
        } catch (error) {
            console.error("[Printer] Init Critical Failure:", error);
            return false;
        }
        return false;
    }

    async getDeviceList(type = 'ble') {
        try {
            const initSuccess = await this.init(type);

            this.connectionType = type;
            if (type === 'ble') {
                if (!initSuccess && !this.isBLEInitialized) {
                    const reason = this.lastError || "Bluetooth might be off";
                    console.warn(`[Printer] Skipping BLE scan - ${reason}`);
                    // Return special error object if it's a known state
                    if (reason.toLowerCase().includes("not enabled")) {
                        return { error: "BLUETOOTH_OFF" };
                    }
                    return [];
                }

                const hasPerm = await this.requestPermissions();
                if (!hasPerm) return { error: "PERMISSIONS_DENIED" };

                try {
                    const devices = BLEPrinter ? await BLEPrinter.getDeviceList() : [];
                    console.log("[Printer] BLE Devices found:", devices);
                    return devices || [];
                } catch (e) {
                    console.warn("[Printer] BLE friendly scan error:", e);
                    return [];
                }
            } else {
                if (!initSuccess && !this.isUSBInitialized) {
                    console.warn("[Printer] Skipping USB scan - not initialized");
                    return [];
                }
                try {
                    const devices = USBPrinter ? await USBPrinter.getDeviceList() : [];
                    console.log("[Printer] USB Devices found:", devices);
                    return devices || [];
                } catch (e) {
                    console.warn("[Printer] USB friendly scan error:", e);
                    return [];
                }
            }
        } catch (err) {
            console.error("[Printer] General Scan error:", err);
            return [];
        }
    }

    async connect(device) {
        try {
            if (!device) return false;
            let printerMac = device.inner_mac_address || device.vendor_id;
            console.log(`[Printer] Connecting to ${this.connectionType}:`, printerMac);

            if (this.connectionType === 'ble') {
                // Defensive check: Re-verify initialization
                if (!this.isBLEInitialized) {
                    const success = await this.init('ble');
                    if (!success) {
                        const reason = this.lastError || "Bluetooth is off";
                        throw new Error(reason);
                    }
                }
                if (BLEPrinter) await BLEPrinter.connectPrinter(printerMac);
            } else {
                if (USBPrinter) await USBPrinter.connectPrinter(device.vendor_id, device.product_id);
            }

            this.connected = true;
            this.currentPrinter = device;
            console.log("[Printer] Connected successfully");
            return true;
        } catch (err) {
            const msg = err.message || err;
            console.warn("[Printer] Connection failed:", msg);
            this.connected = false;
            // Provide more specific error if known
            if (msg.toLowerCase().includes("not enabled")) {
                Alert.alert("Bluetooth Off", "Please turn on Bluetooth in your device settings and try again.");
            }
            return false;
        }
    }

    async printOrder(order) {
        try {
            if (!this.connected) {
                if (this.currentPrinter) {
                    console.log("[Printer] Attempting to reconnect before printing...");
                    const reconnected = await this.connect(this.currentPrinter);
                    if (!reconnected) {
                        Alert.alert("Printer Disconnected", "Please reconnect to your printer.");
                        return false;
                    }
                } else {
                    Alert.alert("Printer not connected", "Please connect to a printer first.");
                    return false;
                }
            }

            // --- LOGO (Patched) ---
            try {
                const isSynced = await AsyncStorage.getItem('printer_logo_synced');
                if (isSynced === 'true') {
                    const logoUri = FileSystem.documentDirectory + 'printer_logo.png';
                    const info = await FileSystem.getInfoAsync(logoUri);
                    if (info.exists) {
                        const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
                        console.log(`[Printer] Attempting logo print (Patched). Path: ${logoUri}`);
                        try {
                            await PrinterInterface.printPic(logoUri);
                        } catch (e) {
                            console.warn("[Printer] Logo print attempt failed:", e);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log(`[Printer] Logo print attempt finished`);
                    }
                }
            } catch (logoErr) { console.warn("[Printer] Logo print error:", logoErr); }

            // Ensure company info is loaded
            await this.loadCompanyInfo();

            const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
            if (!PrinterInterface) {
                Alert.alert("Error", "Printer module not available");
                return false;
            }

            // Use dynamic width
            const PRINTER_WIDTH = this.printerCharsPerLine || 32;

            const centerText = (text) => {
                const safeText = String(text || "");
                if (safeText.length > PRINTER_WIDTH) {
                    return safeText.substring(0, PRINTER_WIDTH) + "\n";
                }
                const pad = Math.max(0, Math.floor((PRINTER_WIDTH - safeText.length) / 2));
                return " ".repeat(pad) + safeText + "\n";
            };

            const line = "-".repeat(PRINTER_WIDTH) + "\n";

            let receipt = "";

            // --- HEADER ---
            // Company Name (Bold)
            const companyName = this.companyInfo?.firm_name || "TaskSAS";
            // ESC/POS Bold On: \x1B\x45\x01, Bold Off: \x1B\x45\x00
            receipt += "\x1B\x45\x01" + centerText(companyName) + "\x1B\x45\x00";

            // Company Address (multiline if needed, for now just join basics)
            if (this.companyInfo) {
                const addressParts = [
                    this.companyInfo.address,
                    this.companyInfo.address1,
                    this.companyInfo.address2,
                    this.companyInfo.address3
                ].filter(Boolean);

                // Print address lines centered
                addressParts.forEach(part => {
                    receipt += centerText(part);
                });

                // Phone numbers
                const phones = [
                    this.companyInfo.phones,
                    this.companyInfo.mobile
                ].filter(Boolean).join(', ');
                if (phones) {
                    receipt += centerText(`Ph: ${phones}`);
                }

                // GST/TIN
                if (this.companyInfo.tinno) {
                    receipt += centerText(`GST/TIN: ${this.companyInfo.tinno}`);
                }
            }

            const receiptTitle = order.receiptTitle || "Order Reciept";
            receipt += centerText(receiptTitle);
            receipt += line;

            // --- META ---
            // Date format: DD/MM/YYYY HH:mm
            const dateObj = new Date(order.timestamp);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

            receipt += `Date: ${formattedDate}\n`;

            // Order ID (API ID or NA)
            const orderId = order.formattedOrderId || (order.isApiOrder ? order.id : "NA");
            receipt += `Order ID: ${orderId}\n`;

            // --- BILL TO SECTION ---
            if (order.customer) {
                receipt += `\nBILL TO:\n`;
                let customerText = String(order.customer);
                let place = order.customerPlace || order.area;

                // Fallback: fetch from database if not present in order
                if (!place && order.customerCode) {
                    try {
                        const dbService = require('./database').default;
                        if (dbService && dbService.db) {
                            const customerParams = await dbService.getCustomerByCode(order.customerCode);
                            if (customerParams) {
                                place = customerParams.place || customerParams.area;
                            }
                        }
                    } catch (e) { console.log('[Printer] Error fetching customer place', e); }
                }

                receipt += "\x1B\x45\x01" + `${customerText}\n` + "\x1B\x45\x00"; // Bold customer name

                if (place) {
                    receipt += `Place: ${place}\n`;
                }

                // Customer address if available
                if (order.customerAddress) {
                    receipt += `${order.customerAddress}\n`;
                }

                // Customer phone  
                if (order.customerPhone) {
                    receipt += `Ph: ${order.customerPhone}\n`;
                }
            }


            // --- ITEMS ---
            const qtyLen = 4;
            const rateLen = 7;
            const totalLen = 8;
            const separators = 2; // spaces between columns
            const itemLen = Math.max(5, PRINTER_WIDTH - qtyLen - rateLen - totalLen - separators);

            const headerItem = "Item".padEnd(itemLen, " ");
            const headerQty  = "Qty".padStart(qtyLen, " ");
            const headerRate = "Rate".padStart(rateLen, " ");
            const headerTotal = "Total".padStart(totalLen, " ");
            receipt += `${headerItem} ${headerQty} ${headerRate} ${headerTotal}\n`;

            receipt += line;

            let totalAmount = 0;
            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const price = Number(item.price) || 0;
                    const qty = Number(item.qty) || 0;
                    const itemTotal = price * qty;
                    totalAmount += itemTotal;

                    const name     = String(item.name || "Item").substring(0, itemLen).padEnd(itemLen, " ");
                    const qtyStr   = qty.toFixed(2).padStart(qtyLen, " ");
                    const rateStr  = price.toFixed(2).padStart(rateLen, " ");
                    const totalStr = itemTotal.toFixed(2).padStart(totalLen, " ");

                    receipt += `${name} ${qtyStr} ${rateStr} ${totalStr}\n`;
                });
            }

            receipt += line;

            // --- TOTAL ---
            const totalLabel = "TOTAL:";
            const totalVal = totalAmount.toFixed(2);
            const totalPad = PRINTER_WIDTH - totalLabel.length - totalVal.length - 1;
            receipt += `${" ".repeat(Math.max(0, totalPad))}${totalLabel} ${totalVal}\n`;

            receipt += line;
            receipt += centerText("Thank You!");

            // Status Code (S/F)
            if (order.printStatus || order.description) {
                const status = order.printStatus || order.description;
                receipt += centerText(`Status: ${status}`);
            }
            receipt += "\n";

            // --- TERMS & CONDITIONS ---
            const tcText1 = await this.loadTermsAndConditions();
            if (tcText1) {
                receipt += line;
                // Wrap T&C text to PRINTER_WIDTH
                const words1 = tcText1.split(' ');
                let currentLine1 = '';
                words1.forEach(word => {
                    if ((currentLine1 + word).length > PRINTER_WIDTH) {
                        receipt += currentLine1.trim() + '\n';
                        currentLine1 = word + ' ';
                    } else {
                        currentLine1 += word + ' ';
                    }
                });
                if (currentLine1.trim()) receipt += currentLine1.trim() + '\n';
                receipt += '\n';
            }

            console.log("[Printer] Form1 sending to printer, receipt length:", receipt.length);
            await PrinterInterface.printBill(receipt);
            return true;

        } catch (err) {
            console.error("[Printer] Print failed:", err);
            Alert.alert("Print Error", "Failed to send data to printer. Please check connection.");
            this.connected = false;
            return false;
        }
    }

    async printOrderForm2(order) {
        try {
            if (!this.connected) {
                if (this.currentPrinter) {
                    console.log("[Printer] Attempting to reconnect before printing...");
                    const reconnected = await this.connect(this.currentPrinter);
                    if (!reconnected) {
                        Alert.alert("Printer Disconnected", "Please reconnect to your printer.");
                        return false;
                    }
                } else {
                    Alert.alert("Printer not connected", "Please connect to a printer first.");
                    return false;
                }
            }

            // --- LOGO (Patched) ---
            try {
                const isSynced = await AsyncStorage.getItem('printer_logo_synced');
                if (isSynced === 'true') {
                    const logoUri = FileSystem.documentDirectory + 'printer_logo.png';
                    const info = await FileSystem.getInfoAsync(logoUri);
                    if (info.exists) {
                        const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
                        console.log(`[Printer] Attempting logo print (Patched). Path: ${logoUri}`);
                        try {
                            await PrinterInterface.printPic(logoUri);
                        } catch (e) {
                            console.warn("[Printer] Logo print attempt failed:", e);
                        }
                        await new Promise(resolve => setTimeout(resolve, 800));
                        console.log(`[Printer] Logo print attempt finished`);
                    }
                }
            } catch (logoErr) { console.warn("[Printer] Logo print error:", logoErr); }

            // Ensure company info is loaded (same as printOrder - do NOT call loadSettings here)
            await this.loadCompanyInfo();

            const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
            if (!PrinterInterface) {
                Alert.alert("Error", "Printer module not available");
                return false;
            }

            // Optimized for 4-inch printers (default to 64 chars if not specified)
            const PRINTER_WIDTH = this.printerCharsPerLine || 64; 
            const LEFT_PAD = "  "; // Left margin
            const ESC_BOLD_ON = "\x1B\x45\x01";
            const ESC_BOLD_OFF = "\x1B\x45\x00";
            const ESC_SIZE_LARGE = "\x1B\x21\x18"; // Bold + Double height
            const ESC_SIZE_NORMAL = "\x1B\x21\x00";

            const centerText = (text, isBold = false) => {
                const safeText = String(text || "");
                const pad = Math.max(0, Math.floor((PRINTER_WIDTH - LEFT_PAD.length - safeText.length) / 2));
                let lineText = LEFT_PAD + " ".repeat(pad) + safeText;
                if (isBold) {
                    return ESC_BOLD_ON + lineText + ESC_BOLD_OFF + "\n";
                }
                return lineText + "\n";
            };

            const line = LEFT_PAD + "-".repeat(PRINTER_WIDTH - LEFT_PAD.length) + "\n";

            let receipt = "";

            // --- HEADER ---
            // Firm name: Bold and Larger
            const companyName = this.companyInfo?.firm_name || "TaskSAS";
            receipt += ESC_SIZE_LARGE + centerText(companyName) + ESC_SIZE_NORMAL;

            if (this.companyInfo) {
                const addressParts = [
                    this.companyInfo.address,
                    this.companyInfo.address1,
                    this.companyInfo.address2,
                    this.companyInfo.address3
                ].filter(Boolean);
                addressParts.forEach(part => { receipt += centerText(part); });

                const phones = [this.companyInfo.phones, this.companyInfo.mobile].filter(Boolean).join(', ');
                if (phones) receipt += centerText(`Ph: ${phones}`);

                // GST/TIN from misel API
                if (this.companyInfo.tinno) {
                    receipt += centerText(`GST/TIN: ${this.companyInfo.tinno}`);
                }
            }

            receipt += line;

            // --- RECEIPT TITLE ---
            let receiptTitle = String(order.receiptTitle || order.type || "Receipt").toUpperCase();
            if (receiptTitle.includes("SALES")) receiptTitle = " INVOICE";
            else if (receiptTitle.includes("ORDER")) receiptTitle = "ORDER ";
            else if (receiptTitle.includes("RETURN")) receiptTitle = "CREDIT NOTE";

            receipt += ESC_SIZE_LARGE + centerText(receiptTitle) + ESC_SIZE_NORMAL;
            receipt += line;

            // --- META INFO ---
            const dateObj = new Date(order.timestamp);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

            const metaLeft1 = `Inv Date: ${formattedDate}`;
            const orderId = order.formattedOrderId || (order.isApiOrder ? order.id : "NA");
            const metaLeft2 = `Inv No: ${orderId}`;
            const paymentType = order.payment || order.type || "Cash";
            const metaLeft3 = `Type: ${paymentType}`;

            const salesmanName = order.salesman || order.salesmanName || order.username || "";
            const metaRight1 = salesmanName ? `Salesman: ${salesmanName}` : "";

            const printMetaLine = (left, right) => {
                const contentWidth = PRINTER_WIDTH - LEFT_PAD.length;
                if (!right) return `${LEFT_PAD}${left}\n`;
                const available = contentWidth - left.length - right.length;
                if (available >= 1) {
                    return `${LEFT_PAD}${left}${" ".repeat(available)}${right}\n`;
                }
                return `${LEFT_PAD}${left}\n${LEFT_PAD}${right}\n`;
            };

            receipt += printMetaLine(metaLeft1, "");
            receipt += printMetaLine(metaLeft2, ""); // Inv No only
            receipt += printMetaLine(metaLeft3, ""); // Type only
            if (metaRight1) {
                receipt += `${LEFT_PAD}${metaRight1}\n`;
            }
            receipt += "\n"; 

            // Customer
            let previousBalance = null;
            if (order.customer) {
                let customerText = String(order.customer);
                let place = order.customerPlace || order.area;

                if (order.customerCode) {
                    try {
                        const dbService = require('./database').default;
                        if (dbService && dbService.db) {
                            const customerParams = await dbService.getCustomerByCode(order.customerCode);
                            if (customerParams) {
                                if (!place) place = customerParams.place || customerParams.area;
                                previousBalance = customerParams.balance;
                            }
                        }
                    } catch (e) { console.log('[Printer] Error fetching customer info', e); }
                }

                // Force single line for customer name
                const maxCustLen = PRINTER_WIDTH - LEFT_PAD.length - 10;
                receipt += LEFT_PAD + "Customer: " + ESC_BOLD_ON + customerText.substring(0, maxCustLen) + ESC_BOLD_OFF + "\n";
                if (place) {
                    receipt += `${LEFT_PAD}Place : ${place}\n`;
                }
            }

            receipt += line;

            // --- ITEMS TABLE ---
            // NO | ITEM NAME | QTY | PRICE | TOTAL
            // Dynamic column widths based on printer width
            // Use PRINTER_WIDTH-2 as effective content width to give 2-char safety margin
            // (some printers physically fit 2 fewer chars than the formula predicts)
            let noLen = 2;
            let qtyLen = 6;
            let priceLen = 8;
            let totalLen = 9;
            const separators = 4;
            const CONTENT_WIDTH = PRINTER_WIDTH >= 44 ? PRINTER_WIDTH - 2 : PRINTER_WIDTH;

            if (PRINTER_WIDTH >= 60) {
                // Wide printer (4 inch+) - give them more space
                noLen = 4;
                qtyLen = 10;
                priceLen = 12;
                totalLen = 12;
            } else if (PRINTER_WIDTH >= 44) {
                // Medium printer (3 inch)
                noLen = 3;
                qtyLen = 8;
                priceLen = 9;
                totalLen = 10;
            }

            const itemLen = Math.max(8, CONTENT_WIDTH - LEFT_PAD.length - noLen - qtyLen - priceLen - totalLen - separators);

            const hdrNo = "NO".padEnd(noLen, " ");
            const hdrItem = "ITEM NAME".padEnd(itemLen, " ");
            const hdrQty = "QTY".padStart(qtyLen, " ");
            const hdrPrice = "PRICE".padStart(priceLen, " ");
            const hdrTotal = "TOTAL".padStart(totalLen, " ");

            receipt += LEFT_PAD + ESC_BOLD_ON + `${hdrNo} ${hdrItem} ${hdrQty} ${hdrPrice} ${hdrTotal}` + ESC_BOLD_OFF + "\n";
            receipt += line;

            let totalAmount = 0;
            let rowNo = 1;

            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const price = Number(item.price) || 0;
                    const qty = Number(item.qty) || 0;
                    const itemTotal = price * qty;
                    totalAmount += itemTotal;

                    const noStr = String(rowNo).padEnd(noLen, " ");
                    const name = String(item.name || "Item").substring(0, itemLen).padEnd(itemLen, " ");
                    const qtyStr = qty.toFixed(2).padStart(qtyLen, " ");
                    const priceStr = price.toFixed(2).padStart(priceLen, " ");
                    const totalStr = itemTotal.toFixed(2).padStart(totalLen, " ");

                    receipt += LEFT_PAD + `${noStr} ${name} ` + ESC_BOLD_ON + `${qtyStr} ${priceStr} ${totalStr}` + ESC_BOLD_OFF + "\n";

                    // Continuation line for long names
                    const fullName = String(item.name || "");
                    if (fullName.length > itemLen) {
                        const remainder = fullName.substring(itemLen);
                        receipt += `${LEFT_PAD}${"".padEnd(noLen + 1)}${remainder.substring(0, itemLen)}\n`;
                    }

                    // Barcode and Item Code Details
                    const itemCode = item.code || item.item_code || "";
                    const barcode = item.barcode || "";
                    if (itemCode || barcode) {
                        const codeLine = `Code: ${itemCode} Bar: ${barcode}`;
                        if (LEFT_PAD.length + noLen + 1 + codeLine.length <= PRINTER_WIDTH) {
                            receipt += `${LEFT_PAD}${"".padEnd(noLen + 1)}${codeLine}\n`;
                        } else {
                            receipt += `${LEFT_PAD}${"".padEnd(noLen + 1)}Code: ${itemCode}\n`;
                            if (barcode) receipt += `${LEFT_PAD}${"".padEnd(noLen + 1)}Bar: ${barcode}\n`;
                        }
                    }

                    receipt += "\n"; // Space between products
                    rowNo++;
                });
            }

            receipt += line;

            // --- TOTAL ---
            const totalLabel = "TOTAL:";
            const totalVal = totalAmount.toFixed(2);
            // Use CONTENT_WIDTH-LEFT_PAD.length to prevent right-edge clipping
            const totalLineWidth = CONTENT_WIDTH - LEFT_PAD.length;
            const totalPadSize = Math.max(0, totalLineWidth - totalLabel.length - totalVal.length - 1);
            receipt += LEFT_PAD + ESC_SIZE_LARGE + " ".repeat(totalPadSize) + totalLabel + " " + totalVal + ESC_SIZE_NORMAL + "\n";

            receipt += line;
            receipt += centerText("Thank You!");
            receipt += "\n";

            // Previous Balance at the bottom, ONLY if not Return
            const isReturn = (order.type === 'Return') || (receiptTitle.includes("RETURN"));
            if (!isReturn && previousBalance !== null && previousBalance !== undefined && !isNaN(Number(previousBalance))) {
                const balLabel = "PREVIOUS BALANCE:";
                const balVal = Number(previousBalance).toFixed(2);
                receipt += `${LEFT_PAD}${ESC_BOLD_ON}${balLabel} ${balVal}${ESC_BOLD_OFF}\n`;
            }

            // --- TERMS & CONDITIONS ---
            const tcText2 = await this.loadTermsAndConditions();
            if (tcText2) {
                receipt += line;
                const words2 = tcText2.split(' ');
                let currentLine2 = '';
                words2.forEach(word => {
                    if ((currentLine2 + word).length > (CONTENT_WIDTH - LEFT_PAD.length)) {
                        receipt += LEFT_PAD + currentLine2.trim() + '\n';
                        currentLine2 = word + ' ';
                    } else {
                        currentLine2 += word + ' ';
                    }
                });
                if (currentLine2.trim()) receipt += LEFT_PAD + currentLine2.trim() + '\n';
                receipt += '\n';
            }

            console.log("[Printer] Form2 sending to printer, receipt length:", receipt.length);
            if (PrinterInterface.printText) {
                await PrinterInterface.printText(receipt);
            } else {
                await PrinterInterface.printBill(receipt);
            }
            console.log("[Printer] Form2 print done");
            return true;

        } catch (err) {
            console.error("[Printer] Form2 Print failed:", err);
            Alert.alert("Print Error", "Failed to send data to printer. Please check connection.");
            this.connected = false;
            return false;
        }
    }

    async printOrderForm3(order) {
        try {
            if (!this.connected) {
                if (this.currentPrinter) {
                    console.log("[Printer] Attempting to reconnect before printing...");
                    const reconnected = await this.connect(this.currentPrinter);
                    if (!reconnected) {
                        Alert.alert("Printer Disconnected", "Please reconnect to your printer.");
                        return false;
                    }
                } else {
                    Alert.alert("Printer not connected", "Please connect to a printer first.");
                    return false;
                }
            }

            // --- LOGO (Patched) ---
            try {
                const isSynced = await AsyncStorage.getItem('printer_logo_synced');
                if (isSynced === 'true') {
                    const logoUri = FileSystem.documentDirectory + 'printer_logo.png';
                    const info = await FileSystem.getInfoAsync(logoUri);
                    if (info.exists) {
                        const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
                        console.log(`[Printer] Attempting logo print (Patched). Path: ${logoUri}`);
                        try {
                            await PrinterInterface.printPic(logoUri);
                        } catch (e) {
                            console.warn("[Printer] Logo print attempt failed:", e);
                        }
                        await new Promise(resolve => setTimeout(resolve, 800));
                        console.log(`[Printer] Logo print attempt finished`);
                    }
                }
            } catch (logoErr) { console.warn("[Printer] Logo print error:", logoErr); }

            // Ensure company info is loaded
            await this.loadCompanyInfo();
            const taxSetting = await AsyncStorage.getItem('settings_tax_code') || 'no_tax';

            const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
            if (!PrinterInterface) {
                Alert.alert("Error", "Printer module not available");
                return false;
            }

            const PRINTER_WIDTH = this.printerCharsPerLine || 32;
            const ESC_BOLD_ON = "\x1B\x45\x01";
            const ESC_BOLD_OFF = "\x1B\x45\x00";
            const ESC_SIZE_LARGE = "\x1B\x21\x18";
            const ESC_SIZE_NORMAL = "\x1B\x21\x00";

            const centerText = (text, isBold = false) => {
                const safeText = String(text || "");
                const pad = Math.max(0, Math.floor((PRINTER_WIDTH - safeText.length) / 2));
                let lineText = " ".repeat(pad) + safeText;
                if (isBold) {
                    return ESC_BOLD_ON + lineText + ESC_BOLD_OFF + "\n";
                }
                return lineText + "\n";
            };

            const line = "-".repeat(PRINTER_WIDTH) + "\n";

            let receipt = "";

            // --- HEADER ---
            // Firm name: Bold and Larger
            const companyName = this.companyInfo?.firm_name || "TaskSAS";
            receipt += ESC_SIZE_LARGE + centerText(companyName) + ESC_SIZE_NORMAL;

            if (this.companyInfo) {
                const addressParts = [
                    this.companyInfo.address,
                    this.companyInfo.address1,
                    this.companyInfo.address2,
                    this.companyInfo.address3
                ].filter(Boolean);
                addressParts.forEach(part => { receipt += centerText(part); });

                const phones = [this.companyInfo.phones, this.companyInfo.mobile].filter(Boolean).join(', ');
                if (phones) receipt += centerText(`Ph: ${phones}`);

                // GST/TIN from misel API
                if (this.companyInfo.tinno) {
                    receipt += centerText(`GST/TIN: ${this.companyInfo.tinno}`);
                }
            }

            receipt += line;

            // --- RECEIPT TITLE ---
            let receiptTitle = String(order.receiptTitle || order.type || "Receipt").toUpperCase();
            if (receiptTitle.includes("SALES")) receiptTitle = " INVOICE";
            else if (receiptTitle.includes("ORDER")) receiptTitle = "ORDER";
            else if (receiptTitle.includes("RETURN")) receiptTitle = "CREDIT NOTE";

            receipt += ESC_SIZE_LARGE + centerText(receiptTitle) + ESC_SIZE_NORMAL;
            receipt += line;

            // --- META INFO ---
            const dateObj = new Date(order.timestamp);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

            const metaLeft1 = `Inv Date: ${formattedDate}`;
            const orderId = order.formattedOrderId || (order.isApiOrder ? order.id : "NA");
            const metaLeft2 = `Inv No  : ${orderId}`;
            const paymentType = order.payment || order.type || "Cash";
            const metaLeft3 = `Type    : ${paymentType}`;

            const salesmanName = order.salesman || order.salesmanName || order.username || "";
            const metaRight1 = salesmanName ? `Salesman: ${salesmanName}` : "";

            const printMetaLine = (left, right) => {
                if (!right) return `${left}\n`;
                const available = PRINTER_WIDTH - left.length - right.length;
                if (available >= 1) {
                    return `${left}${" ".repeat(available)}${right}\n`;
                }
                return `${left}\n${right}\n`;
            };

            receipt += printMetaLine(metaLeft1, "");
            receipt += printMetaLine(metaLeft2, ""); // Inv No only
            receipt += printMetaLine(metaLeft3, ""); // Type only
            if (metaRight1) {
                receipt += `${metaRight1}\n`;
            }

            // Customer
            let previousBalance = null;
            if (order.customer) {
                let customerText = String(order.customer);
                let place = order.customerPlace || order.area;

                if (order.customerCode) {
                    try {
                        const dbService = require('./database').default;
                        if (dbService && dbService.db) {
                            const customerParams = await dbService.getCustomerByCode(order.customerCode);
                            if (customerParams) {
                                if (!place) place = customerParams.place || customerParams.area;
                                previousBalance = customerParams.balance;
                            }
                        }
                    } catch (e) { console.log('[Printer] Error fetching customer info', e); }
                }

                receipt += "\n";
                // Force single line for customer name
                const maxCustLenF3 = PRINTER_WIDTH - 10;
                receipt += "Customer: " + ESC_BOLD_ON + customerText.substring(0, Math.max(0, maxCustLenF3)) + ESC_BOLD_OFF + "\n";
                if (place) {
                    receipt += `Place : ${place}\n`;
                }
            }

            receipt += line;

            // --- ITEMS TABLE ---
            // Line 1: NO + ITEM NAME
            // Line 2: HSN | TAX%  QTY  PRICE  TOTAL (all on one line, right-aligned)
            const noLen = 2;
            const qtyLen = 6;
            const priceLen = 8;
            const totalLen = 8;
            // Use PRINTER_WIDTH-2 safety margin for row calculations
            const CONTENT_WIDTH_F3 = PRINTER_WIDTH >= 32 ? PRINTER_WIDTH - 2 : PRINTER_WIDTH;

            const hdrNo = "NO".padEnd(noLen, " ");
            const hdrItem = "ITEM NAME";

            receipt += ESC_BOLD_ON + `${hdrNo} ${hdrItem}` + ESC_BOLD_OFF + "\n";
            // Second header line: HSN | TAX   QTY   PRICE   TOTAL
            const hdrQty   = "QTY".padStart(qtyLen, " ");
            const hdrPrice = "PRICE".padStart(priceLen, " ");
            const hdrTotal = "TOTAL".padStart(totalLen, " ");
            // Fixed HSN + Tax header prefix — same width as used in data rows
            const hsnTaxHdrLen = 14; // e.g. "HSN:XXXX T:18%"
            const spacer2ndLine = " ".repeat(Math.max(0, CONTENT_WIDTH_F3 - hsnTaxHdrLen - qtyLen - priceLen - totalLen - 3));
            receipt += ESC_BOLD_ON + `${spacer2ndLine}${'HSN'.padEnd(6)}${'TAX%'.padStart(8)} ${hdrQty} ${hdrPrice} ${hdrTotal}` + ESC_BOLD_OFF + "\n";

            receipt += line;

            let totalAmount = 0; // Net Total
            let totalTaxable = 0;
            let totalTaxAmount = 0;
            let totalQty = 0;
            let rowNo = 1;

            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    let rate = Number(item.price) || 0;
                    let qty = Number(item.qty) || 0;
                    let taxPercent = Number(item.gst || item.tax || item.taxcode || 0);
                    const hsnVal = item.hsn || item.text6 || '-';
                    const taxStr = taxPercent > 0 ? `${taxPercent}%` : '-';

                    let displayPrice = rate;
                    let displayTotal = 0;
                    let itemTaxable = 0;
                    let itemTax = 0;

                    if (taxSetting === 'plus_tax') {
                        // User wants total column to be taxable only (no tax added yet)
                        displayTotal = rate * qty;
                        itemTaxable = displayTotal;
                        itemTax = displayTotal * (taxPercent / 100);
                    } else if (taxSetting === 'reverse_tax') {
                        displayTotal = rate * qty; // Total inclusive of tax
                        itemTaxable = displayTotal / (1 + (taxPercent / 100));
                        itemTax = displayTotal - itemTaxable;
                    } else {
                        displayTotal = rate * qty;
                        itemTaxable = displayTotal;
                        itemTax = 0;
                    }

                    totalTaxable += itemTaxable;
                    if (typeof totalTaxAmount === 'undefined') totalTaxAmount = 0;
                    totalTaxAmount += itemTax;
                    totalAmount += (itemTaxable + itemTax); // Net Total
                    totalQty += qty;

                    const noStr = String(rowNo).padEnd(noLen, " ");
                    const name = String(item.name || "Item");

                    // Line 1: NO + Item Name
                    receipt += ESC_BOLD_ON + `${noStr} ${name}` + ESC_BOLD_OFF + "\n";

                    // Line 2: HSN:xx Tax:x%  QTY  PRICE  TOTAL — all in one line
                    const qtyStr   = qty.toFixed(2).padStart(qtyLen, " ");
                    const priceStr = displayPrice.toFixed(2).padStart(priceLen, " ");
                    const totalStr = displayTotal.toFixed(2).padStart(totalLen, " ");

                    // HSN+Tax prefix occupies fixed space, with remaining spacer
                    const hsnPart = `HSN:${hsnVal}`.padEnd(10);
                    const taxPart = `${taxStr}`.padStart(4);
                    const hsnTaxPrefix = `${hsnPart}${taxPart}`;
                    const valueSpacer = " ".repeat(Math.max(0, CONTENT_WIDTH_F3 - hsnTaxPrefix.length - qtyLen - priceLen - totalLen - 3));

                    receipt += `${valueSpacer}${hsnTaxPrefix} ${qtyStr} ${priceStr} ${totalStr}\n`;

                    rowNo++;
                });
            }

            receipt += line;

            // --- SUMMARY SECTION ---
            const totalQtyVal = totalQty.toFixed(2);
            const hsnTaxPrefixLen = 14; 
            const qtyLen_F3 = 6;
            const priceLen_F3 = 8;
            const totalLen_F3 = 8;
            const prefixOffset = Math.max(0, CONTENT_WIDTH_F3 - hsnTaxPrefixLen - qtyLen_F3 - priceLen_F3 - totalLen_F3 - 3) + hsnTaxPrefixLen + 1;
            
            const qtyLabel = "TOTAL QTY:";
            const paddedQty = totalQtyVal.padStart(qtyLen_F3, " ");
            if (qtyLabel.length <= prefixOffset) {
                receipt += qtyLabel.padEnd(prefixOffset, " ") + paddedQty + "\n";
            } else {
                receipt += qtyLabel + "\n" + " ".repeat(prefixOffset) + paddedQty + "\n";
            }

            if (taxSetting === 'reverse_tax' || taxSetting === 'plus_tax') {
                const taxableVal = totalTaxable.toFixed(2);
                const taxVal = totalTaxAmount.toFixed(2);
                const netTotalVal = totalAmount.toFixed(2);

                const taxableLabel = "TAXABLE:";
                const taxLabel = "TAX:";
                const netTotalLabel = taxSetting === 'plus_tax' ? "NET TOTAL:" : "TOTAL:";

                receipt += " ".repeat(Math.max(0, CONTENT_WIDTH_F3 - taxableLabel.length - taxableVal.length - 1)) + `${taxableLabel} ` + taxableVal + "\n";
                receipt += " ".repeat(Math.max(0, CONTENT_WIDTH_F3 - taxLabel.length - taxVal.length - 1)) + `${taxLabel} ` + taxVal + "\n";
                const netTotalPad = Math.max(0, CONTENT_WIDTH_F3 - netTotalLabel.length - netTotalVal.length - 1);
                receipt += ESC_SIZE_LARGE + " ".repeat(netTotalPad) + netTotalLabel + " " + netTotalVal + ESC_SIZE_NORMAL + "\n";
            } else {
                // --- TOTAL only (no_tax or other) ---
                const totalPad_F3 = Math.max(0, CONTENT_WIDTH_F3 - totalLabel.length - totalVal.length - 1);
                receipt += ESC_SIZE_LARGE + " ".repeat(totalPad_F3) + totalLabel + " " + totalVal + ESC_SIZE_NORMAL + "\n";
            }

            receipt += line;
            receipt += centerText("Thank You!");
            receipt += "\n";

            // Previous Balance at the bottom, ONLY if not Return
            const isReturn = (order.type === 'Return') || (receiptTitle.includes("RETURN"));
            if (!isReturn && previousBalance !== null && previousBalance !== undefined && !isNaN(Number(previousBalance))) {
                const balLabel = "PREVIOUS BALANCE:";
                const balVal = Number(previousBalance).toFixed(2);
                receipt += `${ESC_BOLD_ON}${balLabel} ${balVal}${ESC_BOLD_OFF}\n`;
            }



            // --- TERMS & CONDITIONS ---
            const tcText3 = await this.loadTermsAndConditions();
            if (tcText3) {
                receipt += line;
                const words3 = tcText3.split(' ');
                let currentLine3 = '';
                words3.forEach(word => {
                    if ((currentLine3 + word).length > CONTENT_WIDTH_F3) {
                        receipt += currentLine3.trim() + '\n';
                        currentLine3 = word + ' ';
                    } else {
                        currentLine3 += word + ' ';
                    }
                });
                if (currentLine3.trim()) receipt += currentLine3.trim() + '\n';
                receipt += '\n';
            }

            console.log("[Printer] Form3 sending to printer, receipt length:", receipt.length);
            if (PrinterInterface.printText) {
                await PrinterInterface.printText(receipt);
            } else {
                await PrinterInterface.printBill(receipt);
            }
            console.log("[Printer] Form3 print done");
            return true;

        } catch (err) {
            console.error("[Printer] Form3 Print failed:", err);
            Alert.alert("Print Error", "Failed to send data to printer. Please check connection.");
            this.connected = false;
            return false;
        }
    }

    async printCollectionReceipt(collection) {
        try {
            if (!this.connected) {
                if (this.currentPrinter) {
                    console.log("[Printer] Attempting to reconnect before printing...");
                    const reconnected = await this.connect(this.currentPrinter);
                    if (!reconnected) {
                        Alert.alert("Printer Disconnected", "Please reconnect to your printer.");
                        return false;
                    }
                } else {
                    Alert.alert("Printer not connected", "Please connect to a printer first.");
                    return false;
                }
            }

            // --- LOGO (Patched) ---
            try {
                const isSynced = await AsyncStorage.getItem('printer_logo_synced');
                if (isSynced === 'true') {
                    const logoUri = FileSystem.documentDirectory + 'printer_logo.png';
                    const info = await FileSystem.getInfoAsync(logoUri);
                    if (info.exists) {
                        const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
                        console.log(`[Printer] Attempting logo print (Patched). Path: ${logoUri}`);
                        try {
                            await PrinterInterface.printPic(logoUri);
                        } catch (e) {
                            console.warn("[Printer] Logo print attempt failed:", e);
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                        console.log(`[Printer] Logo print attempt finished`);
                    }
                }
            } catch (logoErr) { console.warn("[Printer] Logo print error:", logoErr); }

            // Ensure settings and company info are loaded
            await this.loadSettings();
            await this.loadCompanyInfo();

            const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
            if (!PrinterInterface) {
                Alert.alert("Error", "Printer module failing to load");
                return false;
            }

            const PRINTER_WIDTH = this.printerCharsPerLine || 32;

            const centerText = (text) => {
                const safeText = String(text || "");
                if (safeText.length > PRINTER_WIDTH) {
                    return safeText.substring(0, PRINTER_WIDTH) + "\n";
                }
                const pad = Math.max(0, Math.floor((PRINTER_WIDTH - safeText.length) / 2));
                return " ".repeat(pad) + safeText + "\n";
            };

            const line = "-".repeat(PRINTER_WIDTH) + "\n";

            let receipt = "";

            // --- HEADER ---
            const companyName = this.companyInfo?.firm_name || "Company Name";
            receipt += "\x1B\x45\x01" + centerText(companyName) + "\x1B\x45\x00";

            if (this.companyInfo) {
                const addressParts = [
                    this.companyInfo.address,
                    this.companyInfo.address1,
                    this.companyInfo.address2,
                    this.companyInfo.address3
                ].filter(Boolean);
                addressParts.forEach(part => {
                    receipt += centerText(part);
                });

                // Phone numbers
                const phones = [
                    this.companyInfo.phones,
                    this.companyInfo.mobile
                ].filter(Boolean).join(', ');
                if (phones) {
                    receipt += centerText(`Ph: ${phones}`);
                }

                // GST/TIN
                if (this.companyInfo.tinno) {
                    receipt += centerText(`GST/TIN: ${this.companyInfo.tinno}`);
                }
            }

            receipt += "\n";
            receipt += centerText("Receipt Voucher");
            receipt += line;

            // --- VOUCHER INFO ---
            const dateObj = new Date(collection.date);
            const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            // Split into two lines for safety on 2 inch paper
            const voucherNo = collection.code || collection.local_id || collection.id || "N/A";
            receipt += `V No: ${voucherNo}\n`;
            receipt += `Date: ${formattedDate}\n`;

            receipt += line;

            // --- TABLE HEADER ---
            // Width: 32 chars
            // "Sl  Particulars           Amount"
            // 2   18                    12
            receipt += `Sl  Particulars           Amount\n`;
            receipt += line;

            // --- TABLE ROW ---
            const customerName = collection.customer_name || "Customer";
            const place = collection.place || collection.area || "";

            const amount = parseFloat(collection.amount || 0).toFixed(2);
            const chequeRef = collection.cheque_number || collection.ref_no || "";
            const paymentType = collection.payment_type || "CASH";
            const refDetail = chequeRef ? `(${chequeRef})` : `(${paymentType})`;

            // Line 1: Sl and Name
            // "1   Customer Name..."
            receipt += `1   ${customerName.substring(0, PRINTER_WIDTH - 6)}\n`;

            if (place) {
                receipt += `          Place: ${place.substring(0, PRINTER_WIDTH - 11)}\n`;
            }

            // Line 2: Ref/Cheque and Amount
            // "    (Ref...)           25000.00"
            // Amount is right aligned to end of line
            const indent = "    ";
            const amountStr = amount.toString();
            // Available space for ref detail is Width - Indent - Space - Amount
            const availableRefWidth = PRINTER_WIDTH - indent.length - 1 - amountStr.length;
            const refStr = refDetail.substring(0, availableRefWidth).padEnd(availableRefWidth, " ");

            receipt += `${indent}${refStr} ${amountStr}\n`;

            receipt += line;

            // --- TOTAL ---
            const totalLabel = "Total";
            const totalPadSize_C = PRINTER_WIDTH - totalLabel.length - amount.length - 1;
            receipt += `${" ".repeat(Math.max(0, totalPadSize_C))}${totalLabel} ${amount}\n`;
            receipt += line;

            // --- AMOUNT IN WORDS ---
            const amountInWords = this.numberToWords(parseFloat(collection.amount));
            receipt += `Amount in words: ${amountInWords}\n`;
            receipt += "\n";

            // --- NARRATION ---
            receipt += `Narration\n`;
            const narration = `${collection.remarks || ''}`;
            if (narration) {
                receipt += `${narration.substring(0, PRINTER_WIDTH)}\n`;
            }
            receipt += "\n";

            // --- FOOTER ---
            receipt += line;
            // "Prepared by" (Left) and "For: Company" (Right)
            // Split into two lines if needed, or condensed
            const prepBy = "Prepared by.";
            const forComp = `For: ${companyName.substring(0, 10)}`;

            if (PRINTER_WIDTH >= 32) {
                const footerSpace = PRINTER_WIDTH - prepBy.length - forComp.length;
                receipt += `${prepBy}${" ".repeat(Math.max(1, footerSpace))}${forComp}\n`;
            } else {
                receipt += `${prepBy}\n`;
                receipt += `${" ".repeat(PRINTER_WIDTH - forComp.length)}${forComp}\n`;
            }

            receipt += "\n";

            // --- TERMS & CONDITIONS ---
            const tcTextC = await this.loadTermsAndConditions();
            if (tcTextC) {
                receipt += line;
                const wordsC = tcTextC.split(' ');
                let currentLineC = '';
                wordsC.forEach(word => {
                    if ((currentLineC + word).length > PRINTER_WIDTH) {
                        receipt += currentLineC.trim() + '\n';
                        currentLineC = word + ' ';
                    } else {
                        currentLineC += word + ' ';
                    }
                });
                if (currentLineC.trim()) receipt += currentLineC.trim() + '\n';
                receipt += '\n';
            }

            await PrinterInterface.printBill(receipt);
            return true;

        } catch (err) {
            console.error("[Printer] Print collection failed:", err);
            Alert.alert("Print Error", "Failed to send data to printer. Please check connection.");
            this.connected = false;
            return false;
        }
    }

    // Convert number to words
    numberToWords(num) {
        if (num === 0) return "ZERO RUPEES";

        const units = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
        const teens = ["TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
        const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

        const convert = (n) => {
            if (n < 10) return units[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + units[n % 10] : "");
            if (n < 1000) return units[Math.floor(n / 100)] + " HUNDRED" + (n % 100 ? " AND " + convert(n % 100) : "");
            if (n < 100000) return convert(Math.floor(n / 1000)) + " THOUSAND" + (n % 1000 ? " " + convert(n % 1000) : "");
            return convert(Math.floor(n / 100000)) + " LAKH" + (n % 100000 ? " " + convert(n % 100000) : "");
        };

        const intPart = Math.floor(num);
        const words = convert(intPart) + " RUPEES";
        return words.trim();
    }
}

export default new PrinterService();
