// app/Collection/AddCollection.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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

const API_CUSTOMERS = "https://tasksas.com/api/debtors/get-debtors/";

export default function AddCollectionScreen() {
  const router = useRouter();
  const params = useGlobalSearchParams();
  const preselectedCode = params?.preselectedCustomerCode || null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isCustomerLocked, setIsCustomerLocked] = useState(false);

  // Customer selection modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredCustomers, setFilteredCustomers] = useState([]);

  // Area Selection Logic
  const [areaList, setAreaList] = useState([]);
  const [selectedArea, setSelectedArea] = useState("All");
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [filteredAreas, setFilteredAreas] = useState([]);

  // Form fields
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    checkNetworkStatus();
    fetchCustomers();

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (preselectedCode && customers.length > 0 && !loading) {
      const target = customers.find(c => c.code === preselectedCode);
      if (target) {
        handleSelectCustomer(target);
        setIsCustomerLocked(true);
      }
    }
  }, [preselectedCode, customers, loading]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredCustomers(customers);
    } else {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.code.toLowerCase().includes(searchQuery.toLowerCase())
      );

      // Apply area filter if selected
      if (selectedArea && selectedArea !== "All") {
        setFilteredCustomers(filtered.filter(c => {
          const cArea = c.area && c.area.trim() !== "" ? c.area : c.place;
          return cArea === selectedArea;
        }));
      } else {
        setFilteredCustomers(filtered);
      }
    }

    // Check outside of search query too (if search is empty but area is selected)
    if (searchQuery.trim() === "" && selectedArea && selectedArea !== "All") {
      setFilteredCustomers(customers.filter(c => {
        const cArea = c.area && c.area.trim() !== "" ? c.area : c.place;
        return cArea === selectedArea;
      }));
    }

  }, [searchQuery, customers, selectedArea]);

  // Filter areas
  useEffect(() => {
    if (areaSearchQuery.trim() === "") {
      setFilteredAreas(areaList);
    } else {
      setFilteredAreas(areaList.filter(a => a.toLowerCase().includes(areaSearchQuery.toLowerCase())));
    }
  }, [areaSearchQuery, areaList]);

  const checkNetworkStatus = async () => {
    const state = await NetInfo.fetch();
    setIsOnline(state.isConnected);
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const localCustomers = await loadCustomersFromDB();

      if (localCustomers.length > 0) {
        setCustomers(localCustomers);
        // Initial filter run will handle the rest
        if (!selectedArea || selectedArea === "All") {
          setFilteredCustomers(localCustomers);
        }
        setLoading(false);

        if (isOnline) {
          fetchCustomersFromAPI().catch(err => {
            console.log("Background API fetch failed:", err);
          });
        }
      } else if (isOnline) {
        await fetchCustomersFromAPI();
      } else {
        Alert.alert(
          "No Data Available",
          "No customer data found offline. Please connect to the internet and download data first."
        );
        setLoading(false);
      }
    } catch (error) {
      console.error("Fetch customers error:", error);
      Alert.alert("Error", "Failed to load customers. Please try again.");
      setLoading(false);
    }
  };

  const fetchCustomersFromAPI = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");

      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        router.replace("/LoginScreen");
        return;
      }

      // 1. Fetch Areas (Like Punch-In.js)
      try {
        const areaResponse = await fetch('https://tasksas.com/api/area/list/', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (areaResponse.ok) {
          const areaData = await areaResponse.json();
          if (areaData.success && Array.isArray(areaData.areas)) {
            const fetchedAreas = ["All", ...areaData.areas.sort()];
            setAreaList(fetchedAreas);
            setFilteredAreas(fetchedAreas);
          }
        }
      } catch (areaErr) {
        console.error("Area fetch error:", areaErr);
      }

      // 2. Fetch Customers
      const response = await fetch(API_CUSTOMERS, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();

      let customersArray = [];
      if (Array.isArray(data)) {
        customersArray = data;
      } else if (Array.isArray(data.data)) {
        customersArray = data.data;
      } else if (Array.isArray(data.results)) {
        customersArray = data.results;
      }

      const filteredCustomers = customersArray
        .filter((customer) => customer.super_code === "DEBTO")
        .map(debtor => ({
          ...debtor,
          code: debtor.code || debtor.id?.toString(),
          name: debtor.name || "Unknown Debtor",
          place: debtor.place || debtor.area || '',
          area: debtor.area || '', // Explicitly map area
        }))
        .sort((a, b) => {
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });

      setCustomers(filteredCustomers);
      // Don't overwrite filteredCustomers immediately if query exists, but usually we do:
      if (searchQuery.trim() === "") {
        setFilteredCustomers(filteredCustomers);
      }

    } catch (error) {
      console.error("API fetch error:", error);
      throw error;
    }
  };

  const loadCustomersFromDB = async () => {
    try {
      await dbService.init();
      const allCustomers = await dbService.getCustomers();

      if (allCustomers.length === 0) {
        setLoading(false);
        return [];
      }

      // Load areas logic (similar to Entry.js)
      let areasFromDb = await dbService.getAreas();
      if (!areasFromDb || areasFromDb.length === 0) {
        const uniqueAreas = [...new Set(allCustomers.map((debtor) => {
          return debtor.area && debtor.area.trim() !== "" ? debtor.area : debtor.place;
        }))].filter(Boolean).sort();
        areasFromDb = uniqueAreas;
      }

      // Ensure "All" is present
      const finalAreas = ["All", ...areasFromDb.filter(a => a !== "All")];
      setAreaList(finalAreas);
      setFilteredAreas(finalAreas);

      const mappedCustomers = allCustomers.map(debtor => ({
        ...debtor,
        code: debtor.code || debtor.id?.toString(),
        name: debtor.name || "Unknown Debtor",
        place: debtor.place || debtor.area || '',
        area: debtor.area || '', // Explicitly map area
      })).sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

      return mappedCustomers;
    } catch (error) {
      console.error("[AddCollection] Error loading customers from database:", error);
      return [];
    }
  };

  const handleSelectArea = (area) => {
    setSelectedArea(area);
    setSelectedCustomer(null);
    setSelectedCustomerName("");
    setShowAreaModal(false);
    setAreaSearchQuery("");
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setSelectedCustomerName(customer.name);
    setShowCustomerModal(false);
    setSearchQuery("");
  };

  const handleSave = async () => {
    if (!selectedCustomer) {
      Alert.alert("Validation Error", "Please select a customer.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Validation Error", "Please enter a valid amount.");
      return;
    }

    if (paymentType === "Cheque" && !chequeNumber.trim()) {
      Alert.alert("Validation Error", "Please enter cheque number.");
      return;
    }

    setSaving(true);

    try {
      const collectionData = {
        code: selectedCustomer.code,
        name: selectedCustomer.name,
        place: selectedCustomer.place || null,
        phone: selectedCustomer.phone || null,
        amount: parseFloat(amount),
        type: paymentType,
        cheque_number: paymentType === "Cheque" ? chequeNumber : null,
        remarks: remarks.trim() || null,
        date: new Date().toISOString(),
        synced: 0
      };

      // Save to local storage
      await saveToLocalStorage(collectionData);

      Alert.alert(
        "Saved",
        "Collection saved locally. Please sync when online.",
        [{ text: "OK", onPress: () => router.replace("/Collection/Collection") }]
      );

      resetForm();
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Failed to save collection. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveToLocalStorage = async (collectionData) => {
    try {
      const username = await AsyncStorage.getItem('username');
      await dbService.init();
      await dbService.saveOfflineCollection(collectionData, username);
    } catch (error) {
      console.error("Error saving to database:", error);
      throw error;
    }
  };

  const resetForm = () => {
    setSelectedCustomer(null);
    setSelectedCustomerName("");
    setAmount("");
    setPaymentType("Cash");
    setChequeNumber("");
    setRemarks("");
  };

  const handleClose = () => {
    if (amount || remarks || selectedCustomer) {
      Alert.alert(
        "Discard Changes",
        "You have unsaved changes. Are you sure you want to close?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary.main} />
          <Text style={styles.loadingText}>Loading customers...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Collection</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.statusText}>{isOnline ? "Online" : "Offline"}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Changed from Animated.View to View to ensure visibility */}
          {/* Area Selection - hidden when locked */}
          {!isCustomerLocked && (
          <View style={styles.formSection}>
            <Text style={styles.label}>
              Filter by Area
            </Text>
            <TouchableOpacity
              style={styles.inputBox}
              onPress={() => setShowAreaModal(true)}
            >
              <Ionicons name="location" size={20} color={selectedArea ? Colors.primary.main : Colors.text.tertiary} style={styles.inputIcon} />
              <Text style={[styles.inputText, !selectedArea && styles.placeholderText]}>
                {selectedArea || "All"}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
          )}

          <View style={styles.formSection}>
            <Text style={styles.label}>
              {isCustomerLocked ? 'Collection For' : <><Text>Select Customer </Text><Text style={styles.required}>*</Text></>}
            </Text>
            {!isCustomerLocked && (
            <TouchableOpacity
              style={styles.inputBox}
              onPress={() => customers.length > 0 && setShowCustomerModal(true)}
              disabled={customers.length === 0}
            >
              <Ionicons name="person" size={20} color={selectedCustomerName ? Colors.primary.main : Colors.text.tertiary} style={styles.inputIcon} />
              <Text style={[styles.inputText, !selectedCustomerName && styles.placeholderText]}>
                {selectedCustomerName || "Select Customer"}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
            )}
            {selectedCustomer && (
              <View style={[styles.inputBox, { backgroundColor: '#f0f4ff', borderColor: Colors.primary.light }]}>
                <Ionicons name="person-circle" size={20} color={Colors.primary.main} style={styles.inputIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputText, { fontWeight: '700' }]}>{selectedCustomer.name}</Text>
                  <Text style={{ fontSize: 12, color: Colors.text.secondary }}>Code: {selectedCustomer.code}</Text>
                </View>
                {isCustomerLocked && <Ionicons name="lock-closed" size={16} color={Colors.primary.main} />}
              </View>
            )}
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>
              Amount <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputBox}>
              <Ionicons name="cash" size={20} color={amount ? Colors.success.main : Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.inputText}
                placeholder="Enter amount"
                placeholderTextColor={Colors.text.tertiary}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>
              Payment Type <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.paymentTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.paymentTypeButton,
                  paymentType === "Cash" && styles.paymentTypeButtonActive,
                ]}
                onPress={() => {
                  setPaymentType("Cash");
                  setChequeNumber("");
                }}
                activeOpacity={0.8}
              >
                {paymentType === "Cash" && (
                  <LinearGradient
                    colors={Gradients.primary}
                    style={styles.activeGradient}
                  />
                )}
                <Ionicons
                  name="wallet"
                  size={24}
                  color={paymentType === "Cash" ? "#ffffff" : Colors.text.secondary}
                />
                <Text
                  style={[
                    styles.paymentTypeText,
                    paymentType === "Cash" && styles.paymentTypeTextActive,
                  ]}
                >
                  Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentTypeButton,
                  paymentType === "Cheque" && styles.paymentTypeButtonActive,
                ]}
                onPress={() => setPaymentType("Cheque")}
                activeOpacity={0.8}
              >
                {paymentType === "Cheque" && (
                  <LinearGradient
                    colors={Gradients.primary}
                    style={styles.activeGradient}
                  />
                )}
                <Ionicons
                  name="card"
                  size={24}
                  color={paymentType === "Cheque" ? "#ffffff" : Colors.text.secondary}
                />
                <Text
                  style={[
                    styles.paymentTypeText,
                    paymentType === "Cheque" && styles.paymentTypeTextActive,
                  ]}
                >
                  Cheque
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {paymentType === "Cheque" && (
            <View style={styles.formSection}>
              <Text style={styles.label}>
                Cheque Number <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputBox}>
                <Ionicons name="document-text" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.inputText}
                  placeholder="Enter cheque number"
                  placeholderTextColor={Colors.text.tertiary}
                  value={chequeNumber}
                  onChangeText={setChequeNumber}
                />
              </View>
            </View>
          )}

          <View style={styles.formSection}>
            <Text style={styles.label}>Remarks (Optional)</Text>
            <TextInput
              style={[styles.inputBox, styles.textArea]}
              placeholder="Add any notes..."
              placeholderTextColor={Colors.text.tertiary}
              value={remarks}
              onChangeText={setRemarks}
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving || customers.length === 0}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={Gradients.primary}
                style={styles.buttonGradient}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.buttonText}>Save Collection</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Area Selection Modal */}
        <Modal
          visible={showAreaModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAreaModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Area</Text>
                <TouchableOpacity onPress={() => setShowAreaModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search area..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={areaSearchQuery}
                  onChangeText={setAreaSearchQuery}
                  autoFocus={true}
                />
              </View>

              <FlatList
                data={filteredAreas}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.customerItem}
                    onPress={() => handleSelectArea(item)}
                  >
                    <Ionicons name="location" size={20} color={Colors.primary.main} style={{ marginRight: 12 }} />
                    <Text style={[styles.customerName, { flex: 1 }]}>{item}</Text>
                    {selectedArea === item && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success.main} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No areas found</Text>
                  </View>
                }
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {/* Customer Selection Modal */}
        <Modal
          visible={showCustomerModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowCustomerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Customer</Text>
                <TouchableOpacity onPress={() => setShowCustomerModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search name or code..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={true}
                />
              </View>

              <FlatList
                data={filteredCustomers}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.customerItem}
                    onPress={() => handleSelectCustomer(item)}
                  >
                    <View style={styles.customerAvatar}>
                      <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{item.name}</Text>
                      <Text style={styles.customerCode}>Code: {item.code}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No customers found</Text>
                  </View>
                }
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    marginTop: 35,
    paddingBottom: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
  },
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
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDot: {
    backgroundColor: Colors.success.main,
  },
  offlineDot: {
    backgroundColor: Colors.warning.main,
  },
  statusText: {
    fontSize: Typography.sizes.xs,
    fontWeight: "600",
    color: Colors.text.secondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  formSection: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  required: {
    color: Colors.error.main,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    paddingHorizontal: Spacing.md,
    height: 52,
    ...Shadows.sm,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  inputText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  placeholderText: {
    color: Colors.text.tertiary,
  },
  textArea: {
    height: 100,
    paddingVertical: Spacing.md,
  },
  paymentTypeContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  paymentTypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    paddingVertical: Spacing.md,
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
    height: 56,
  },
  paymentTypeButtonActive: {
    borderColor: 'transparent',
  },
  activeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  paymentTypeText: {
    fontSize: Typography.sizes.base,
    fontWeight: "600",
    color: Colors.text.secondary,
    zIndex: 1,
  },
  paymentTypeTextActive: {
    color: "#ffffff",
  },
  buttonContainer: {
    marginTop: Spacing.md,
  },
  saveButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.colored.primary,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: 8,
  },
  buttonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    height: '80%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    height: 48,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.primary.main,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  customerCode: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.text.secondary,
    fontSize: Typography.sizes.base,
  },
});