// app/Sales/PlaceSales.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import pdfService from "../../src/services/pdfService";
import printerService from "../../src/services/printerService";
import savedOrdersDbService from "../../src/services/savedOrdersDb";

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export default function PlaceSales() {
  const router = useRouter();
  const [orders, setOrders] = useState([]); // Local sales (Pending/Failed)
  const [uploadedOrders, setUploadedOrders] = useState([]); // API orders
  const [loadingUploaded, setLoadingUploaded] = useState(false);

  const [expandedOrder, setExpandedOrder] = useState(null);
  const [editingQty, setEditingQty] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingOrder, setUploadingOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('pending'); // pending, uploaded, failed
  const [uploadDetailsModal, setUploadDetailsModal] = useState(false);

  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const [savedOrders, setSavedOrders] = useState([]);
  const [revertClicks, setRevertClicks] = useState({}); // { orderId: count }

  // Bulk Selection State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);


  // Printer State
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [connectionType, setConnectionType] = useState('ble'); // 'ble' | 'usb'
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadUsername();
    }, [])
  );

  useEffect(() => {
    if (currentUsername) {
      loadLocalOrders();
      loadSavedOrders();
      fetchUploadedOrders();
    }
  }, [currentUsername]);

  async function loadSavedOrders() {
    const saved = await savedOrdersDbService.getSavedTransactions('Sales');
    setSavedOrders(saved);
  }

  useEffect(() => {
    if (filterStatus === 'uploaded') {
      fetchUploadedOrders();
    }
  }, [filterStatus]);

  // Load current username
  async function loadUsername() {
    try {
      const username = await AsyncStorage.getItem('username');
      setCurrentUsername(username);
    } catch (error) {
      console.error('Error loading username:', error);
    }
  }

  // Load orders from AsyncStorage (Only Pending/Failed/Partial) - Per User
  async function loadLocalOrders() {
    try {
      if (!currentUsername) return;

      const storageKey = `placed_sales_${currentUsername}`;
      const storedOrders = await AsyncStorage.getItem(storageKey);
      if (storedOrders) {
        let parsedOrders = JSON.parse(storedOrders);

        // Filter out orders older than 30 hours
        const THIRTY_HOURS_MS = 30 * 60 * 60 * 1000;
        const now = Date.now();

        const validOrders = parsedOrders.filter(order => {
          if (!order.timestamp) return true; // Keep entries without timestamp (legacy)

          const orderTime = new Date(order.timestamp).getTime();
          const age = now - orderTime;

          if (age > THIRTY_HOURS_MS) {
            console.log(`[PlaceSales] Removing expired entry (${Math.round(age / 3600000)}h old):`, order.id);
            return false;
          }
          return true;
        });

        // Save cleaned list back to storage
        if (validOrders.length !== parsedOrders.length) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(validOrders));
          console.log(`[PlaceSales] Removed ${parsedOrders.length - validOrders.length} expired entries`);
        }

        // Sort by timestamp, newest first
        const sortedOrders = validOrders.sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        setOrders(sortedOrders);
      }
    } catch (error) {
      console.error('Error loading sales:', error);
      Alert.alert('Error', 'Failed to load sales');
    }
  }

  // Fetch Uploaded Orders from API
  async function fetchUploadedOrders() {
    setLoadingUploaded(true);
    try {
      const username = await AsyncStorage.getItem('username');
      const authToken = await AsyncStorage.getItem('authToken');

      if (!authToken) {
        Alert.alert("Error", "Authentication missing. Please login again.");
        return;
      }

      const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${authToken}`
      };

      const response = await fetch('https://tasksas.com/api/sales/list-all', {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const apiData = json.sales || [];

      console.log('Current User:', username);

      // Map API data to App's Sales Structure
      // FILTER: Only show orders from the last 2 days
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(0, 0, 0, 0);

      const mappedOrders = apiData
        .filter(apiOrder => {
          if (!username) return false;
          const apiUser = apiOrder.username ? String(apiOrder.username).trim() : '';
          const currentUser = String(username).trim();

          // User Filter
          if (apiUser.toLowerCase() !== currentUser.toLowerCase()) return false;

          // Date Filter: Last 2 Days
          const apiDate = new Date(apiOrder.created_date);
          apiDate.setHours(0, 0, 0, 0);
          return apiDate >= twoDaysAgo;
        })
        .map(apiOrder => {
          const items = apiOrder.items || [];
          const calcTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
          const apiDateStr = apiOrder.created_date || "";
          const apiTimeStr = apiOrder.created_time || "";
          const fullTimestamp = (apiDateStr && apiTimeStr) ? `${apiDateStr}T${apiTimeStr}` : new Date().toISOString();

          return {
            id: apiOrder.sales_id,
            isApiOrder: true,
            customer: apiOrder.customer_name,
            customerCode: apiOrder.customer_code,
            area: apiOrder.area,
            type: 'Sales',
            payment: apiOrder.payment_type,
            remark: apiOrder.remark,
            status: apiOrder.status || 'uploaded',
            uploadStatus: 'uploaded',
            timestamp: fullTimestamp,
            uploadedAt: fullTimestamp,
            total: calcTotal,
            items: items.map(item => ({
              name: item.product_name,
              code: item.item_code,
              barcode: item.barcode,
              price: parseFloat(item.price),
              qty: parseFloat(item.quantity),
              total: parseFloat(item.amount),
              hsn: item.text6 || item.hsn || '',
              gst: item.taxcode || item.gst || item.tax_code || '',
              uploadStatus: 'uploaded'
            })).sort((a, b) => {
              const codeA = String(a.code || '').toLowerCase();
              const codeB = String(b.code || '').toLowerCase();
              return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            })
          };
        });

      setUploadedOrders(mappedOrders);

    } catch (error) {
      console.error('Error fetching uploaded sales:', error);
      // Alert.alert('Error', 'Failed to fetch uploaded sales');
    } finally {
      setLoadingUploaded(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    if (filterStatus === 'uploaded') {
      await fetchUploadedOrders();
    } else if (filterStatus === 'saved') {
      await loadSavedOrders();
    } else {
      await loadLocalOrders();
    }
    setRefreshing(false);
  }

  // Toggle order expansion
  function toggleOrder(orderId) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
  }

  // Update item quantity (Local Only)
  async function updateItemQty(orderId, itemIndex, newQty) {
    if (filterStatus === 'uploaded') return; // Cannot edit uploaded
    try {
      const updatedOrders = orders.map(order => {
        if (order.id === orderId) {
          const updatedItems = [...order.items];
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            qty: newQty,
            total: newQty * updatedItems[itemIndex].price
          };
          const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
          return { ...order, items: updatedItems, total: newTotal };
        }
        return order;
      });
      setOrders(updatedOrders);
      const storageKey = `placed_sales_${currentUsername}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(updatedOrders));
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  }

  // Remove item (Local Only)
  async function removeItem(orderId, itemIndex) {
    if (filterStatus === 'uploaded') return;
    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedOrders = orders.map(order => {
                if (order.id === orderId) {
                  const updatedItems = order.items.filter((_, idx) => idx !== itemIndex);
                  if (updatedItems.length === 0) return null;
                  const newTotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
                  return { ...order, items: updatedItems, total: newTotal };
                }
                return order;
              }).filter(Boolean);
              setOrders(updatedOrders);
              const storageKey = `placed_sales_${currentUsername}`;
              await AsyncStorage.setItem(storageKey, JSON.stringify(updatedOrders));
            } catch (e) {
              console.error(e);
            }
          }
        }
      ]
    );

  }

  // Bulk Selection Logic
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedOrders([]);
  };

  const toggleOrderSelection = (orderId) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const selectAllOrders = () => {
    if (selectedOrders.length === displayOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(displayOrders.map(o => o.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedOrders.length === 0) return;

    Alert.alert(
      "Bulk Delete",
      `Are you sure you want to delete ${selectedOrders.length} orders?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const newOrders = orders.filter(o => !selectedOrders.includes(o.id));
            setOrders(newOrders);
            const storageKey = `placed_sales_${currentUsername}`;
            await AsyncStorage.setItem(storageKey, JSON.stringify(newOrders));
            setSelectionMode(false);
            setSelectedOrders([]);
          }
        }
      ]
    );
  };

  const handleBulkUpload = async () => {
    if (selectedOrders.length === 0) return;

    Alert.alert(
      "Bulk Upload",
      `Upload ${selectedOrders.length} orders?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: async () => {
            setLoadingUploaded(true);
            let successCount = 0;
            let failCount = 0;
            const contextUsername = currentUsername;

            // Get fresh copy of orders from reference or rely on state (using state for simplicity)
            // We need to keep track of results to update state ONCE at the end or incrementally
            let processedOrders = [...orders];

            for (const orderId of selectedOrders) {
              // ✅ Re-check orders every step to catch dynamic status updates during loop
              const orderIndex = processedOrders.findIndex(o => o.id === orderId);
              if (orderIndex === -1) continue;

              const order = processedOrders[orderIndex];

              // Skip if already uploaded
              if (order.uploadStatus === 'uploaded' || order.uploadStatus === 'uploaded to server') {
                console.log(`[Sync] Skipping already uploaded order: ${orderId}`);
                continue;
              }
  
              try {
                const result = await uploadOrderToAPI(order);

                if (result.success) {
                  successCount++;
                  // Save locally for 2 days
                  await savedOrdersDbService.saveTransactionLocally(orderId, 'Sales', order);

                  // Update local processed array
                  const itemsWithStatus = order.items.map(item => ({ ...item, uploadStatus: 'uploaded to server' }));
                  processedOrders[orderIndex] = {
                    ...order,
                    status: 'uploaded to server',
                    uploadStatus: 'uploaded to server',
                    items: itemsWithStatus,
                    uploadedAt: new Date().toISOString()
                  };
                } else {
                  failCount++;
                  // You could mark specific failure status here if needed
                  const itemsWithStatus = order.items.map(item => ({ ...item, uploadStatus: 'failed' }));
                  processedOrders[orderIndex] = {
                    ...order,
                    status: 'failed',
                    uploadStatus: 'failed',
                    items: itemsWithStatus
                  };
                }
              } catch (e) {
                failCount++;
                console.error(e);
              }
            }

            // Update state and storage once
            setOrders(processedOrders);
            const storageKey = `placed_sales_${contextUsername}`;
            await AsyncStorage.setItem(storageKey, JSON.stringify(processedOrders));

            // Reload saved orders to show newly uploaded one if needed
            await loadSavedOrders();

            setLoadingUploaded(false);
            setSelectionMode(false);
            setSelectedOrders([]);

            Alert.alert(
              "Bulk Upload Completed",
              `Successfully uploaded: ${successCount}\nFailed: ${failCount}`
            );
          }
        }
      ]
    );
  };

  // Upload Logic with Retry Mechanism
  async function uploadOrderToAPI(order) {
    try {
      const username = await AsyncStorage.getItem('username');
      const authToken = await AsyncStorage.getItem('authToken');
      const deviceId = (await AsyncStorage.getItem('device_hardware_id')) || (await AsyncStorage.getItem('deviceId'));

      // ✅ CRITICAL: Validate auth token before attempting upload
      if (!authToken) {
        throw new Error('Authentication token missing. Please login again.');
      }

      if (!username) {
        throw new Error('Missing credentials. Please login again.');
      }

      // VALIDATION & SANITIZATION
      const cleanString = (str) => String(str || '').trim();
      const cleanNumber = (num) => {
        const n = parseFloat(num);
        return isNaN(n) ? 0 : n;
      };

      const validItems = order.items.filter(item => {
        const code = cleanString(item.code);
        const name = cleanString(item.name);
        return code && name; // Must have code and name
      }).map(item => ({
        product_name: cleanString(item.name),
        item_code: cleanString(item.code),
        barcode: cleanString(item.barcode || item.code),
        price: cleanNumber(item.price),
        quantity: cleanNumber(item.qty).toFixed(3),
        amount: cleanNumber(item.total),
        hsn: cleanString(item.hsn),      // Add HSN
        gst: cleanString(item.gst)       // Add GST
      }));

      if (validItems.length === 0) {
        throw new Error('Order has no valid items (missing code or name).');
      }

      const payload = {
        device_id: cleanString(deviceId || 'unknown'),
        customer_name: cleanString(order.customer),
        customer_code: cleanString(order.customerCode),
        area: cleanString(order.area),
        payment_type: cleanString(order.payment),
        username: cleanString(username),
        remark: cleanString(order.remark),
        items: validItems
      };

      console.log('[Upload] Payload:', JSON.stringify(payload, null, 2));

      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      };

      // ✅ NO RETRIES for CREATE calls. 
      // Retrying a creation request after a timeout can lead to duplicates if the server already processed the original.
      const MAX_RETRIES = 0; 
      const RETRY_DELAYS = [1000, 2000, 4000]; // ms
      let lastError = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1];
            console.log(`[Upload] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms...`);

            // Show retry feedback to user
            if (Platform.OS === 'android') {
              const { ToastAndroid } = require('react-native');
              ToastAndroid.show(`Retrying upload (${attempt}/${MAX_RETRIES})...`, ToastAndroid.SHORT);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const response = await fetch('https://tasksas.com/api/sales/create', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
          });

          console.log(`[Upload] Attempt ${attempt + 1} - Response Status:`, response.status);

          // ✅ Handle different error types
          if (!response.ok) {
            const text = await response.text();
            console.error(`[Upload] Attempt ${attempt + 1} - Error Response:`, text);

            // Extract meaningful error message
            let errorMessage = `Server Error (${response.status})`;

            try {
              const jsonError = JSON.parse(text);
              errorMessage = jsonError.message || jsonError.error || errorMessage;
            } catch {
              // If it's HTML, try to extract the error
              if (text.includes('<title>')) {
                const titleMatch = text.match(/<title>(.*?)<\/title>/);
                if (titleMatch) errorMessage = titleMatch[1];
              }
            }

            // ✅ Only retry on 500 errors (server errors)
            if (response.status >= 500 && attempt < MAX_RETRIES) {
              lastError = new Error(errorMessage);
              console.log(`[Upload] Server error ${response.status}, will retry...`);
              continue; // Retry
            }

            // ✅ Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
              throw new Error(`${errorMessage}. Please check your data and try again.`);
            }

            throw new Error(errorMessage);
          }

          // ✅ SUCCESS - Parse response
          let responseData;
          try {
            responseData = await response.json();
          } catch {
            responseData = { success: true };
          }

          console.log('[Upload] Success Response:', responseData);

          return {
            success: true,
            partialSuccess: false,
            results: order.items.map((item, i) => ({
              itemIndex: i,
              itemName: item.name,
              success: true,
              data: responseData
            })),
            successCount: order.items.length,
            totalCount: order.items.length
          };

        } catch (fetchError) {
          // Network errors or other fetch failures
          lastError = fetchError;

          if (attempt < MAX_RETRIES) {
            console.log(`[Upload] Network error, will retry:`, fetchError.message);
            continue; // Retry
          }
        }
      }

      // ✅ All retries exhausted
      throw lastError || new Error('Upload failed after multiple attempts');

    } catch (error) {
      console.error('[Upload] Final Error:', error);
      return {
        success: false,
        results: order.items.map((item, i) => ({
          itemIndex: i,
          itemName: item.name,
          success: false,
          error: error.message
        })),
        error: error.message
      };
    }
  }

  async function confirmOrder(orderId) {
    // ✅ Check BOTH single and bulk upload states
    if (uploadingOrder || loadingUploaded) {
      console.log('[Sync] Already syncing - blocking individual sync');
      return;
    }

    Alert.alert(
      'Confirm & Upload Sales',
      'This will upload the order to the server. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Upload',
          onPress: async () => {
            const order = orders.find(o => o.id === orderId);
            if (!order) {
              Alert.alert('Error', 'Order not found');
              return;
            }

            // ✅ PREVENT DUPLICATES: Check if already uploaded
            if (order.uploadStatus === 'uploaded' || order.uploadStatus === 'uploaded to server') {
              Alert.alert('Already Sync', 'This sales entry is already uploaded to the server.');
              return;
            }

            setUploadingOrder(orderId);
            try {

              const uploadResult = await uploadOrderToAPI(order);

              const updatedOrders = orders.map(o => {
                if (o.id === orderId) {
                  const itemsWithStatus = o.items.map(item => ({
                    ...item,
                    uploadStatus: uploadResult.success ? 'uploaded to server' : 'failed'
                  }));
                  return {
                    ...o,
                    status: uploadResult.success ? 'uploaded to server' : 'failed',
                    uploadStatus: uploadResult.success ? 'uploaded to server' : 'failed',
                    items: itemsWithStatus,
                    uploadedAt: new Date().toISOString()
                  };
                }
                return o;
              });

              const storageKey = `placed_sales_${currentUsername}`;
              await AsyncStorage.setItem(storageKey, JSON.stringify(updatedOrders));
              setOrders(updatedOrders);

              if (uploadResult.success) {
                // Save locally for 2 days - non-blocking for speed
                savedOrdersDbService.saveTransactionLocally(orderId, 'Sales', order).then(() => loadSavedOrders());
                Alert.alert(
                  "Upload Successful",
                  "Order uploaded successfully!",
                  [
                    {
                      text: "View Uploaded",
                      onPress: () => setFilterStatus('uploaded')
                    },
                    {
                      text: "Go Home",
                      onPress: () => router.replace('/(tabs)/Home')
                    }
                  ]
                );
              } else {
                // Check for Server Error (500) which usually means expired token/session
                if (uploadResult.error && uploadResult.error.includes('500')) {
                  Alert.alert(
                    "Session Expired",
                    "Your login session has expired. Please login again to fix the upload.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Login Again",
                        onPress: async () => {
                          await AsyncStorage.removeItem('authToken');
                          router.replace('/');
                        }
                      }
                    ]
                  );
                } else {
                  Alert.alert("Upload Failed", uploadResult.error || "Unknown error");
                }
              }

            } catch (error) {
              Alert.alert('Error', error.message);
            } finally {
              setUploadingOrder(null);
            }
          }
        }
      ]
    );
  }

  async function deleteOrder(orderId) {
    Alert.alert('Delete Sales Entry', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const newOrders = orders.filter(o => o.id !== orderId);
          setOrders(newOrders);
          const storageKey = `placed_sales_${currentUsername}`;
          await AsyncStorage.setItem(storageKey, JSON.stringify(newOrders));
        }
      }
    ]);
  }

  async function testAPIConnection() {
    Alert.alert("Info", "Test functionality is simplified in this version.");
  }

  async function retryUpload(orderId) {
    await confirmOrder(orderId);
  }

  const handlePrint = async (order) => {
    try {
      const isUploaded = order.isApiOrder || order.uploadStatus === 'uploaded' || order.uploadStatus === 'uploaded to server';
      const printContext = filterStatus === 'uploaded' || isUploaded ? 'uploaded' : 'pending';

      const salesmanName = await AsyncStorage.getItem('username') || '';
      const formType = await AsyncStorage.getItem('settings_print_form_type') || 'form1';

      const orderToPrint = {
        ...order,
        description: printContext === 'uploaded' ? 'S' : 'F',
        formattedOrderId: printContext === 'uploaded' ? order.id : 'NA',
        printStatus: printContext === 'uploaded' ? 'S' : 'F',
        receiptTitle: 'Sales Receipt',
        salesman: salesmanName,
      };

      const doPrint = async (toPrint) => {
        if (formType === 'form3') {
          return printerService.printOrderForm3(toPrint);
        }
        if (formType === 'form2') {
          return printerService.printOrderForm2(toPrint);
        }
        return printerService.printOrder(toPrint);
      };

      if (printerService.connected) {
        Alert.alert("Printing", "Sending data to printer...");
        await doPrint(orderToPrint);
      } else {
        setSelectedOrderToPrint({ ...orderToPrint, _formType: formType });
        setPrinterModalVisible(true);
        setIsScanningPrinters(true);
        const devices = await printerService.getDeviceList('ble');
        setPrinters(devices);
        setIsScanningPrinters(false);
      }
    } catch (error) {
      console.error("Print Crash Prevented:", error);
      Alert.alert("Error", "Failed to initiate printing: " + error.message);
    }
  };

  const scanPrinters = async (type) => {
    setIsScanningPrinters(true);
    setPrinters([]);
    setConnectionType(type);
    try {
      const devices = await printerService.getDeviceList(type);
      setPrinters(devices);
    } catch (e) { Alert.alert("Error", "Scan failed"); }
    finally { setIsScanningPrinters(false); }
  };

  const handleSharePDF = async (order) => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      // Determine context
      const isUploaded = order.isApiOrder || order.uploadStatus === 'uploaded' || order.uploadStatus === 'uploaded to server';
      const printContext = filterStatus === 'uploaded' || isUploaded ? 'uploaded' : 'pending';

      // 1. Enrich items if HSN/GST missing
      let enrichedItems = order.items;

      const needsEnrichment = order.items.some(item =>
        (!item.hsn || item.hsn === '') || (!item.gst || item.gst === '')
      );

      if (needsEnrichment) {
        try {
          await dbService.init();
          enrichedItems = await Promise.all(order.items.map(async (item) => {
            if ((item.hsn && item.hsn !== '') && (item.gst && item.gst !== '')) {
              return item;
            }

            let product = null;
            if (item.code) {
              product = await dbService.getProductByCode(item.code);
            }
            if (!product && item.barcode) {
              product = await dbService.getProductByBarcode(item.barcode);
            }

            if (product) {
              return {
                ...item,
                hsn: item.hsn || product.text6 || '',
                gst: item.gst || product.taxcode || ''
              };
            }
            return item;
          }));
        } catch (enrichError) {
          console.warn('[PDF] Enrichment failed:', enrichError);
        }
      }

      const orderToPdf = {
        ...order,
        items: enrichedItems,
        formattedOrderId: printContext === 'uploaded' ? order.id : 'NA',
        printStatus: printContext === 'uploaded' ? 'S' : 'F'
      };

      await pdfService.shareOrderPDF(orderToPdf);

    } catch (e) {
      console.error("PDF Share Error:", e);
      Alert.alert("Error", "Failed to share PDF");
    } finally {
      setIsSharing(false);
    }
  };

  const [isSharing, setIsSharing] = useState(false);

  // JSON Download Logic - FIXED (MOBILE SAFE)
  const handleDownloadJSON = async (order) => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      console.log('[JSON Download] Starting download for order:', order.customer);

      if (!order.items || order.items.length === 0) {
        Alert.alert("Error", "No items in this order to download");
        return;
      }

      // Create JSON
      const content = JSON.stringify(order, null, 2);

      // Ensure sharing exists
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert("Error", "Sharing is not available on this device");
        return;
      }

      // ✅ USE documentDirectory DIRECTLY (DO NOT FALLBACK)
      const fileName = `Order_${Date.now()}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;

      console.log('[JSON Download] Writing file to:', fileUri);

      // Write file
      await FileSystem.writeAsStringAsync(
        fileUri,
        content,
        { encoding: 'utf8' }
      );

      console.log('[JSON Download] File written successfully');

      // Share / Save
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Download Order JSON',
        UTI: 'public.json',
      });

      console.log('[JSON Download] Share dialog opened');

    } catch (error) {
      console.error('[JSON Download] Error:', error);
      Alert.alert("Download Failed", error.message);
    } finally {
      setIsSharing(false);
    }
  };


  const connectAndPrint = async (printer) => {
    const connected = await printerService.connect(printer);
    if (connected) {
      setPrinterModalVisible(false);
      if (selectedOrderToPrint) {
        const formType = selectedOrderToPrint._formType || 'form1';
        setTimeout(() => {
          if (formType === 'form3') {
            printerService.printOrderForm3(selectedOrderToPrint);
          } else if (formType === 'form2') {
            printerService.printOrderForm2(selectedOrderToPrint);
          } else {
            printerService.printOrder(selectedOrderToPrint);
          }
        }, 500);
      }
    } else {
      Alert.alert("Error", "Connection failed");
    }
  };

  function formatDate(timestamp) {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      return `${dateStr}, ${timeStr}`;
    } catch (e) { return timestamp; }
  }

  function getStatusBadgeConfig(status) {
    if (status === 'uploaded' || status === 'uploaded to server' || status === 'completed') {
      return { gradient: Gradients.success, icon: 'cloud-done', text: status === 'completed' ? 'Completed' : 'Uploaded' };
    } else if (status === 'partial') {
      return { gradient: [Colors.warning.main, Colors.warning.main], icon: 'cloud-upload', text: 'Partial' };
    } else if (status === 'failed') {
      return { gradient: Gradients.danger, icon: 'cloud-offline', text: 'Failed' };
    } else {
      return { gradient: [Colors.warning.main, Colors.warning.main], icon: 'time', text: 'Pending' };
    }
  }

  let displayOrders = [];
  if (filterStatus === 'uploaded') {
    displayOrders = uploadedOrders;
  } else if (filterStatus === 'saved') {
    displayOrders = savedOrders;
  } else if (filterStatus === 'pending') {
    displayOrders = orders.filter(o => !o.uploadStatus || o.uploadStatus === 'pending');
  } else if (filterStatus === 'failed') {
    displayOrders = orders.filter(o => o.uploadStatus === 'failed' || o.uploadStatus === 'partial');
  } else {
    displayOrders = orders;
  }

  const handleRevert = async (order) => {
    const currentCount = revertClicks[order.id] || 0;
    const newCount = currentCount + 1;

    if (newCount >= 5) {
      Alert.alert(
        "Confirm Revert",
        "Do you want to revert this sales entry to the pending section?",
        [
          { text: "Cancel", onPress: () => setRevertClicks(prev => ({ ...prev, [order.id]: 0 })) },
          {
            text: "Revert",
            onPress: async () => {
              // 1. Remove from SQLite
              await savedOrdersDbService.deleteSavedTransaction(order.id);

              // 2. Add back to Pending AsyncStorage
              const storageKey = `placed_sales_${currentUsername}`;
              const updatedOrder = { ...order, status: 'pending', uploadStatus: 'pending' };
              const currentPending = [...orders];

              if (!currentPending.find(o => o.id === order.id)) {
                currentPending.push(updatedOrder);
              } else {
                const idx = currentPending.findIndex(o => o.id === order.id);
                currentPending[idx] = updatedOrder;
              }

              await AsyncStorage.setItem(storageKey, JSON.stringify(currentPending));
              setOrders(currentPending);
              await loadSavedOrders();

              setRevertClicks(prev => {
                const next = { ...prev };
                delete next[order.id];
                return next;
              });

              Alert.alert("Success", "Sales entry reverted to pending!");
            }
          }
        ]
      );
    } else {
      setRevertClicks(prev => ({ ...prev, [order.id]: newCount }));
    }
  };

  const handleEditOrder = async (order) => {
    try {
      const cartKey = `temp_active_cart_${currentUsername}`;
      const savedCartStr = await AsyncStorage.getItem(cartKey);
      const existingCart = savedCartStr ? JSON.parse(savedCartStr) : [];

      const proceedWithEdit = async () => {
        try {
          // 1. Map items to cart format
          const cartItems = order.items.map(item => ({
            product: {
              id: item.productId,
              code: item.code,
              name: item.name,
              barcode: item.barcode,
              price: item.price,
              mrp: item.mrp || item.price,
              text6: item.hsn || '',
              taxcode: item.gst || '',
              unit: 'PCS', // Default
            },
            qty: item.qty
          }));

          // 2. Save to cart storage
          await AsyncStorage.setItem(cartKey, JSON.stringify(cartItems));

          // 3. Remove from local orders
          const updatedOrders = orders.filter(o => o.id !== order.id);
          const storageKey = `placed_sales_${currentUsername}`;
          await AsyncStorage.setItem(storageKey, JSON.stringify(updatedOrders));
          setOrders(updatedOrders);

          // 4. Navigate to SalesDetails
          router.push({
            pathname: "/Sales/SalesDetails",
            params: {
              area: order.area,
              customer: order.customer,
              customerCode: order.customerCode,
              type: order.type,
              payment: order.payment
            }
          });
        } catch (error) {
          console.error("Edit Sales Error:", error);
          Alert.alert("Error", "Failed to move sales entry to cart.");
        }
      };

      if (existingCart.length > 0) {
        Alert.alert(
          "Cart Not Empty",
          "There are already items in your cart. What would you like to do?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Place Existing Cart",
              onPress: () => {
                router.push({
                  pathname: "/Sales/SalesDetails",
                  params: {
                    area: order.area,
                    customer: order.customer,
                    customerCode: order.customerCode,
                    type: order.type,
                    payment: order.payment
                  }
                });
              }
            },
            {
              text: "Continue (Clear Cart)",
              onPress: proceedWithEdit,
              style: "destructive"
            }
          ]
        );
      } else {
        Alert.alert(
          "Edit Sales Entry",
          "Move this entry to cart for editing? It will be removed from the pending list.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Edit", onPress: proceedWithEdit }
          ]
        );
      }
    } catch (error) {
      console.error("Check Cart Error:", error);
      Alert.alert("Error", "Could not check existing cart status.");
    }
  };

  function renderOrderCard({ item: order }) {
    const isExpanded = expandedOrder === order.id;
    const statusConfig = getStatusBadgeConfig(order.status || order.uploadStatus);
    const isApi = order.isApiOrder;

    return (
      <View style={styles.orderCard}>
        <TouchableOpacity
          style={styles.orderHeader}
          onPress={() => selectionMode ? toggleOrderSelection(order.id) : toggleOrder(order.id)}
          activeOpacity={0.7}
        >
          <View style={styles.orderHeaderLeft}>
            {selectionMode && (
              <View style={{ marginRight: 10 }}>
                <Ionicons
                  name={selectedOrders.includes(order.id) ? "checkbox" : "square-outline"}
                  size={24}
                  color={Colors.success.main}
                />
              </View>
            )}
            <LinearGradient
              colors={statusConfig.gradient}
              style={styles.statusBadge}
            >
              <Ionicons name={statusConfig.icon} size={16} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.customerNameBold}>{order.customer}</Text>
              <Text style={styles.orderDetails}>
                {order.area} • {order.payment}
              </Text>
              <View style={styles.statusRow}>
                <Text style={styles.orderTime}>{formatDate(order.timestamp)}</Text>
                <Text style={[styles.statusText, { color: statusConfig.gradient[0] }]}>
                  • {statusConfig.text}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.orderHeaderRight}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!isApi && filterStatus !== 'saved' && filterStatus !== 'uploaded' && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleEditOrder(order);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="pencil-outline" size={20} color={Colors.success.main} />
                </TouchableOpacity>
              )}
              <Text style={styles.orderTotal}>{(order.total || 0).toFixed(2)}</Text>
            </View>
            <Text style={styles.itemCount}>{(order.items || []).length} items</Text>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.text.tertiary}
              style={{ marginTop: 4 }}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.orderBody}>
            <View style={styles.divider} />
            {(order.items || []).map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={{ fontSize: 11, color: Colors.text.secondary, marginTop: 2, marginBottom: 2 }}>
                    Code: {item.code}
                  </Text>
                  <Text style={styles.itemPrice}>{(item.price || 0).toFixed(2)} x {(parseFloat(item.qty) || 0).toFixed(3)}</Text>
                </View>
                <Text style={styles.itemTotal}>{(item.total || 0).toFixed(2)}</Text>
              </View>
            ))}

            <View style={{ marginTop: 15, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {!isApi && filterStatus === 'pending' && (
                <TouchableOpacity style={styles.actionButton} onPress={() => deleteOrder(order.id)}>
                  <LinearGradient colors={Gradients.danger} style={styles.actionButtonGradient}>
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionButton} onPress={() => handleSharePDF(order)}>
                <LinearGradient colors={[Colors.secondary.main, Colors.secondary[700]]} style={styles.actionButtonGradient}>
                  <Ionicons name="share-social" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>PDF</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handlePrint(order)}>
                <LinearGradient colors={[Colors.success.main, Colors.success[700]]} style={styles.actionButtonGradient}>
                  <Ionicons name="print" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Print</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handleDownloadJSON(order)}>
                <LinearGradient colors={[Colors.neutral[600], Colors.neutral[800]]} style={styles.actionButtonGradient}>
                  <Ionicons name="code-working" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>JSON</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* {!isApi && filterStatus !== 'saved' && filterStatus !== 'uploaded' && (
                <TouchableOpacity style={styles.actionButton} onPress={() => handleEditOrder(order)}>
                  <LinearGradient colors={[Colors.success.main, Colors.success[700]]} style={styles.actionButtonGradient}>
                    <Ionicons name="pencil" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )} */}


              {filterStatus === 'saved' && (
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: Colors.warning.main, borderWidth: 1 }]}
                  onPress={() => handleRevert(order)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6 }}>
                    <Ionicons name="refresh-circle-outline" size={20} color={Colors.warning.main} />
                    <Text style={{ color: Colors.warning.main, fontWeight: '700', fontSize: 13 }}>
                      Revert {revertClicks[order.id] > 0 ? `(${revertClicks[order.id]})` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {!isApi && filterStatus !== 'saved' && (filterStatus === 'pending' || filterStatus === 'failed') && (
                <TouchableOpacity
                  style={[styles.actionButton, uploadingOrder && styles.disabledButton]}
                  onPress={() => confirmOrder(order.id)}
                  disabled={!!uploadingOrder}
                >
                  <LinearGradient colors={uploadingOrder ? [Colors.neutral[300], Colors.neutral[300]] : Gradients.success} style={styles.actionButtonGradient}>
                    {uploadingOrder === order.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="cloud-upload" size={18} color="#fff" />
                    )}
                    <Text style={styles.actionButtonText}>
                      {uploadingOrder === order.id ? 'Syncing...' : 'Sync'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

            </View>
          </View>
        )
        }
      </View >
    );
  }

  const pendingCount = orders.filter(o => !o.uploadStatus || o.uploadStatus === 'pending').length;
  const failedCount = orders.filter(o => o.uploadStatus === 'failed').length;
  const uploadedCount = uploadedOrders.length;

  return (
    <LinearGradient colors={Gradients.background} style={styles.mainContainer}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.success.main} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Sales Management</Text>
            <Text style={styles.headerSubtitle}>Manage & Track Sales</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {filterStatus === 'pending' && (
              <TouchableOpacity
                style={[styles.iconButton, selectionMode && { backgroundColor: Colors.success[100] }]}
                onPress={toggleSelectionMode}
              >
                <Ionicons name={selectionMode ? "close" : "checkbox"} size={22} color={Colors.success.main} />
                <Text style={{ marginLeft: 5, color: Colors.success.main, fontWeight: '600' }}>
                  {selectionMode ? "Cancel" : "Select"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconButton} onPress={handleRefresh}>
              <Ionicons name="refresh" size={22} color={Colors.success.main} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.replace('/(tabs)/Home')}>
              <Ionicons name="home" size={22} color={Colors.success.main} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
            <TouchableOpacity style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]} onPress={() => setFilterStatus('pending')}>
              <Ionicons name="time" size={16} color={filterStatus === 'pending' ? '#FFF' : Colors.warning.main} />
              <Text style={[styles.filterTabText, filterStatus === 'pending' && styles.filterTabTextActive]}>Pending ({pendingCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, filterStatus === 'uploaded' && styles.filterTabActive]} onPress={() => setFilterStatus('uploaded')}>
              <Ionicons name="cloud-done" size={16} color={filterStatus === 'uploaded' ? '#FFF' : Colors.success.main} />
              <Text style={[styles.filterTabText, filterStatus === 'uploaded' && styles.filterTabTextActive]}>Uploaded ({uploadedCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, filterStatus === 'failed' && styles.filterTabActive]} onPress={() => setFilterStatus('failed')}>
              <Ionicons name="alert-circle" size={16} color={filterStatus === 'failed' ? '#FFF' : Colors.error.main} />
              <Text style={[styles.filterTabText, filterStatus === 'failed' && styles.filterTabTextActive]}>Failed ({failedCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterTab, filterStatus === 'saved' && styles.filterTabActive]} onPress={() => setFilterStatus('saved')}>
              <Ionicons name="save" size={16} color={filterStatus === 'saved' ? '#FFF' : '#3498db'} />
              <Text style={[styles.filterTabText, filterStatus === 'saved' && styles.filterTabTextActive]}>Saved ({savedOrders.length})</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.container}>
          {loadingUploaded && filterStatus === 'uploaded' ? (
            <View style={[styles.emptyState, { justifyContent: 'center' }]}>
              <ActivityIndicator size="large" color={Colors.success.main} />
              <Text style={{ marginTop: 10, color: Colors.text.secondary }}>Loading from Server...</Text>
            </View>
          ) : (
            <FlatList
              data={displayOrders}
              keyExtractor={(item) => item.id}
              renderItem={renderOrderCard}
              contentContainerStyle={styles.listContent}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={60} color={Colors.neutral[300]} />
                  <Text style={styles.emptyTitle}>No sales found</Text>
                </View>
              }
            />
          )}
        </View>

        {selectionMode && (
          <View style={styles.bulkActionBar}>
            <TouchableOpacity onPress={selectAllOrders} style={styles.bulkActionSelectAll}>
              <Ionicons
                name={selectedOrders.length === displayOrders.length ? "checkbox" : "square-outline"}
                size={24}
                color={Colors.success.main}
              />
              <Text style={styles.bulkActionText}>Select All ({selectedOrders.length})</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={handleBulkDelete} style={styles.bulkActionButton}>
                <LinearGradient colors={Gradients.danger} style={styles.actionButtonGradient}>
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Delete</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBulkUpload} style={styles.bulkActionButton}>
                <LinearGradient colors={Gradients.success} style={styles.actionButtonGradient}>
                  <Ionicons name="cloud-upload" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>Upload</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Modal
          visible={printerModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setPrinterModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Printer</Text>
                <TouchableOpacity onPress={() => setPrinterModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 15, gap: 10 }}>
                  <TouchableOpacity onPress={() => scanPrinters('ble')} style={{ padding: 8, backgroundColor: connectionType === 'ble' ? Colors.success.light : Colors.neutral[100], borderRadius: 5 }}>
                    <Text>Bluetooth</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => scanPrinters('usb')} style={{ padding: 8, backgroundColor: connectionType === 'usb' ? Colors.success.light : Colors.neutral[100], borderRadius: 5 }}>
                    <Text>USB</Text>
                  </TouchableOpacity>
                </View>

                {isScanningPrinters ? <ActivityIndicator color={Colors.success.main} /> : null}

                <FlatList
                  data={printers}
                  keyExtractor={item => item.inner_mac_address || item.vendor_id || Math.random().toString()}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={{ padding: 15, borderBottomWidth: 1, borderColor: '#eee' }} onPress={() => connectAndPrint(item)}>
                      <Text style={{ fontWeight: 'bold' }}>{item.device_name || item.product_name || "Unknown"}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>{item.inner_mac_address || item.vendor_id}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginTop: 30,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  headerSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  iconButton: {
    padding: 8,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
  },

  filterContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.border.light,
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: Colors.success.main,
    borderColor: Colors.success.main,
  },
  filterTabText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: '#FFF',
  },

  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  listContent: {
    paddingBottom: 20,
    paddingTop: Spacing.sm,
  },

  orderCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  orderHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerNameBold: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  orderDetails: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  orderTime: {
    fontSize: 10,
    color: Colors.text.tertiary,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  orderHeaderRight: {
    alignItems: 'flex-end',
  },
  orderTotal: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.success.main,
  },
  itemCount: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    marginTop: 2,
  },

  orderBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.neutral[50],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.light,
    marginBottom: Spacing.md,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
    backgroundColor: '#FFF',
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: 8,
  },
  itemName: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  itemPrice: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.success.main,
    minWidth: 60,
    textAlign: 'right',
  },

  actionButtons: {
    marginTop: Spacing.md,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
    paddingTop: 50,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 10,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  bulkActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 20,
    paddingBottom: 65,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadows.medium
  },
  bulkActionSelectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  bulkActionText: {
    fontSize: 16,
    color: Colors.text.primary,
    fontWeight: '600'
  },
  bulkActionButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    minWidth: 120,
  },
});