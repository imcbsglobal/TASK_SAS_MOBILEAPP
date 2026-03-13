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
import savedOrdersDbService from "../../src/services/savedOrdersDb";

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
  const [filterStatus, setFilterStatus] = useState('pending'); // 'pending' | 'saved'
  const [savedCollections, setSavedCollections] = useState([]);
  const [revertClicks, setRevertClicks] = useState({}); // { id: count }

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
    loadSavedCollections();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  const checkNetworkStatus = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected);
  };

  const loadPendingCollections = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      await dbService.init();
      const pendingCollections = await dbService.getOfflineCollections(false);
      setCollections(pendingCollections);
    } catch (error) {
      console.error("[Upload] Error loading collections:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadSavedCollections = async () => {
    try {
      const saved = await savedOrdersDbService.getSavedTransactions('Collection');
      setSavedCollections(saved);
    } catch (error) {
      console.error("[Upload] Error loading saved collections:", error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadPendingCollections(false),
      loadSavedCollections()
    ]);
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

          // Save to persistent 48h history - non-blocking for speed
          savedOrdersDbService.saveTransactionLocally(collection.local_id, 'Collection', {
            ...collection,
            synced_at: new Date().toISOString()
          }).then(() => loadSavedCollections());

          successCount++;

        } catch (error) {
          console.error(`Failed to upload collection ${collection.id}:`, error);
          failedItems.push(collection);
        }
      }

      // Reload collections after upload
      await loadPendingCollections();
      await loadSavedCollections(); // Reload saved too
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
            <Text style={styles.amount}>{(+(item.amount || 0)).toLocaleString()}</Text>

            <View style={styles.detailsRow}>
              <View style={[styles.badge, { backgroundColor: Colors.neutral[100] }]}>
                <Text style={styles.badgeText}>{item.payment_type}</Text>
              </View>
              <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString()}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {filterStatus === 'saved' ? (
              <>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDownloadJSON(item)}>
                  <Ionicons name="code-working-outline" size={20} color={Colors.neutral[600]} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: Colors.warning.light }]}
                  onPress={() => handleRevert(item)}
                >
                  <Ionicons name="refresh-circle-outline" size={24} color={Colors.warning.main} />
                  {revertClicks[item.id] > 0 && (
                    <Text style={{ fontSize: 10, color: Colors.warning.main, fontWeight: '700' }}>{revertClicks[item.id]}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
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
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const handleDownloadJSON = async (collection) => {
    try {
      // ✅ MOBILE SAFE JSON SHARING
      const content = JSON.stringify(collection, null, 2);
      const fileName = `Collection_${collection.customer_name.replace(/\s+/g, '_')}_${Date.now()}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: 'utf8' });

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Collection JSON',
          UTI: 'public.json',
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device");
      }
    } catch (error) {
      console.error("JSON Export Error:", error);
      Alert.alert("Export Failed", error.message);
    }
  };

  const handleRevert = async (collection) => {
    const currentCount = revertClicks[collection.id] || 0;
    const newCount = currentCount + 1;

    if (newCount >= 5) {
      Alert.alert(
        "Confirm Revert",
        "Do you want to revert this synced collection to pending state?",
        [
          { text: "Cancel", onPress: () => setRevertClicks(prev => ({ ...prev, [collection.id]: 0 })) },
          {
            text: "Revert",
            onPress: async () => {
              try {
                const success = await dbService.revertCollectionToPending(collection.id);
                if (success) {
                  // Also remove from SavedOrdersDB if it exists there
                  if (collection.local_db_id) {
                    await savedOrdersDbService.deleteSavedTransaction(collection.local_db_id);
                  }

                  await Promise.all([loadPendingCollections(false), loadSavedCollections()]);
                  setRevertClicks(prev => {
                    const next = { ...prev };
                    delete next[collection.id];
                    return next;
                  });
                  Alert.alert("Success", "Collection reverted to pending.");
                } else {
                  Alert.alert("Error", "Failed to revert collection.");
                }
              } catch (error) {
                console.error("Revert Error:", error);
                Alert.alert("Error", "An unexpected error occurred.");
              }
            }
          }
        ]
      );
    } else {
      setRevertClicks(prev => ({ ...prev, [collection.id]: newCount }));
    }
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

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'pending' && styles.filterTabActive]}
            onPress={() => setFilterStatus('pending')}
          >
            <Ionicons name="time-outline" size={18} color={filterStatus === 'pending' ? "#FFF" : Colors.warning.main} />
            <Text style={[styles.filterTabText, filterStatus === 'pending' && styles.filterTabTextActive]}>
              Pending ({collections.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'saved' && styles.filterTabActive]}
            onPress={() => setFilterStatus('saved')}
          >
            <Ionicons name="cloud-done-outline" size={18} color={filterStatus === 'saved' ? "#FFF" : Colors.success.main} />
            <Text style={[styles.filterTabText, filterStatus === 'saved' && styles.filterTabTextActive]}>
              Saved ({savedCollections.length})
            </Text>
          </TouchableOpacity>
        </View>

        {filterStatus === 'pending' && collections.length > 0 && (
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

        {(filterStatus === 'pending' ? collections : savedCollections).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name={filterStatus === 'pending' ? "cloud-done-outline" : "archive-outline"} size={64} color={filterStatus === 'pending' ? Colors.success.main : Colors.neutral[400]} />
            <Text style={styles.emptyTitle}>{filterStatus === 'pending' ? "All Synced!" : "No Saved Records"}</Text>
            <Text style={styles.emptySubtitle}>
              {filterStatus === 'pending'
                ? "You have no pending collections to upload."
                : "You haven't uploaded any collections recently."}
            </Text>
            {filterStatus === 'pending' && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push("/Collection/AddCollection")}
                activeOpacity={0.8}
              >
                <Text style={styles.addButtonText}>Add New Payment</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <FlatList
              data={filterStatus === 'pending' ? collections : savedCollections}
              keyExtractor={(item) => (item.id || item.local_id || Math.random()).toString()}
              renderItem={renderCollectionItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />
              }
            />

            {filterStatus === 'pending' && (
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
            )}
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
                <View style={{ flexDirection: 'row', backgroundColor: Colors.neutral[200], borderRadius: 8, padding: 4, marginBottom: 16 }}>
                  <TouchableOpacity
                    onPress={() => scanPrinters('ble')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 20,
                      borderRadius: 6,
                      backgroundColor: connectionType === 'ble' ? '#FFF' : 'transparent',
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
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: connectionType === 'usb' ? Colors.primary.main : Colors.text.secondary }}>USB</Text>
                  </TouchableOpacity>
                </View>

                {isScanningPrinters && <ActivityIndicator size="small" color={Colors.primary.main} />}
              </View>

              <ScrollView style={styles.modalBody}>
                {printers.map((printer, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.printerItem}
                    onPress={() => connectAndPrintCollection(printer)}
                  >
                    <View>
                      <Text style={styles.printerName}>{printer.device_name || printer.product_id || "Unknown"}</Text>
                      <Text style={styles.printerAddress}>{printer.inner_mac_address || printer.vendor_id}</Text>
                    </View>
                    <Ionicons name={connectionType === 'ble' ? "bluetooth" : "usb"} size={20} color={Colors.primary.main} />
                  </TouchableOpacity>
                ))}
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
                <TextInput
                  style={styles.inputText}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="numeric"
                  placeholder="Amount"
                />
                <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
                  <LinearGradient colors={Gradients.primary} style={styles.updateButtonGradient}>
                    <Text style={styles.updateButtonText}>Update</Text>
                  </LinearGradient>
                </TouchableOpacity>
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
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: Colors.border.light,
    gap: 8,
  },
  filterTabActive: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: '#FFF',
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