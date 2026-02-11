// app/Collection/Upload.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
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
  View,
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";
import pdfService from "../../src/services/pdfService";
import printerService from "../../src/services/printerService";

const API_UPLOAD_COLLECTION = "https://tasksas.com/api/collection/create/";

export default function UploadScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Printer State
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [connectionType, setConnectionType] = useState('ble'); // 'ble' | 'usb'

  const [selectedCollectionToPrint, setSelectedCollectionToPrint] = useState(null);

  // Edit State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentType, setEditPaymentType] = useState("Cash");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editRemarks, setEditRemarks] = useState("");

  useEffect(() => {
    console.log("[Upload] Component Mounted");
    checkNetworkStatus();
    loadPendingCollections();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  const checkNetworkStatus = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected);
  };

  const loadPendingCollections = async () => {
    try {
      if (loading) setLoading(true);
      await dbService.init();
      const pendingCollections = await dbService.getOfflineCollections(false);
      setCollections(pendingCollections);
    } catch (error) {
      console.error("[Upload] Error loading collections:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPendingCollections();
    setRefreshing(false);
  }, []);

  const toggleSelectCollection = (id) => {
    setSelectedCollections(prev => {
      if (prev.includes(id)) {
        return prev.filter(itemId => itemId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedCollections.length === collections.length) {
      setSelectedCollections([]);
    } else {
      setSelectedCollections(collections.map(item => item.id));
    }
  };

  const handleUpload = async () => {
    if (!isOnline) {
      Alert.alert(
        "No Internet Connection",
        "Please connect to the internet to upload collections."
      );
      return;
    }

    if (selectedCollections.length === 0) {
      Alert.alert(
        "No Selection",
        "Please select at least one collection to upload."
      );
      return;
    }

    Alert.alert(
      "Confirm Upload",
      `Upload ${selectedCollections.length} collection(s) to server?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: async () => {
            await uploadCollections();
          }
        }
      ]
    );
  };

  const uploadCollections = async () => {
    setUploading(true);
    setUploadProgress({ current: 0, total: selectedCollections.length });

    try {
      const token = await AsyncStorage.getItem("authToken");

      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        router.replace("/LoginScreen");
        return;
      }

      const collectionsToUpload = collections.filter(item =>
        selectedCollections.includes(item.id)
      );

      let successCount = 0;
      let failedItems = [];

      for (let i = 0; i < collectionsToUpload.length; i++) {
        const collection = collectionsToUpload[i];
        setUploadProgress({ current: i + 1, total: collectionsToUpload.length });

        try {
          // Prepare upload data according to API structure
          const uploadData = {
            code: collection.customer_code || '',
            name: collection.customer_name || '',
            place: collection.customer_place || '',
            phone: collection.customer_phone || '',
            amount: parseFloat(collection.amount) || 0,
            type: collection.payment_type || ''
          };

          // Add optional fields only if they exist and have values
          // Handle cheque_no (DB uses cheque_number)
          if (collection.cheque_number || collection.cheque_no) {
            uploadData.cheque_no = collection.cheque_number || collection.cheque_no;
            // Also map to ref_no if not present, based on user example
            if (!uploadData.ref_no) {
              uploadData.ref_no = uploadData.cheque_no;
            }
          }

          // Handle ref_no if explicitly present
          if (collection.ref_no) {
            uploadData.ref_no = collection.ref_no;
          }

          // Handle remark (DB uses remarks)
          if (collection.remarks || collection.remark) {
            uploadData.remark = collection.remarks || collection.remark;
          }

          console.log('[Upload] Uploading collection:', JSON.stringify(uploadData, null, 2));

          const response = await fetch(API_UPLOAD_COLLECTION, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(uploadData),
          });

          console.log('[Upload] Response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log('[Upload] Error response:', errorData);
            throw new Error(errorData.message || `Upload failed: ${response.status}`);
          }

          const responseData = await response.json().catch(() => ({}));
          console.log('[Upload] Success response:', responseData);

          // Mark as synced locally using local_id
          await dbService.markCollectionAsSynced(collection.local_id);
          successCount++;

        } catch (error) {
          console.error(`Failed to upload collection ${collection.id}:`, error);
          failedItems.push(collection);
        }
      }

      // Reload collections after upload
      await loadPendingCollections();
      setSelectedCollections([]);

      if (failedItems.length === 0) {
        Alert.alert(
          "Success",
          `Successfully uploaded ${successCount} collection(s)!`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Partial Success",
          `Uploaded ${successCount} collection(s). ${failedItems.length} failed.`,
          [{ text: "OK" }]
        );
      }

    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload collections. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handlePrint = async (collection) => {
    try {
      if (printerService.connected) {
        Alert.alert("Printing", "Sending data to printer...");
        await printerService.printCollectionReceipt(collection);
      } else {
        setSelectedCollectionToPrint(collection);
        setPrinterModalVisible(true);
        scanPrinters('ble'); // Default to BLE scan
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
      // printerService.getDeviceList() handles init and permissions safely now
      const devices = await printerService.getDeviceList(type);
      setPrinters(devices);
    } catch (e) {
      console.error(e);
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

  const handleEdit = (collection) => {
    setEditingCollection(collection);
    setEditAmount(collection.amount.toString());
    setEditPaymentType(collection.payment_type || "Cash");
    setEditChequeNumber(collection.cheque_number || "");
    setEditRemarks(collection.remarks || "");
    setIsEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!editAmount || parseFloat(editAmount) <= 0) {
      Alert.alert("Validation Error", "Please enter a valid amount.");
      return;
    }

    if (editPaymentType === "Cheque" && !editChequeNumber.trim()) {
      Alert.alert("Validation Error", "Please enter cheque number.");
      return;
    }

    try {
      const updatedData = {
        amount: parseFloat(editAmount),
        payment_type: editPaymentType,
        cheque_number: editPaymentType === "Cheque" ? editChequeNumber : null,
        remarks: editRemarks.trim() || null
      };

      const success = await dbService.updateOfflineCollection(editingCollection.id, updatedData);
      if (success) {
        setIsEditModalVisible(false);
        await loadPendingCollections();
        Alert.alert("Success", "Collection updated successfully.");
      }
    } catch (error) {
      console.error("[Upload] Update error:", error);
      Alert.alert("Error", "Failed to update collection.");
    }
  };

  const handleDelete = (collection) => {
    Alert.alert(
      "Delete Collection",
      `Are you sure you want to delete this payment for ${collection.customer_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await dbService.deleteCollection(collection.id);
              if (success) {
                await loadPendingCollections();
                setSelectedCollections(prev => prev.filter(id => id !== collection.id));
              } else {
                Alert.alert("Error", "Failed to delete collection from database.");
              }
            } catch (error) {
              console.error("[Upload] Delete error:", error);
              Alert.alert("Error", "An unexpected error occurred while deleting.");
            }
          }
        }
      ]
    );
  };

  const handleBulkDelete = () => {
    if (selectedCollections.length === 0) return;

    Alert.alert(
      "Bulk Delete",
      `Are you sure you want to delete ${selectedCollections.length} selected payment(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              let deletedCount = 0;
              for (const id of selectedCollections) {
                const success = await dbService.deleteCollection(id);
                if (success) deletedCount++;
              }
              await loadPendingCollections();
              setSelectedCollections([]);
              Alert.alert("Success", `Deleted ${deletedCount} collection(s).`);
            } catch (error) {
              console.error("[Upload] Bulk delete error:", error);
              Alert.alert("Error", "Failed to complete bulk deletion.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderCollectionItem = ({ item, index }) => {
    const isSelected = selectedCollections.includes(item.id);

    return (
      <View
        style={[styles.collectionCard, isSelected && styles.selectedCard]}
      >
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => toggleSelectCollection(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.checkboxContainer}>
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={24}
              color={isSelected ? Colors.primary.main : Colors.text.tertiary}
            />
          </View>

          <View style={styles.collectionInfo}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customer_name}
            </Text>
            <Text style={styles.amount}>{(+item.amount).toLocaleString()}</Text>

            <View style={styles.detailsRow}>
              <View style={[styles.badge, { backgroundColor: Colors.neutral[100] }]}>
                <Text style={styles.badgeText}>{item.payment_type}</Text>
              </View>
              <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handlePrint(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="print-outline" size={20} color={Colors.primary.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleSharePDF(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={20} color={Colors.secondary.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleEdit(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil-outline" size={20} color={Colors.primary.main} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: Colors.error.light }]}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error.main} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

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
          <Text style={styles.headerTitle}>Upload Data</Text>
          <View style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </Text>
          </View>
        </View>

        {collections.length > 0 && (
          <View style={styles.selectionBar}>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={toggleSelectAll}
              activeOpacity={0.7}
            >
              <Ionicons
                name={selectedCollections.length === collections.length ? "checkbox" : "square-outline"}
                size={20}
                color={Colors.primary.main}
              />
              <Text style={styles.selectAllText}>
                {selectedCollections.length === collections.length ? "Deselect All" : "Select All"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.selectionCount}>
              {selectedCollections.length} selected
            </Text>
          </View>
        )}

        {collections.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-done-outline" size={64} color={Colors.success.main} />
            <Text style={styles.emptyTitle}>All Synced!</Text>
            <Text style={styles.emptySubtitle}>
              You have no pending collections to upload.
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push("/Collection/AddCollection")}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>Add New Payment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <FlatList
              data={collections}
              keyExtractor={(item) => (item.id || Math.random()).toString()}
              renderItem={renderCollectionItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />
              }
            />

            <View style={styles.footer}>
              <View style={styles.footerButtons}>
                <TouchableOpacity
                  style={[
                    styles.bulkDeleteButton,
                    (selectedCollections.length === 0 || uploading) && styles.disabledButton
                  ]}
                  onPress={handleBulkDelete}
                  disabled={selectedCollections.length === 0 || uploading}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error.main} />
                  <Text style={styles.bulkDeleteText}>Delete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.uploadButton,
                    (!isOnline || selectedCollections.length === 0 || uploading) && styles.disabledButton,
                    { flex: 1 }
                  ]}
                  onPress={handleUpload}
                  disabled={!isOnline || selectedCollections.length === 0 || uploading}
                >
                  <View style={[
                    styles.gradientButton,
                    (!isOnline || selectedCollections.length === 0 || uploading) && styles.disabledGradient
                  ]}>
                    {uploading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={20} color="#FFF" />
                        <Text style={styles.uploadButtonText}>
                          Upload {selectedCollections.length} Items
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Printer Selection Modal */}
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

              <View style={{ padding: 16, alignItems: 'center' }}>
                {/* Connection Type Toggle */}
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
                      shadowRadius: 2,
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
                      shadowRadius: 2,
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

              <ScrollView style={styles.modalBody}>
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

        {/* Edit Collection Modal */}
        <Modal
          visible={isEditModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Collection</Text>
                <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 16 }}>
                <Text style={styles.editLabel}>Customer: {editingCollection?.customer_name}</Text>

                <Text style={styles.label}>Amount</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="cash" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputText}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="numeric"
                    placeholder="Enter amount"
                  />
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Payment Type</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <TouchableOpacity
                    style={[styles.typeButton, editPaymentType === 'Cash' && styles.typeButtonActive]}
                    onPress={() => setEditPaymentType('Cash')}
                  >
                    <Text style={[styles.typeButtonText, editPaymentType === 'Cash' && styles.typeButtonTextActive]}>Cash</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeButton, editPaymentType === 'Cheque' && styles.typeButtonActive]}
                    onPress={() => setEditPaymentType('Cheque')}
                  >
                    <Text style={[styles.typeButtonText, editPaymentType === 'Cheque' && styles.typeButtonTextActive]}>Cheque</Text>
                  </TouchableOpacity>
                </View>

                {editPaymentType === 'Cheque' && (
                  <>
                    <Text style={styles.label}>Cheque Number</Text>
                    <View style={styles.inputBox}>
                      <Ionicons name="card" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
                      <TextInput
                        style={styles.inputText}
                        value={editChequeNumber}
                        onChangeText={setEditChequeNumber}
                        placeholder="Enter cheque number"
                      />
                    </View>
                  </>
                )}

                <Text style={[styles.label, { marginTop: 16 }]}>Remarks</Text>
                <TextInput
                  style={[styles.inputBox, { height: 80, textAlignVertical: 'top', padding: 10 }]}
                  value={editRemarks}
                  onChangeText={setEditRemarks}
                  multiline
                  placeholder="Enter remarks"
                />

                <TouchableOpacity
                  style={styles.updateButton}
                  onPress={handleUpdate}
                >
                  <LinearGradient
                    colors={Gradients.primary}
                    style={styles.updateButtonGradient}
                  >
                    <Text style={styles.updateButtonText}>Update Collection</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient >
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  onlineBadge: { backgroundColor: Colors.success[50] },
  offlineBadge: { backgroundColor: Colors.warning[50] },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  onlineDot: { backgroundColor: Colors.success.main },
  offlineDot: { backgroundColor: Colors.warning.main },
  statusText: { fontSize: 10, fontWeight: '700' },
  onlineText: { color: Colors.success.main },
  offlineText: { color: Colors.warning.main },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.neutral[50],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  selectionCount: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  addButton: {
    backgroundColor: Colors.primary.main,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  collectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  selectedCard: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.primary[50],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: Spacing.md,
  },
  collectionInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  amount: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.success.main,
    marginVertical: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  dateText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: Spacing.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.neutral[50],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: 50,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
  },
  uploadButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: 8,
    backgroundColor: Colors.primary.main,
    borderRadius: BorderRadius.lg,
  },
  disabledGradient: {
    backgroundColor: Colors.neutral[400],
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: Typography.sizes.base,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bulkDeleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.error.light,
    backgroundColor: Colors.error[50],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkDeleteText: {
    color: Colors.error.main,
    fontWeight: '700',
    fontSize: Typography.sizes.base,
  },
  disabledButton: {
    opacity: 0.6,
  },
  // Printer Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, // Hardcoded for safety
    borderTopRightRadius: 20, // Hardcoded for safety
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
  modalBody: {
    paddingBottom: Spacing.lg,
  },
  editLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary.main,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border.light,
    alignItems: 'center',
    backgroundColor: '#F8F9FA'
  },
  typeButtonActive: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main
  },
  typeButtonText: {
    fontWeight: '600',
    color: Colors.text.secondary
  },
  typeButtonTextActive: {
    color: '#FFF'
  },
  updateButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  updateButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700'
  },
  closeButton: {
    padding: 4,
  },
  printerOptions: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  connectionTypeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[200],
    borderRadius: 8,
    padding: 4,
    marginBottom: Spacing.md,
  },
  connectionTypeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  connectionTypeBtnActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  connectionTypeText: {
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  connectionTypeTextActive: {
    color: Colors.primary.main,
  },
  rescanButton: {
    marginTop: 10,
  },
  rescanText: {
    color: Colors.primary.main,
    fontWeight: '600',
  },
  printerList: {
    maxHeight: 400,
  },
  printerItem: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  printerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  printerAddress: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  noPrintersText: {
    textAlign: 'center',
    marginTop: 20,
    color: Colors.text.tertiary,
  },
});