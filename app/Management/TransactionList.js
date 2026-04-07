import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";
import pdfService from "../../src/services/pdfService";
import printerService from "../../src/services/printerService";

// LayoutAnimation setup for Android
if (Platform.OS === 'android' && UIManager && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function TransactionListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type, category } = useLocalSearchParams(); // type: 'pending' | 'uploaded'

  // Data State
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  // Printer/PDF states
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [connectionType, setConnectionType] = useState('ble');
  const [itemToPrint, setItemToPrint] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [type, category]);

  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = items.filter(item => 
      (item.customer || "").toLowerCase().includes(query) ||
      (item.id || "").toString().toLowerCase().includes(query)
    );
    setFilteredItems(filtered);
  }, [searchQuery, items]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const username = await AsyncStorage.getItem("username");
      const clientId = await AsyncStorage.getItem("client_id");
      const token = await AsyncStorage.getItem("authToken");

      if (type === 'pending') {
        let storageKey = "";
        if (category === 'Order') storageKey = `placed_orders_${username}`;
        else if (category === 'Sales') storageKey = `placed_sales_${username}`;
        else if (category === 'Return') storageKey = `return_orders_${username}`;
        else if (category === 'Collection') {
          await dbService.init();
          const pendingCollections = await dbService.getOfflineCollections(0);
          
          const currentUsername = username?.toLowerCase().trim();
          const mapped = pendingCollections
            .filter(item => {
              if (!item.username) return true; // Show legacy items to avoid data loss
              return item.username.toLowerCase().trim() === currentUsername;
            })
            .map(item => ({
            ...item,
            id: item.local_id || item.id,
            customer: item.customer_name,
            total: parseFloat(item.amount || 0),
            type: 'Collection',
            timestamp: item.date || new Date().toISOString(),
            isPending: true
          }));
          setItems(mapped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
          setLoading(false);
          return;
        }

        const stored = await AsyncStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored).map(item => ({
            ...item,
            isPending: true,
            total: parseFloat(item.total || 0),
            type: category
          }));
          setItems(parsed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        } else {
          setItems([]);
        }
      } else {
        // Uploaded Section
        let url = "";
        if (category === 'Order') url = `https://tasksas.com/api/item-orders/list-all?client_id=${clientId}`;
        else if (category === 'Sales') url = `https://tasksas.com/api/sales/list-all`;
        else if (category === 'Return') url = `https://tasksas.com/api/sales-return/list-all?client_id=${clientId}`;
        else if (category === 'Collection') url = `https://tasksas.com/api/collection/list/`;

        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (resp.ok) {
          const json = await resp.json();
          let apiData = [];
          if (category === 'Order') apiData = json.orders || [];
          else if (category === 'Sales') apiData = json.sales || [];
          else if (category === 'Return') apiData = json.returns || [];
          else if (category === 'Collection') apiData = json.data || [];

          const currentUsername = username?.toLowerCase().trim();
          const mapped = apiData
            .filter(item => {
              // Special case for Collections which uses 'created_by'
              const apiUser = (category === 'Collection' ? item.created_by : item.username) || '';
              return apiUser.toLowerCase().trim() === currentUsername;
            })
            .map(apiItem => {
              if (category === 'Collection') {
                return {
                  id: apiItem.id,
                  customer: apiItem.name,
                  customerCode: apiItem.code,
                  total: parseFloat(apiItem.amount || 0),
                  type: 'Collection',
                  timestamp: apiItem.created_date ? `${apiItem.created_date}T${apiItem.created_time || '00:00:00'}` : new Date().toISOString(),
                  isUploaded: true,
                  payment_type: apiItem.type,
                  remarks: apiItem.remark
                };
              }
              const items = apiItem.items || [];
              const calcTotal = items.reduce((sum, it) => sum + (parseFloat(it.amount || it.total || 0)), 0);
              return {
                id: apiItem.order_id || apiItem.sales_id || apiItem.id,
                customer: apiItem.customer_name,
                customerCode: apiItem.customer_code,
                total: calcTotal || parseFloat(apiItem.total || 0),
                timestamp: (apiItem.created_date && apiItem.created_time) ? `${apiItem.created_date}T${apiItem.created_time}` : new Date().toISOString(),
                isUploaded: true,
                type: category,
                items: items.map(it => ({
                  name: it.product_name || it.name,
                  qty: parseFloat(it.quantity || it.qty || 0),
                  price: parseFloat(it.price || 0),
                  total: parseFloat(it.amount || it.total || 0)
                }))
              };
            });
          setItems(mapped.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)));
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      Alert.alert("Error", "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedIds(newSelection);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleBulkSync = async () => {
    if (selectedIds.size === 0) return;
    
    Alert.alert(
      "Bulk Sync",
      `Are you sure you want to sync ${selectedIds.size} transactions?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Sync Now", 
          onPress: async () => {
            setIsBulkSyncing(true);
            setSyncProgress({ current: 0, total: selectedIds.size });
            
            const toSync = items.filter(item => selectedIds.has(item.id));
            let successCount = 0;
            let failedCount = 0;
            
            for (const item of toSync) {
              const success = await syncSingleItem(item, false); // Don't show alert during bulk sync
              if (success) {
                successCount++;
              } else {
                failedCount++;
              }
              setSyncProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
            
            setIsBulkSyncing(false);
            setSelectedIds(new Set());
            fetchData();
            
            if (failedCount === 0) {
              Alert.alert("Sync Complete", `Successfully synced ${successCount} transactions.`);
            } else {
              Alert.alert("Sync Results", `${successCount} items synced, ${failedCount} failed to sync.`);
            }
          }
        }
      ]
    );
  };

  const syncSingleItem = async (item, showError = true) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const deviceId = await AsyncStorage.getItem("deviceId");
      const username = await AsyncStorage.getItem("username");
      const clientId = await AsyncStorage.getItem("client_id");

      let url = "";
      let payload = {};

      const cleanString = (str) => String(str || "").trim();
      const cleanNumber = (num) => {
        const n = parseFloat(num);
        return isNaN(n) ? 0 : n;
      };

      if (item.type === "Collection") {
        url = "https://tasksas.com/api/collection/create/";
        // Use raw field names from SQL result (...item in fetchData)
        const uploadData = {
          code: cleanString(item.customer_code || ""),
          name: cleanString(item.customer_name || ""),
          place: cleanString(item.customer_place || ""),
          phone: cleanString(item.customer_phone || ""),
          amount: cleanNumber(item.amount),
          type: cleanString(item.payment_type || "Cash"),
        };

        if (item.payment_type === "Cheque" || item.cheque_number) {
          uploadData.cheque_no = cleanString(item.cheque_number || "");
          uploadData.ref_no = cleanString(item.ref_no || uploadData.cheque_no);
        } else if (item.ref_no) {
          uploadData.ref_no = cleanString(item.ref_no);
        }

        if (item.remarks) {
          uploadData.remark = cleanString(item.remarks);
        }
        payload = uploadData;
      } else {
        const categoryPath =
          item.type === "Order"
            ? "item-orders"
            : item.type === "Sales"
            ? "sales"
            : "sales-return";
        url = `https://tasksas.com/api/${categoryPath}/create`;

        const validItems = (item.items || []).map((it) => ({
          product_name: cleanString(it.name || it.product_name),
          item_code: cleanString(it.code || it.item_code),
          barcode: cleanString(it.barcode || it.code || it.item_code),
          price: cleanNumber(it.price),
          quantity: cleanNumber(it.qty || it.quantity).toFixed(3),
          amount: cleanNumber(it.total || it.amount),
          hsn: cleanString(it.hsn),
          gst: cleanString(it.gst)
        }));

        payload = {
          device_id: deviceId || "unknown",
          customer_name: cleanString(item.customer),
          customer_code: cleanString(item.customerCode),
          username: cleanString(username),
          area: cleanString(item.area),
          payment_type: cleanString(item.payment || item.payment_type),
          remark: cleanString(item.remark || item.remarks),
          items: validItems
        };

        if (item.type === "Order") {
          payload.client_id = cleanString(clientId);
        }
      }

      console.log(`[Sync] Uploading ${item.type}:`, JSON.stringify(payload, null, 2));

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await resp.json();
      console.log(`[Sync] Response for ${item.type}:`, result);

      if (resp.ok) {
        if (item.type === "Collection") {
          await dbService.init();
          // Exactly as in Upload.js
          const localId = item.local_id;
          if (localId) {
            await dbService.markCollectionAsSynced(localId);
          } else {
            // Fallback for objects that might not have local_id explicitly at top level
            await dbService.updateCollectionSyncStatus(item.id, 1);
          }
        } else {
          // Robust result.success check for Orders/Sales
          if (result && result.success) {
            const storageKey =
              item.type === "Order"
                ? `placed_orders_${username}`
                : item.type === "Sales"
                ? `placed_sales_${username}`
                : `return_orders_${username}`;
            const stored = await AsyncStorage.getItem(storageKey);
            if (stored) {
              const filtered = JSON.parse(stored).filter((it) => it.id !== item.id);
              await AsyncStorage.setItem(storageKey, JSON.stringify(filtered));
            }
          } else {
            const errorMsg = result?.message || result?.detail || result?.error || "Sync failed";
            if (showError) Alert.alert(`${item.type} Sync Failed`, errorMsg);
            return false;
          }
        }
        return true;
      }
      const errorMsg = result?.message || result?.detail || result?.error || `Upload failed: ${resp.status}`;
      if (showError) Alert.alert(`${item.type} Sync Failed`, errorMsg);
      return false;
    } catch (e) {
      console.error("Sync error:", e);
      if (showError) Alert.alert("Sync error", e.message || "An unexpected error occurred during synchronization.");
      return false;
    }
  };

  const handlePrint = async (item) => {
    try {
      const salesmanName = await AsyncStorage.getItem('username') || '';
      const formType = await AsyncStorage.getItem('settings_print_form_type') || 'form1';
      const toPrint = {
        ...item,
        receiptTitle: `${item.type} Receipt`,
        salesman: salesmanName,
        items: item.items || [],
        customer_name: item.customer,
        customer_code: item.customerCode,
        amount: item.total
      };

      if (printerService.connected) {
        if (item.type === 'Collection') await printerService.printCollectionReceipt(toPrint);
        else if (formType === 'form3') await printerService.printOrderForm3(toPrint);
        else if (formType === 'form2') await printerService.printOrderForm2(toPrint);
        else await printerService.printOrder(toPrint);
      } else {
        setItemToPrint({ ...toPrint, _mode: item.type === 'Collection' ? 'collection' : 'transaction', _formType: formType });
        setPrinterModalVisible(true);
        scanPrinters('ble');
      }
    } catch (e) {
      Alert.alert("Error", "Print failed.");
    }
  };

  const scanPrinters = async (t) => {
    setIsScanningPrinters(true);
    setPrinters([]);
    setConnectionType(t);
    const res = await printerService.getDeviceList(t);
    setPrinters(Array.isArray(res) ? res : []);
    setIsScanningPrinters(false);
  };

  const connectAndPrint = async (p) => {
    if (await printerService.connect(p)) {
      setPrinterModalVisible(false);
      if (itemToPrint) {
        setTimeout(async () => {
          if (itemToPrint._mode === 'collection') await printerService.printCollectionReceipt(itemToPrint);
          else {
            if (itemToPrint._formType === 'form3') await printerService.printOrderForm3(itemToPrint);
            else if (itemToPrint._formType === 'form2') await printerService.printOrderForm2(itemToPrint);
            else await printerService.printOrder(itemToPrint);
          }
        }, 500);
      }
    } else Alert.alert("Error", "Connect failed");
  };

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity 
        style={[styles.itemCard, isSelected && styles.itemCardSelected]}
        onPress={() => type === 'pending' ? toggleSelection(item.id) : null}
        activeOpacity={0.7}
      >
        <View style={styles.itemMain}>
          {type === 'pending' && (
            <TouchableOpacity onPress={() => toggleSelection(item.id)} style={styles.checkbox}>
              <Ionicons 
                name={isSelected ? "checkbox" : "square-outline"} 
                size={24} 
                color={isSelected ? Colors.primary.main : Colors.neutral[300]} 
              />
            </TouchableOpacity>
          )}
          
          <View style={styles.itemInfo}>
            <Text style={styles.customerName} numberOfLines={1}>{item.customer}</Text>
            <Text style={styles.itemMeta}>#{item.id} • {new Date(item.timestamp).toLocaleTimeString()}</Text>
          </View>

          <View style={styles.itemRight}>
            <Text style={styles.amountText}>₹{item.total?.toFixed(0)}</Text>
            <View style={[styles.statusTag, { backgroundColor: type === 'pending' ? Colors.warning[50] : Colors.success[50] }]}>
              <Text style={[styles.statusText, { color: type === 'pending' ? Colors.warning.main : Colors.success.main }]}>
                {type === 'pending' ? 'Pending' : 'Synced'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.itemActions}>
          <TouchableOpacity style={styles.actionIconButton} onPress={() => handlePrint(item)}>
            <Ionicons name="print-outline" size={20} color={Colors.primary.main} />
            <Text style={styles.actionIconLabel}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIconButton} onPress={() => { setIsSharing(true); type === 'Collection' ? pdfService.shareCollectionPDF(item).finally(()=>setIsSharing(false)) : pdfService.shareOrderPDF(item).finally(()=>setIsSharing(false)) }}>
            <Ionicons name="share-social-outline" size={20} color={Colors.secondary.main} />
            <Text style={styles.actionIconLabel}>Share</Text>
          </TouchableOpacity>
          {type === 'pending' && (
            <TouchableOpacity style={styles.actionIconButton} onPress={() => syncSingleItem(item).then(res => { if(res) fetchData(); })}>
              <Ionicons name="cloud-upload-outline" size={20} color={Colors.success.main} />
              <Text style={styles.actionIconLabel}>Sync</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.primary} style={[styles.header, { paddingTop: Math.max(insets.top, 15) }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>{type === 'pending' ? 'Pending' : 'Uploaded'} {category}s</Text>
            <Text style={styles.headerSubtitle}>{items.length} total items</Text>
          </View>
          {type === 'pending' && items.length > 0 && (
            <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>{selectedIds.size === filteredItems.length ? "Deselect" : "Select All"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.text.tertiary} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search by customer or ID..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={item => item.id?.toString()}
          contentContainerStyle={[
            styles.listContent, 
            { paddingBottom: Math.max(insets.bottom, 20) + 100 }
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={Colors.neutral[200]} />
              <Text style={styles.emptyText}>No {category.toLowerCase()}s found</Text>
            </View>
          }
        />
      )}

      {selectedIds.size > 0 && (
        <View style={[styles.bulkActionBar, { bottom: Math.max(insets.bottom, 20) + 15 }]}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <TouchableOpacity style={styles.bulkSyncBtn} onPress={handleBulkSync}>
            <Ionicons name="cloud-upload" size={20} color="#FFF" />
            <Text style={styles.bulkSyncText}>Sync All</Text>
          </TouchableOpacity>
        </View>
      )}

      {isBulkSyncing && (
        <View style={styles.overlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color={Colors.primary.main} />
            <Text style={styles.progressText}>Syncing Transactions...</Text>
            <Text style={styles.progressSubtext}>{syncProgress.current} / {syncProgress.total}</Text>
          </View>
        </View>
      )}

      {/* Printer Modal (Reused) */}
      <Modal visible={printerModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.printerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Printer</Text>
              <TouchableOpacity onPress={() => setPrinterModalVisible(false)}><Ionicons name="close" size={24} /></TouchableOpacity>
            </View>
            <View style={styles.printerToggleRow}>
              <TouchableOpacity onPress={() => scanPrinters('ble')} style={[styles.pToggleButton, connectionType === 'ble' && styles.pToggleButtonActive]}><Text>Bluetooth</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => scanPrinters('usb')} style={[styles.pToggleButton, connectionType === 'usb' && styles.pToggleButtonActive]}><Text>USB</Text></TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight: 300}}>
              {printers.map((p, i) => (
                <TouchableOpacity key={i} style={styles.printerItem} onPress={() => connectAndPrint(p)}>
                  <Text>{p.device_name || p.product_id}</Text>
                  <Ionicons name="chevron-forward" size={16} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.rescanBtn} onPress={() => scanPrinters(connectionType)}><Text style={{color:Colors.primary.main}}>Rescan</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: { paddingBottom: 20 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  backButton: { marginRight: 15 },
  headerTitles: { flex: 1 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  selectAllBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  selectAllText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', margin: 15, paddingHorizontal: 15, borderRadius: 12, height: 48, ...Shadows.sm },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
  listContent: { padding: 15, paddingBottom: 100 },
  itemCard: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 15, ...Shadows.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  itemCardSelected: { borderColor: Colors.primary.main, backgroundColor: Colors.primary[50] },
  itemMain: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  checkbox: { marginRight: 12 },
  itemInfo: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  itemMeta: { fontSize: 12, color: Colors.text.tertiary },
  itemRight: { alignItems: 'flex-end' },
  amountText: { fontSize: 17, fontWeight: '800', color: Colors.primary.main, marginBottom: 4 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  itemActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F0F0F0', backgroundColor: '#FAFAFA' },
  actionIconButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  actionIconLabel: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },
  bulkActionBar: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: Colors.text.primary, height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, ...Shadows.xl },
  selectionCount: { color: '#FFF', flex: 1, fontSize: 16, fontWeight: '600' },
  bulkSyncBtn: { backgroundColor: Colors.success.main, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25 },
  bulkSyncText: { color: '#FFF', fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { marginTop: 15, color: Colors.text.tertiary, fontSize: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  progressCard: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, alignItems: 'center', width: '80%' },
  progressText: { fontSize: 18, fontWeight: '700', marginTop: 20 },
  progressSubtext: { fontSize: 14, color: Colors.text.tertiary, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  printerModal: { backgroundColor: '#FFF', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  printerToggleRow: { flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 12, padding: 4, marginBottom: 20 },
  pToggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  pToggleButtonActive: { backgroundColor: '#FFF', ...Shadows.sm },
  printerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rescanBtn: { marginTop: 20, alignItems: 'center' },
});
