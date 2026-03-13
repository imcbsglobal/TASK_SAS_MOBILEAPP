import AsyncStorage from "@react-native-async-storage/async-storage";
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
        printBill: async () => { console.log("Mock BLE Print"); return Promise.resolve(); },
    };
    USBPrinter = {
        init: async () => { console.log("Mock USB Init"); return Promise.resolve(); },
        getDeviceList: async () => [],
        connectPrinter: async () => { console.log("Mock USB Connect"); return Promise.resolve(true); },
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
                        await BLEPrinter.init();
                        this.isBLEInitialized = true;
                        console.log("[Printer] BLE Init Success");
                        return true;
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
                    console.warn("[Printer] Skipping BLE scan - not initialized (Bluetooth might be off)");
                    return [];
                }

                const hasPerm = await this.requestPermissions();
                if (!hasPerm) return [];

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
            let printerMac = device.inner_mac_address || device.vendor_id;
            console.log(`[Printer] Connecting to ${this.connectionType}:`, printerMac);

            if (this.connectionType === 'ble') {
                if (BLEPrinter) await BLEPrinter.connectPrinter(printerMac);
            } else {
                if (USBPrinter) await USBPrinter.connectPrinter(device.vendor_id, device.product_id);
            }

            this.connected = true;
            this.currentPrinter = device;
            console.log("[Printer] Connected successfully");
            return true;
        } catch (err) {
            console.error("[Printer] Connection failed:", err);
            this.connected = false;
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
                    } catch(e) { console.log('[Printer] Error fetching customer place', e); }
                }

                receipt += "\x1B\x45\x01" + `${customerText}\n` + "\x1B\x45\x00"; // Bold customer name

                if (place) {
                    receipt += `${place}\n`;
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
            const qtyLen = 3;
            const priceLen = 9;
            const itemLen = Math.max(5, PRINTER_WIDTH - qtyLen - priceLen - 2);

            const headerItem = "Item".padEnd(itemLen, " ");
            const headerQty = "Qty".padStart(qtyLen, " ");
            const headerPrice = "Price".padStart(priceLen, " ");
            receipt += `${headerItem} ${headerQty} ${headerPrice}\n`;

            receipt += line;

            let totalAmount = 0;
            if (Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const price = Number(item.price) || 0;
                    const qty = Number(item.qty) || 0;
                    const itemTotal = price * qty;
                    totalAmount += itemTotal;

                    const name = String(item.name || "Item").substring(0, itemLen).padEnd(itemLen, " ");
                    const qtyStr = qty.toFixed(3).padStart(qtyLen, " ");
                    const priceStr = itemTotal.toFixed(2).padStart(priceLen, " ");

                    receipt += `${name} ${qtyStr} ${priceStr}\n`;

                    // Extra Line for HSN/GST
                    if (item.hsn || item.gst || item.taxcode || item.text6) {
                        const hsnVal = item.hsn || item.text6 || '-';
                        const gstVal = item.gst || item.taxcode || '-';
                        // Indent slightly
                        receipt += `  HSN:${hsnVal} GST:${gstVal}%\n`;
                    }
                });
            }

            receipt += line;

            // --- TOTAL ---
            const totalLabel = "TOTAL:";
            const totalVal = totalAmount.toFixed(2);
            const totalPad = PRINTER_WIDTH - totalLabel.length - totalVal.length;
            receipt += `${totalLabel}${" ".repeat(Math.max(0, totalPad))}${totalVal}\n`;

            receipt += line;
            receipt += centerText("Thank You!");

            // Status Code (S/F)
            if (order.printStatus || order.description) {
                const status = order.printStatus || order.description;
                receipt += centerText(`Status: ${status}`);
            }
            receipt += "\n";

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

            // Ensure company info is loaded (same as printOrder - do NOT call loadSettings here)
            await this.loadCompanyInfo();

            const PrinterInterface = this.connectionType === 'ble' ? BLEPrinter : USBPrinter;
            if (!PrinterInterface) {
                Alert.alert("Error", "Printer module not available");
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
            receipt += "\x1B\x40"; // ESC @ - Initialize/reset printer

            // --- HEADER (text-only, no logo, no ESC/POS bold to avoid parser issues) ---
            const companyName = this.companyInfo?.firm_name || "TaskSAS";
            receipt += centerText(companyName);

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
            }

            receipt += line;

            // --- RECEIPT TITLE ---
            const receiptTitle = order.receiptTitle || "Order Receipt";
            receipt += centerText(receiptTitle);
            receipt += line;

            // --- META INFO ---
            const dateObj = new Date(order.timestamp);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

            // Two-column meta: left = Inv Date, right = Sale Type
            const metaLeft1 = `Inv Date: ${formattedDate}`;
            const orderId = order.formattedOrderId || (order.isApiOrder ? order.id : "NA");
            const metaLeft2 = `Inv No  : ${orderId}`;
            const paymentType = order.payment || order.type || "Cash";
            const metaLeft3 = `Type    : ${paymentType}`;

            // Salesman - use order.salesman, order.salesmanName, or fallback username
            const salesmanName = order.salesman || order.salesmanName || order.username || "";
            const metaRight1 = salesmanName ? `Salesman: ${salesmanName}` : "";

            // Print meta lines - fit within width
            const printMetaLine = (left, right) => {
                if (!right) return `${left}\n`;
                const available = PRINTER_WIDTH - left.length - right.length;
                if (available >= 1) {
                    return `${left}${" ".repeat(available)}${right}\n`;
                }
                return `${left}\n${right}\n`;
            };

            receipt += printMetaLine(metaLeft1, "");
            receipt += printMetaLine(metaLeft2, metaRight1);
            receipt += printMetaLine(metaLeft3, "");

            // Customer
            let previousBalance = null;
            if (order.customer) {
                let customerText = String(order.customer);
                let place = order.customerPlace || order.area;
                
                // Fetch from database for place fallback and previous balance
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
                    } catch(e) { console.log('[Printer] Error fetching customer info', e); }
                }

                receipt += `Customer: ${customerText.substring(0, PRINTER_WIDTH - 10)}\n`;
                if (place) {
                    receipt += `${place.substring(0, PRINTER_WIDTH)}\n`;
                }
            }

            receipt += line;

            // --- ITEMS TABLE ---
            // Columns: NO | ITEM | QTY | PRICE | TOTAL
            // Column widths adapt to paper size
            // Fixed widths: NO=2, QTY=5, PRICE=7, TOTAL=7 — ITEM gets the rest
            const noLen = 2;
            const qtyLen = 5;
            const priceLen = 7;
            const totalLen = 7;
            const separators = 4; // 4 spaces between columns
            const itemLen = Math.max(5, PRINTER_WIDTH - noLen - qtyLen - priceLen - totalLen - separators);

            const hdrNo = "NO".padEnd(noLen, " ");
            const hdrItem = "ITEM".padEnd(itemLen, " ");
            const hdrQty = "QTY".padStart(qtyLen, " ");
            const hdrPrice = "PRICE".padStart(priceLen, " ");
            const hdrTotal = "TOTAL".padStart(totalLen, " ");
            receipt += `${hdrNo} ${hdrItem} ${hdrQty} ${hdrPrice} ${hdrTotal}\n`;
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

                    receipt += `${noStr} ${name} ${qtyStr} ${priceStr} ${totalStr}\n`;

                    // If item name is longer than itemLen, print continuation line
                    const fullName = String(item.name || "");
                    if (fullName.length > itemLen) {
                        const remainder = fullName.substring(itemLen);
                        receipt += `${"".padEnd(noLen + 1)}${remainder.substring(0, itemLen)}\n`;
                    }

                    rowNo++;
                });
            }

            receipt += line;

            // --- TOTAL ---
            const totalLabel = "TOTAL:";
            const totalVal = totalAmount.toFixed(2);
            const totalPad = PRINTER_WIDTH - totalLabel.length - totalVal.length;
            receipt += `${totalLabel}${" ".repeat(Math.max(1, totalPad))}${totalVal}\n`;

            if (previousBalance !== null && previousBalance !== undefined && !isNaN(Number(previousBalance))) {
                const balLabel = "PREV BALANCE:";
                const balVal = Number(previousBalance).toFixed(2);
                const balPad = PRINTER_WIDTH - balLabel.length - balVal.length;
                receipt += `${balLabel}${" ".repeat(Math.max(1, balPad))}${balVal}\n`;
            }

            receipt += line;
            receipt += centerText("Thank You!");
            receipt += "\n";

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
            const amount = parseFloat(collection.amount || 0).toFixed(2);
            const chequeRef = collection.cheque_number || collection.ref_no || "";
            const paymentType = collection.payment_type || "CASH";
            const refDetail = chequeRef ? `(${chequeRef})` : `(${paymentType})`;

            // Line 1: Sl and Name
            // "1   Customer Name..."
            receipt += `1   ${customerName.substring(0, PRINTER_WIDTH - 6)}\n`;

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
            const totalPad = PRINTER_WIDTH - totalLabel.length - amount.length;
            receipt += `${totalLabel}${" ".repeat(Math.max(1, totalPad))}${amount}\n`;
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
