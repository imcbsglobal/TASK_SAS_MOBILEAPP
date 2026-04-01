// app/Collection/View-Collection.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";
import pdfService from "../../src/services/pdfService";
import printerService from "../../src/services/printerService";

const API_COLLECTION_LIST = "https://tasksas.com/api/collection/list/";

export default function ViewCollectionScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collections, setCollections] = useState([]);
  const [filteredCollections, setFilteredCollections] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPaymentType, setFilterPaymentType] = useState("all");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);

  // Printer State
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [connectionType, setConnectionType] = useState('ble'); // 'ble' | 'usb'
  const [selectedCollectionToPrint, setSelectedCollectionToPrint] = useState(null);

  const [stats, setStats] = useState({
    total: 0,
    synced: 0,
    pending: 0,
    totalAmount: 0,
    syncedAmount: 0,
    pendingAmount: 0,
  });

  useEffect(() => {
    checkNetworkStatus();
    loadCollections();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [collections, searchQuery, filterStatus, filterPaymentType]);

  const checkNetworkStatus = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected);
  };

  const loadCollections = async () => {
    try {
      if (loading) setLoading(true);

      const token = await AsyncStorage.getItem("authToken");

      if (!token || !isOnline) {
        // Fallback or empty if offline/no token, but user requested API direct
        if (!isOnline) {
          Alert.alert("Offline", "You are offline. Cannot fetch collections from server.");
          setLoading(false);
          return;
        }
      }

      console.log("[View-Collection] Fetching from API...");
      const response = await fetch(API_COLLECTION_LIST, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const username = await AsyncStorage.getItem("username");

      const json = await response.json();

      if (json.success && Array.isArray(json.data)) {
        console.log("Current User:", username);

        const mapped = json.data
          .filter(item => {
            if (!username) return false;
            // API uses 'created_by' for the uploader's name
            const apiUser = item.created_by ? String(item.created_by).trim() : '';
            const currentUser = String(username).trim();
            return apiUser.toLowerCase() === currentUser.toLowerCase();
          })
          .map(item => ({
            id: item.id,
            code: item.code, // IMPORTANT: Voucher Code
            customer_name: item.name,
            customer_code: item.code,
            customer_place: item.place,
            customer_phone: item.phone,
            amount: item.amount,
            payment_type: item.type,
            cheque_number: item.cheque_no,
            ref_no: item.ref_no,
            remarks: item.remark, // Note: Upload.js maps to 'remark', API sends 'remark'
            synced: 1, // API data is always synced
            date: item.created_date ? `${item.created_date}T${item.created_time || '00:00:00'}` : new Date().toISOString()
          }));

        const sortedCollections = mapped.sort((a, b) => {
          return new Date(b.date) - new Date(a.date);
        });

        // 3. Fetch local PENDING collections
        await dbService.init();
        const pendingLocal = await dbService.getOfflineCollections(0); // 0 means unsynced
        console.log("[View-Collection] Found local pending:", pendingLocal.length);

        const mappedPending = pendingLocal.map(item => ({
          ...item,
          synced: 0,
          id: item.local_id || item.id,
          date: item.date || new Date().toISOString()
        }));

        // Merge both
        const allCollections = [...mappedPending, ...sortedCollections];

        setCollections(allCollections);
        calculateStats(allCollections);
      } else {
        console.log("API response not success or no data", json);
        // Still try to show local pending if API fails
        await dbService.init();
        const pendingLocal = await dbService.getOfflineCollections(0);
        const mappedPending = pendingLocal.map(item => ({
          ...item,
          synced: 0,
          id: item.local_id || item.id
        }));
        setCollections(mappedPending);
        calculateStats(mappedPending);
      }
    } catch (error) {
      console.error("[View-Collection] Error loading collections:", error);
      Alert.alert("Error", "Failed to load collections from server.");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCollections();
    setRefreshing(false);
  }, []);

  const calculateStats = (data) => {
    const syncedItems = data.filter(item => item.synced === 1);
    const pendingItems = data.filter(item => item.synced === 0);

    const totalAmount = data.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const syncedAmount = syncedItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const pendingAmount = pendingItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);

    setStats({
      total: data.length,
      synced: syncedItems.length,
      pending: pendingItems.length,
      totalAmount,
      syncedAmount,
      pendingAmount,
    });
  };

  const applyFilters = () => {
    let filtered = [...collections];

    // Filter by sync status
    if (filterStatus === "synced") {
      filtered = filtered.filter(item => item.synced === 1);
    } else if (filterStatus === "pending") {
      filtered = filtered.filter(item => item.synced === 0);
    }

    // Filter by payment type
    if (filterPaymentType === "cash") {
      filtered = filtered.filter(item => item.payment_type && item.payment_type.toLowerCase() === "cash");
    } else if (filterPaymentType === "check") {
      filtered = filtered.filter(item => {
        const type = item.payment_type ? item.payment_type.toLowerCase() : '';
        return type === "check" || type === "cheque";
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        (item.customer_name && item.customer_name.toLowerCase().includes(query)) ||
        (item.customer_code && item.customer_code.toLowerCase().includes(query)) ||
        (item.cheque_number && item.cheque_number.toLowerCase().includes(query)) ||
        (item.remarks && item.remarks.toLowerCase().includes(query)) ||
        (item.code && item.code.toLowerCase().includes(query))
      );
    }

    setFilteredCollections(filtered);
    const total = filtered.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    setFilteredTotal(total);
  };

  const handleDelete = (collection) => {
    // API Deletion? User didn't specify. Assuming existing delete logic (local DB) 
    // BUT we are viewing API data. 
    // Safe to disable delete or implement API delete if needed. 
    // The user didn't ask for API delete, but the button is there.
    // I will comment out the delete action or show alert that it's server data.
    Alert.alert("Info", "Deletion from server is not enabled in this view.");
  };

  const handleViewDetails = (collection) => {
    setSelectedCollection(collection);
    setShowDetailModal(true);
  };

  // --- Printer & PDF Logic ---

  const handlePrint = async (collection) => {
    try {
      if (printerService.connected) {
        Alert.alert("Printing", "Sending data to printer...");
        await printerService.printCollectionReceipt(collection);
      } else {
        setSelectedCollectionToPrint(collection);
        setPrinterModalVisible(true);
        scanPrinters('ble');
      }
    } catch (error) {
      console.error("Print initiation error:", error);
      Alert.alert("Error", "Failed to initiate printing");
    }
  };

  const scanPrinters = async (type = connectionType) => {
    setIsScanningPrinters(true);
    setPrinters([]);
    setConnectionType(type);
    try {
      const result = await printerService.getDeviceList(type);
      if (result && result.error === 'BLUETOOTH_OFF') {
        Alert.alert("Bluetooth Off", "Please turn on Bluetooth in your device settings to scan for printers.");
        setPrinters([]);
      } else if (result && result.error === 'PERMISSIONS_DENIED') {
        Alert.alert("Permissions Required", "Bluetooth permissions are required to scan for printers.");
        setPrinters([]);
      } else {
        setPrinters(Array.isArray(result) ? result : []);
      }
    } catch (e) {
      console.error("[Printer] Scan UI error:", e);
      Alert.alert("Error", "Failed to scan for printers");
    } finally {
      setIsScanningPrinters(false);
    }
  };

  const connectAndPrintCollection = async (printer) => {
    try {
      const connected = await printerService.connect(printer);
      if (connected) {
        setPrinterModalVisible(false);
        if (selectedCollectionToPrint) {
          setTimeout(async () => {
            await printerService.printCollectionReceipt(selectedCollectionToPrint);
            setSelectedCollectionToPrint(null);
          }, 500);
        }
      } else {
        Alert.alert("Connection Failed", "Could not connect to selected printer");
      }
    } catch (e) {
      Alert.alert("Error", "Connection failed");
    }
  };

  const handleSharePDF = async (collection) => {
    try {
      await pdfService.shareCollectionPDF(collection);
    } catch (error) {
      Alert.alert("Error", "Failed to share PDF");
    }
  };

  // ---------------------------

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const renderStatCard = (title, value, subtitle, colorStart, colorEnd, icon) => (
    <View style={styles.statCardContainer}>
      <LinearGradient
        colors={[colorStart, colorEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statCard}
      >
        <View style={styles.statIconContainer}>
          <Ionicons name={icon} size={20} color="#FFF" />
        </View>
        <View>
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statTitle}>{title}</Text>
          <Text style={styles.statSubtitle}>{subtitle}</Text>
        </View>
      </LinearGradient>
    </View>
  );

  const renderCollectionItem = ({ item, index }) => (
    <View style={styles.collectionCard}>
      <TouchableOpacity
        style={styles.cardContent}
        onPress={() => handleViewDetails(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.statusIndicator, item.synced === 1 ? styles.syncedDot : styles.pendingDot]} />

          <View style={styles.collectionDetails}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customer_name}
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.customerCode}>{item.customer_code}</Text>
              <Text style={styles.dotSeparator}>•</Text>
              <Text style={styles.dateText}>{formatDate(item.date)}</Text>
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: Colors.neutral[100] }]}>
                <Text style={[styles.badgeText, { color: Colors.text.secondary }]}>
                  {item.payment_type}
                </Text>
              </View>
              {item.synced === 1 ? (
                <View style={[styles.badge, { backgroundColor: Colors.success[50] }]}>
                  <Text style={[styles.badgeText, { color: Colors.success.main }]}>SYNCED</Text>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: Colors.warning[50] }]}>
                  <Text style={[styles.badgeText, { color: Colors.warning.main }]}>PENDING</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => handlePrint(item)} style={styles.iconAction}>
              <Ionicons name="print-outline" size={20} color={Colors.primary.main} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSharePDF(item)} style={styles.iconAction}>
              <Ionicons name="share-outline" size={20} color={Colors.secondary.main} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>View Collections</Text>
          <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.filterButton}>
            <Ionicons name="filter" size={22} color={Colors.primary.main} />
            {(filterStatus !== "all" || filterPaymentType !== "all") && <View style={styles.filterDot} />}
          </TouchableOpacity>
        </View>

        <View style={styles.statsSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
            {renderStatCard("Total", stats.total, formatCurrency(stats.totalAmount), Colors.primary.main, Colors.primary[600], "layers")}
            {renderStatCard("Synced", stats.synced, formatCurrency(stats.syncedAmount), Colors.success.main, Colors.success[600], "cloud-done")}
            {renderStatCard("Pending", stats.pending, formatCurrency(stats.pendingAmount), Colors.warning.main, Colors.warning[600], "time-outline")}
          </ScrollView>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search collections..."
            placeholderTextColor={Colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredCollections}
          keyExtractor={(item) => (item.id || Math.random()).toString()}
          renderItem={renderCollectionItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={64} color={Colors.primary[200]} />
              <Text style={styles.emptyTitle}>No Collections Found</Text>
            </View>
          }
        />

        {/* Collection Total Footer */}
        <View style={styles.footerContainer}>
          <LinearGradient
            colors={[Colors.primary.main, Colors.primary[700]]}
            style={styles.footerGradient}
          >
            <View style={styles.footerLeft}>
              <Ionicons name="calculator" size={24} color="#FFF" style={{ marginRight: 12 }} />
              <View>
                <Text style={styles.footerLabel}>
                  {filterPaymentType === 'cash' ? 'Cash Total' :
                    filterPaymentType === 'check' ? 'Cheque Total' :
                      'Total Collection'}
                </Text>
                <Text style={styles.footerCount}>{filteredCollections.length} entries</Text>
              </View>
            </View>
            <View style={styles.footerRight}>
              <Text style={styles.footerTotalAmount}>
                {formatCurrency(filteredTotal)}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* Filter Modal */}
        <Modal visible={showFilterModal} animationType="fade" transparent onRequestClose={() => setShowFilterModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.filterModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filter Collections</Text>
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterStatus("all"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterStatus === "all" && styles.activeFilterText]}>All Collections</Text>
                {filterStatus === "all" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterStatus("synced"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterStatus === "synced" && styles.activeFilterText]}>Synced Only</Text>
                {filterStatus === "synced" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterStatus("pending"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterStatus === "pending" && styles.activeFilterText]}>Pending Only</Text>
                {filterStatus === "pending" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>

              <View style={styles.filterDivider} />
              <Text style={styles.filterSectionTitle}>Payment Type</Text>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterPaymentType("all"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterPaymentType === "all" && styles.activeFilterText]}>All Types</Text>
                {filterPaymentType === "all" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterPaymentType("cash"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterPaymentType === "cash" && styles.activeFilterText]}>Cash Only</Text>
                {filterPaymentType === "cash" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.filterOption} onPress={() => { setFilterPaymentType("check"); setShowFilterModal(false); }}>
                <Text style={[styles.filterOptionText, filterPaymentType === "check" && styles.activeFilterText]}>Check Only</Text>
                {filterPaymentType === "check" && <Ionicons name="checkmark" size={20} color={Colors.primary.main} />}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Detail Modal */}
        <Modal visible={showDetailModal} animationType="slide" transparent onRequestClose={() => setShowDetailModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.detailModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Details</Text>
                <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {selectedCollection && (
                <ScrollView contentContainerStyle={styles.detailContent}>
                  {/* Added Print/PDF in Detail Modal as well just in case */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary[50], padding: 10, borderRadius: 8 }}
                      onPress={() => handlePrint(selectedCollection)}
                    >
                      <Ionicons name="print-outline" size={20} color={Colors.primary.main} style={{ marginRight: 8 }} />
                      <Text style={{ color: Colors.primary.main, fontWeight: '600' }}>Print</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.secondary[50], padding: 10, borderRadius: 8 }}
                      onPress={() => handleSharePDF(selectedCollection)}
                    >
                      <Ionicons name="share-outline" size={20} color={Colors.secondary.main} style={{ marginRight: 8 }} />
                      <Text style={{ color: Colors.secondary.main, fontWeight: '600' }}>Share PDF</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Client</Text>
                    <Text style={styles.detailValue}>{selectedCollection.customer_name}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Code</Text>
                    <Text style={styles.detailValue}>{selectedCollection.customer_code}</Text>
                  </View>
                  {selectedCollection.customer_place && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Place</Text>
                      <Text style={styles.detailValue}>{selectedCollection.customer_place}</Text>
                    </View>
                  )}
                  {selectedCollection.customer_phone && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>{selectedCollection.customer_phone}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={[styles.detailValue, { color: Colors.success.main, fontSize: 24 }]}>
                      {formatCurrency(selectedCollection.amount)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Type</Text>
                    <Text style={styles.detailValue}>{selectedCollection.payment_type}</Text>
                  </View>
                  {selectedCollection.payment_type && selectedCollection.payment_type.toLowerCase() === 'check' && selectedCollection.cheque_number && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Cheque Number</Text>
                      <Text style={styles.detailValue}>{selectedCollection.cheque_number}</Text>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <View style={[styles.badge, { backgroundColor: Colors.success[50] }]}>
                      <Text style={[styles.badgeText, { color: Colors.success.main }]}>
                        SYNCED TO SERVER
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{new Date(selectedCollection.date).toLocaleString()}</Text>
                  </View>
                  {selectedCollection.remarks && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Remarks</Text>
                      <Text style={styles.detailValue}>{selectedCollection.remarks}</Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Printer Selection Modal */}
        <Modal
          visible={printerModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setPrinterModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            {/* Reusing detailModal style for consistency as it's bottom sheet like in upload */}
            <View style={styles.detailModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Printer</Text>
                <TouchableOpacity onPress={() => setPrinterModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 16, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', backgroundColor: Colors.neutral[200], borderRadius: 8, padding: 4, marginBottom: 16 }}>
                  <TouchableOpacity
                    onPress={() => scanPrinters('ble')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      backgroundColor: connectionType === 'ble' ? '#FFF' : 'transparent',
                      shadowColor: connectionType === 'ble' ? '#000' : 'transparent',
                      shadowOpacity: connectionType === 'ble' ? 0.1 : 0,
                      elevation: connectionType === 'ble' ? 2 : 0,
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: connectionType === 'ble' ? Colors.primary.main : Colors.text.secondary }}>Bluetooth</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => scanPrinters('usb')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      backgroundColor: connectionType === 'usb' ? '#FFF' : 'transparent',
                      shadowColor: connectionType === 'usb' ? '#000' : 'transparent',
                      shadowOpacity: connectionType === 'usb' ? 0.1 : 0,
                      elevation: connectionType === 'usb' ? 2 : 0,
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: connectionType === 'usb' ? Colors.primary.main : Colors.text.secondary }}>USB / Cable</Text>
                  </TouchableOpacity>
                </View>

                {isScanningPrinters && <ActivityIndicator size="large" color={Colors.primary.main} />}
                {!isScanningPrinters && (
                  <TouchableOpacity style={{ marginTop: 10 }} onPress={() => scanPrinters(connectionType)}>
                    <Text style={{ color: Colors.primary.main, fontWeight: '600' }}>Rescan</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={{ maxHeight: 300 }}>
                {printers.map((printer, index) => (
                  <TouchableOpacity
                    key={index}
                    style={{
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: Colors.border.light,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onPress={() => connectAndPrintCollection(printer)}
                  >
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>{printer.device_name || printer.product_id || "Unknown Device"}</Text>
                      <Text style={{ fontSize: 12, color: Colors.text.secondary }}>{printer.inner_mac_address || printer.vendor_id || "ID: " + index}</Text>
                    </View>
                    <Ionicons name={connectionType === 'ble' ? "bluetooth" : "usb"} size={20} color={Colors.primary.main} />
                  </TouchableOpacity>
                ))}
                {printers.length === 0 && !isScanningPrinters && (
                  <Text style={{ textAlign: 'center', marginTop: 20, color: Colors.text.tertiary }}>No printers found</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, marginTop: 35, paddingBottom: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: Colors.text.primary,
  },
  filterButton: {
    padding: 4,
  },
  filterDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error.main,
  },
  statsSection: {
    marginBottom: Spacing.md,
  },
  statsScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  statCardContainer: {
    width: 140,
    ...Shadows.sm,
  },
  statCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
  },
  statTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
  },
  statSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    marginTop: 2,
  },
  searchContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: Typography.sizes.base, color: Colors.text.primary },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 260 },
  collectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    padding: Spacing.md,
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
  },
  statusIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: Spacing.md,
    marginTop: 4,
  },
  syncedDot: { backgroundColor: Colors.success.main },
  pendingDot: { backgroundColor: Colors.warning.main },
  collectionDetails: { flex: 1 },
  customerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
    marginRight: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerCode: { fontSize: Typography.sizes.xs, color: Colors.text.tertiary },
  dotSeparator: { marginHorizontal: 4, color: Colors.text.tertiary, fontSize: 10 },
  dateText: { fontSize: Typography.sizes.xs, color: Colors.text.tertiary },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 80,
  },
  amount: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  // New styles for action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconAction: {
    padding: 6,
    backgroundColor: Colors.neutral[50],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.lg,
    color: Colors.text.secondary,
    fontWeight: '600',
    marginBottom: Spacing.lg,
  },
  addButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary.main,
    borderRadius: BorderRadius.full,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  filterModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  detailModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    maxHeight: '90%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  filterOptionText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
  },
  activeFilterText: {
    color: Colors.primary.main,
    fontWeight: '600',
  },
  detailContent: {
    paddingBottom: Spacing.lg,
  },
  detailRow: {
    marginBottom: Spacing.lg,
  },
  detailLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  filterDivider: {
    height: 1,
    backgroundColor: Colors.border.light,
    marginVertical: Spacing.md,
  },
  filterSectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 45,
    left: 20,
    right: 20,
    borderRadius: BorderRadius.xl,
    ...Shadows.md,
    overflow: 'hidden',
  },
  footerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  footerCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '500',
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerTotalAmount: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
  },
});