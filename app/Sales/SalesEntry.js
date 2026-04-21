// app/Sales/SalesEntry.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useGlobalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";

export default function SalesEntryScreen() {
  const router = useRouter();
  const paymentList = ["Cash/Bank", "Credit"];

  const [debtorsData, setDebtorsData] = useState([]);
  const [areaList, setAreaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [usingCache, setUsingCache] = useState(false);

  // Selection states - DEFAULT PAYMENT SET TO "Cash/Bank"
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState("Cash/Bank");
  const [selectedPriceCode, setSelectedPriceCode] = useState(null); // Code 'S1', 'MR' etc.
  const [selectedPriceName, setSelectedPriceName] = useState(null); // Name 'Sales', 'MRP'
  const [isCustomerLocked, setIsCustomerLocked] = useState(false); // NEW: Lock selection if account matched

  // Modal states
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPriceCodeModal, setShowPriceCodeModal] = useState(false);

  // Search states
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  // Filtered data
  const [filteredAreas, setFilteredAreas] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);

  // Price Code Logic
  const [availablePriceCodes, setAvailablePriceCodes] = useState([]);
  const [appSettings, setAppSettings] = useState(null);

  // Default Price Codes
  const DEFAULT_PRICE_CODES = [
    { code: 'S1', name: 'Sales' },
    { code: 'S2', name: 'Retail' },
    { code: 'S3', name: 'DP' },
    { code: 'MR', name: 'MRP' },
    { code: 'CO', name: 'Cost' }
  ];
  
  // G STOCK State
  const [godownStock, setGodownStock] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState("");

  // Handle back press
  const handleBackPress = useCallback(() => {
    router.replace("/(tabs)/Home");
    return true;
  }, [router]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
    });

    loadFromDatabase();
    loadSettingsAndPriceCodes();

    return () => unsubscribe();
  }, []);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
      return () => subscription.remove();
    }, [handleBackPress])
  );

  // Load Settings and Calculate available price codes
  const loadSettingsAndPriceCodes = async () => {
    try {
      const settingsStr = await AsyncStorage.getItem('app_settings');
      const username = await AsyncStorage.getItem('username');
      let codes = DEFAULT_PRICE_CODES;

      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        setAppSettings(settings);

        if (settings.price_codes && settings.price_codes.length > 0) {
          codes = settings.price_codes;
        }

        // Filter based on restricted users
        if (username && settings.protected_price_users) {
          const upperUser = username.toUpperCase();
          const restrictedCodes = settings.protected_price_users[upperUser]; // Array of codes to HIDE

          if (restrictedCodes && Array.isArray(restrictedCodes)) {
            console.log(`[Entry] Filtering price codes for ${username}. Restricted:`, restrictedCodes);
            // Filter OUT the restricted codes
            codes = codes.filter(pc => !restrictedCodes.includes(pc.code));
          }
        }
      }

      setAvailablePriceCodes(codes);
      // Set default if valid
      if (codes.length > 0) {
        let defaultCode = null;
        // NEW: Prioritize default_price_code from settings
        if (appSettings && appSettings.default_price_code) { // Check appSettings state if already set, or parse locally
          // NOTE: appSettings might not be set yet if we just parsed it. Use local variable if needed.
          // Better to re-parse or use the local 'settings' variable if defined in scope.
        }

        // Re-using local 'settings' from if block is tricky due to scope. 
        // Let's rely on logic similar to above.
        let settingsRef = null;
        if (settingsStr) settingsRef = JSON.parse(settingsStr);

        if (settingsRef && settingsRef.default_price_code) {
          defaultCode = codes.find(c => c.code === settingsRef.default_price_code);
        }

        if (!defaultCode) {
          defaultCode = codes.find(c => c.code === 'S2') || codes[0];
        }

        if (defaultCode) {
          setSelectedPriceCode(defaultCode.code);
          setSelectedPriceName(defaultCode.name);
        }
      }

    } catch (e) {
      console.error('[Entry] Error loading settings:', e);
      setAvailablePriceCodes(DEFAULT_PRICE_CODES);
    }

    // Load Default Payment Method from AsyncStorage
    try {
      const defaultPayment = await AsyncStorage.getItem('settings_default_payment_method');
      if (defaultPayment) {
        // Map "Cash" to "Cash/Bank" since that's what's used in Entry.js
        const mappedPayment = defaultPayment === 'Cash' ? "Cash/Bank" :
          (defaultPayment === 'Credit' ? "Credit" : null);

        if (mappedPayment) {
          setSelectedPayment(mappedPayment);
          console.log(`[Entry] Applied default payment method: ${mappedPayment}`);
        }
      }
    } catch (e) {
      console.error('[Entry] Error loading default payment method:', e);
    }
  };

  const fetchGodownStock = async () => {
    try {
      setLoadingStock(true);
      const stock = await dbService.getGodownStock();
      setGodownStock(stock || []);
    } catch (error) {
      console.error('[Entry] Error fetching godown stock:', error);
    } finally {
      setLoadingStock(false);
    }
  };

  // Refresh stock on focus
  useFocusEffect(
    useCallback(() => {
      fetchGodownStock();
    }, [])
  );

  // Filter areas based on search
  useEffect(() => {
    if (areaSearchQuery.trim() === "") {
      setFilteredAreas(areaList);
    } else {
      const filtered = areaList.filter(area =>
        area.toLowerCase().includes(areaSearchQuery.toLowerCase())
      );
      setFilteredAreas(filtered);
    }
  }, [areaSearchQuery, areaList]);

  // Filter customers based on search and selected area
  useEffect(() => {
    let customers = debtorsData;

    // Filter by area if selected
    if (selectedArea) {
      customers = customers.filter(debtor => {
        const debtorArea = debtor.area && debtor.area.trim() !== "" ? debtor.area : debtor.place;
        return debtorArea === selectedArea;
      });
    }

    // Filter by search query
    if (customerSearchQuery.trim() !== "") {
      customers = customers.filter(customer =>
        customer.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
        customer.code.toLowerCase().includes(customerSearchQuery.toLowerCase())
      );
    }

    setFilteredCustomers(customers);
  }, [customerSearchQuery, debtorsData, selectedArea]);

  // Auto-select Price Code based on Customer Default
  useEffect(() => {
    // ---------------------------------------------------------
    // NEW LOGIC: Check read_price_category from settings
    // ---------------------------------------------------------
    if (appSettings && appSettings.read_price_category === false) {
      const targetDefault = appSettings.default_price_code || 'S1';

      // Try to find the full price object for the default code
      let foundPrice = availablePriceCodes.find(pc => pc.code === targetDefault);

      // If not in available, check ALL codes (in case it is restricted but is the system default)
      if (!foundPrice && appSettings.price_codes) {
        foundPrice = appSettings.price_codes.find(pc => pc.code === targetDefault);
      }

      // If still not found, check generic defaults
      if (!foundPrice) {
        foundPrice = DEFAULT_PRICE_CODES.find(pc => pc.code === targetDefault);
      }

      if (foundPrice) {
        if (selectedPriceCode !== foundPrice.code) {
          console.log(`[Entry] read_price_category is FALSE. Enforcing system default: ${foundPrice.code}`);
          setSelectedPriceCode(foundPrice.code);
          setSelectedPriceName(foundPrice.name);
        }
      } else {
        // Just set the code string if object not found
        if (selectedPriceCode !== targetDefault) {
          console.log(`[Entry] System default ${targetDefault} object not found. Forcing code.`);
          setSelectedPriceCode(targetDefault);
          setSelectedPriceName(targetDefault);
        }
      }
      return; // Stop processing customer-specific logic
    }
    // ---------------------------------------------------------

    if (selectedCustomer && selectedCustomer.remarkcolumntitle) {
      const code = selectedCustomer.remarkcolumntitle;
      // Check if this code is in the AVAILABLE (filtered) list for this user
      const foundInAvailable = availablePriceCodes.find(pc => pc.code === code);

      if (foundInAvailable) {
        if (selectedPriceCode !== foundInAvailable.code) {
          console.log(`[Entry] Auto-applying default price code: ${code}`);
          setSelectedPriceCode(foundInAvailable.code);
          setSelectedPriceName(foundInAvailable.name);
        }
      } else {
        // Customer has a specific code but it's not in the filtered available list
        // Search in ALL price codes (including restricted ones)
        const findCode = (list) => list && list.find(pc => String(pc.code).trim().toUpperCase() === String(code).trim().toUpperCase());

        let foundPrice = null;
        if (appSettings && appSettings.price_codes) {
          foundPrice = findCode(appSettings.price_codes);
        }
        if (!foundPrice) {
          foundPrice = findCode(DEFAULT_PRICE_CODES);
        }

        if (foundPrice) {
          if (selectedPriceCode !== foundPrice.code) {
            console.log(`[Entry] Auto-applying RESTRICTED price code for customer: ${foundPrice.code}`);
            setSelectedPriceCode(foundPrice.code);
            setSelectedPriceName(foundPrice.name);
          }
        } else {
          // Force the code even if no definition found
          if (selectedPriceCode !== code) {
            console.log(`[Entry] Forcing unknown price code from customer: ${code}`);
            setSelectedPriceCode(code);
            setSelectedPriceName(code);
          }
        }
      }
    } else if (selectedCustomer && !selectedCustomer.remarkcolumntitle && availablePriceCodes.length > 0) {
      // Customer has NO specific price code -> Revert to Default (System Default or First Available)

      let defaultCode = null;
      // Try to use system default first if available
      if (appSettings && appSettings.default_price_code) {
        defaultCode = availablePriceCodes.find(c => c.code === appSettings.default_price_code);
      }

      if (!defaultCode) {
        defaultCode = availablePriceCodes.find(c => c.code === 'S2') || availablePriceCodes[0];
      }

      if (defaultCode && selectedPriceCode !== defaultCode.code) {
        console.log(`[Entry] Customer has no default. Reverting to system default: ${defaultCode.code}`);
        setSelectedPriceCode(defaultCode.code);
        setSelectedPriceName(defaultCode.name);
      }
    }
  }, [selectedCustomer, availablePriceCodes, appSettings]); // Added appSettings dependency

  const loadFromDatabase = async () => {
    try {
      setLoading(true);
      await dbService.init();
      const allCustomers = await dbService.getCustomers();
      const filteredDebtors = allCustomers.filter((debtor) => debtor.super_code === "DEBTO");

      if (filteredDebtors.length === 0) {
        setLoading(false);
        Alert.alert(
          "No Customer Data",
          "No customer data found in local database. Please go to Home screen and click 'Download Data' button.",
          [
            { text: "Go to Home", onPress: () => router.replace("/(tabs)/Home") },
            { text: "Close", style: "cancel", onPress: () => router.back() }
          ]
        );
        return;
      }

      setDebtorsData(filteredDebtors);

      // ---------------------------------------------------------
      // AUTO-SELECT CUSTOMER LOGIC (Based on Account Code)
      // ---------------------------------------------------------
      const accountCode = await AsyncStorage.getItem('accountcode');
      let finalFilteredDebtors = filteredDebtors;
      let autoSelected = false;

      console.log(`[Entry] DEBUG: Account Code from Storage: '${accountCode}'`);

      if (accountCode && String(accountCode).trim() !== "") {
        const normalizedAccountCode = String(accountCode).trim().toUpperCase();
        console.log(`[Entry] DEBUG: Looking for match with: '${normalizedAccountCode}'`);

        // DEBUG: Print first 5 customer codes
        filteredDebtors.slice(0, 5).forEach(c =>
          console.log(`[Entry] DEBUG: Customer Code: '${c.code}', Normalized: '${String(c.code).trim().toUpperCase()}'`)
        );

        // STRICTER FIND
        const matchedCustomer = filteredDebtors.find(c =>
          String(c.code || '').trim().toUpperCase() === normalizedAccountCode
        );

        if (matchedCustomer) {
          console.log(`[Entry] Auto-selected LOCKED customer: ${matchedCustomer.name}`);
          // Restrict list to ONLY this customer
          finalFilteredDebtors = [matchedCustomer];

          // Trigger selection logic
          handleSelectCustomer(matchedCustomer);
          autoSelected = true;
          setIsCustomerLocked(true); // LOCK THE UI
        } else {
          console.log(`[Entry] DEBUG: No match found for account code '${normalizedAccountCode}'`);
        }
      } else {
        console.log('[Entry] DEBUG: No account code found for user.');
      }

      // Update debtors data if filtered
      if (autoSelected) {
        setDebtorsData(finalFilteredDebtors);
        setFilteredCustomers(finalFilteredDebtors);
      }

      // Load areas from database (from API)
      let areasFromDb = await dbService.getAreas();
      console.log(`[Entry] Loaded ${areasFromDb?.length || 0} areas from database`);

      // Fallback: if no areas in database, derive from customer data
      if (!areasFromDb || areasFromDb.length === 0) {
        console.log('[Entry] No areas in database, using customer-derived areas');
        const uniqueAreas = [...new Set(filteredDebtors.map((debtor) => {
          return debtor.area && debtor.area.trim() !== "" ? debtor.area : debtor.place;
        }))].filter(Boolean).sort();
        areasFromDb = uniqueAreas;
      }

      setAreaList(areasFromDb);
      setFilteredAreas(areasFromDb);
      setFilteredCustomers(filteredDebtors); // Ensure full list is available initially

      setUsingCache(false);
    } catch (error) {
      console.error('[Entry] Database load error:', error);
      // Fallback: Don't show alert, just log it. The offline banner will show if cache is used.
      // Alert.alert("Error", `Failed to load customer data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Pre-selection from Punch-In (navigation params)
  const params = useGlobalSearchParams();
  useEffect(() => {
    if (params?.preselectedCustomerCode && debtorsData.length > 0 && !loading) {
      console.log(`[Entry] Check for pre-selection: ${params.preselectedCustomerCode}`);
      // Find customer in loaded data
      const targetCustomer = debtorsData.find(c => c.code === params.preselectedCustomerCode);
      if (targetCustomer) {
        console.log(`[Entry] Auto-selecting pre-selected customer: ${targetCustomer.name}`);
        handleSelectCustomer(targetCustomer);
        setIsCustomerLocked(true); // Lock: cannot change customer when coming from Punch-In

        // Also set area if applicable, to keep UI consistent
        const customerArea = targetCustomer.area || targetCustomer.place;
        if (customerArea) {
          setSelectedArea(customerArea);
        }
      } else {
        console.warn(`[Entry] Pre-selected customer code ${params.preselectedCustomerCode} not found in database.`);
      }
    }
  }, [params?.preselectedCustomerCode, debtorsData, loading]);

  const handleRefresh = () => {
    setAreaSearchQuery("");
    setCustomerSearchQuery("");
    loadFromDatabase();
    loadSettingsAndPriceCodes();
  };

  const handleSelectArea = (area) => {
    setSelectedArea(area);
    setSelectedCustomer(null); // Reset customer when area changes
    setShowAreaModal(false);
    setAreaSearchQuery("");
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(false);
    setCustomerSearchQuery("");
  };

  const handleSelectPriceCode = (priceObj) => {
    setSelectedPriceCode(priceObj.code);
    setSelectedPriceName(priceObj.name);
    setShowPriceCodeModal(false);
  }

  const handleProceed = () => {
    /* Area is now optional
    if (!selectedArea) {
      Alert.alert("Validation Error", "Please select an area");
      return;
    }
    */

    if (!selectedCustomer) {
      Alert.alert("Validation Error", "Please select a customer");
      return;
    }

    if (!selectedPayment) {
      Alert.alert("Validation Error", "Please select a payment method");
      return;
    }

    router.push({
      pathname: "/Sales/SalesDetails",
      params: {
        area: selectedCustomer.place || selectedCustomer.area || selectedArea || "",
        customer: selectedCustomer.name,
        customerCode: selectedCustomer.code,
        payment: selectedPayment,
        priceCode: selectedPriceCode
      },
    });
  };

  if (loading) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.success.main} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.success.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Sales Entry</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={22} color={Colors.success.main} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {usingCache && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline" size={16} color={Colors.warning.main} />
              <Text style={styles.offlineText}>Using cached data</Text>
            </View>
          )}

          {/* Area Selection - Hidden if customer locked */}
          {!isCustomerLocked && (
            <View style={styles.formSection}>
              <Text style={styles.label}>
                Filter by Area
              </Text>
              <TouchableOpacity
                style={styles.inputBox}
                onPress={() => setShowAreaModal(true)}
              >
                <Ionicons name="location" size={20} color={selectedArea ? Colors.success.main : Colors.text.tertiary} style={styles.inputIcon} />
                <Text style={[styles.inputText, !selectedArea && styles.placeholderText]}>
                  {selectedArea || "Select Area"}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Customer Selection */}
          <View style={styles.formSection}>
            <Text style={styles.label}>
              {isCustomerLocked ? "Ordering For" : <>Select Customer <Text style={styles.required}>*</Text></>}
            </Text>

            {/* Show dropdown ONLY if NOT locked */}
            {!isCustomerLocked && (
              <TouchableOpacity
                style={styles.inputBox}
                onPress={() => setShowCustomerModal(true)}
              >
                <Ionicons name="person" size={20} color={selectedCustomer ? Colors.success.main : Colors.text.tertiary} style={styles.inputIcon} />
                <Text style={[styles.inputText, !selectedCustomer && styles.placeholderText]}>
                  {selectedCustomer ? selectedCustomer.name : "Select Customer"}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
            {selectedCustomer && (
              <View style={styles.selectedCustomerCard}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.avatarText}>{selectedCustomer.name.charAt(0)}</Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                  <Text style={styles.customerDetails}>
                    Code: {selectedCustomer.code} • {selectedCustomer.place || selectedCustomer.area}
                  </Text>
                </View>
                {/* Display Selected Price Code in Card */}
                {selectedPriceCode && (
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceBadgeText}>{selectedPriceName || selectedPriceCode}</Text>
                    <Text style={[styles.priceBadgeText, { fontSize: 8, opacity: 0.8 }]}>{selectedPriceCode}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Price Code Selection (Only if customer selected) */}
          {selectedCustomer && (
            <View style={styles.formSection}>
              <Text style={styles.label}>
                Price Level
              </Text>
              <TouchableOpacity
                style={styles.inputBox}
                onPress={() => setShowPriceCodeModal(true)}
              >
                <Ionicons name="pricetag" size={20} color={Colors.success.main} style={styles.inputIcon} />
                <Text style={styles.inputText}>
                  {selectedPriceName} ({selectedPriceCode})
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Payment Method */}
          <View style={styles.formSection}>
            <Text style={styles.label}>
              Payment Method <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.paymentContainer}>
              {paymentList.map((payment) => (
                <TouchableOpacity
                  key={payment}
                  style={[
                    styles.paymentButton,
                    selectedPayment === payment && styles.paymentButtonActive,
                  ]}
                  onPress={() => setSelectedPayment(payment)}
                  activeOpacity={0.8}
                >
                  {selectedPayment === payment && (
                    <LinearGradient
                      colors={Gradients.success}
                      style={styles.activeGradient}
                    />
                  )}
                  <Ionicons
                    name={payment === "Cash/Bank" ? "wallet" : "card"}
                    size={24}
                    color={selectedPayment === payment ? "#ffffff" : Colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.paymentText,
                      selectedPayment === payment && styles.paymentTextActive,
                    ]}
                  >
                    {payment}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* G.STOCK Button (Opens Report Modal) */}
          <TouchableOpacity
            style={styles.gStockButtonCard}
            onPress={() => setShowStockModal(true)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#f8fafc', '#f1f5f9']}
              style={styles.gStockButtonGradient}
            >
              <View style={styles.gStockButtonContent}>
                <View style={[styles.gStockIconContainer, { backgroundColor: Colors.success.main }]}>
                  <Ionicons name="bar-chart" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.gStockButtonTitle}>View Godown Stock (G.STOCK)</Text>
                  <Text style={styles.gStockButtonSubtitle}>Tap to view detailed inventory report</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Proceed Button */}
          <TouchableOpacity
            style={styles.proceedButton}
            onPress={handleProceed}
            activeOpacity={0.8}
          >
            <LinearGradient colors={Gradients.success} style={styles.proceedGradient}>
              <Text style={styles.proceedText}>Proceed to Products (Sales)</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>

          {/* View Orders Button */}
          <TouchableOpacity
            style={[styles.proceedButton, { marginTop: Spacing.md, backgroundColor: '#ffffff', borderWidth: 1, borderColor: Colors.success.main }]}
            onPress={() => router.push("/Sales/PlaceSales")}
            activeOpacity={0.8}
          >
            <View style={[styles.proceedGradient, { backgroundColor: 'transparent' }]}>
              <Text style={[styles.proceedText, { color: Colors.success.main }]}>View Placed Sales</Text>
              <Ionicons name="list" size={20} color={Colors.success.main} />
            </View>
          </TouchableOpacity>
        </View>

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
                    style={styles.listItem}
                    onPress={() => handleSelectArea(item)}
                  >
                    <View style={styles.listItemIcon}>
                      <Ionicons name="location" size={20} color={Colors.success.main} />
                    </View>
                    <Text style={styles.listItemText}>{item}</Text>
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
                  value={customerSearchQuery}
                  onChangeText={setCustomerSearchQuery}
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
                      <Text style={styles.customerCode}>Code: {item.code} • {item.place || item.area}</Text>
                    </View>
                    {selectedCustomer?.code === item.code && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success.main} />
                    )}
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

        {/* Price Code Selection Modal */}
        <Modal
          visible={showPriceCodeModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowPriceCodeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { height: '50%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Price Level</Text>
                <TouchableOpacity onPress={() => setShowPriceCodeModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={availablePriceCodes}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.listItem}
                    onPress={() => handleSelectPriceCode(item)}
                  >
                    <View style={styles.listItemIcon}>
                      <Ionicons name="pricetag" size={20} color={Colors.success.main} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemText}>{item.name}</Text>
                      <Text style={[styles.listItemText, { fontSize: 12, color: Colors.text.tertiary }]}>Code: {item.code}</Text>
                    </View>
                    {selectedPriceCode === item.code && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success.main} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No price codes available</Text>
                  </View>
                }
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {/* Stock Report Modal */}
        <Modal
          visible={showStockModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowStockModal(false)}
        >
          <View style={styles.stockModalOverlay}>
            <View style={styles.stockModalContent}>
              <View style={styles.stockModalHeader}>
                <View>
                  <Text style={styles.stockModalTitle}>Godown Stock</Text>
                  <Text style={styles.stockModalSubtitle}>Real-time inventory levels</Text>
                </View>
                <TouchableOpacity onPress={() => setShowStockModal(false)} style={styles.closeModalButton}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.stockSearchContainer}>
                <Ionicons name="search" size={20} color={Colors.text.tertiary} style={styles.searchIcon} />
                <TextInput
                  style={styles.stockSearchInput}
                  placeholder="Search by product name or code..."
                  value={stockSearchQuery}
                  onChangeText={setStockSearchQuery}
                  placeholderTextColor={Colors.text.tertiary}
                />
                {stockSearchQuery !== "" && (
                  <TouchableOpacity onPress={() => setStockSearchQuery("")}>
                    <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableLabel, { flex: 2 }]}>PRODUCT NAME</Text>
                <Text style={[styles.tableLabel, { flex: 1, textAlign: 'center' }]}>GODOWN</Text>
                <Text style={[styles.tableLabel, { flex: 0.8, textAlign: 'right' }]}>STOCK</Text>
              </View>

              <View style={{ flex: 1 }}>
                {loadingStock ? (
                  <View style={styles.modalCenter}>
                    <ActivityIndicator size="large" color={Colors.success.main} />
                    <Text style={styles.loadingStockText}>Updating report...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={godownStock.filter(item =>
                      item.product_name.toLowerCase().includes(stockSearchQuery.toLowerCase()) ||
                      (item.godown_name && item.godown_name.toLowerCase().includes(stockSearchQuery.toLowerCase()))
                    )}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item, index }) => (
                      <View style={[styles.reportRow, index % 2 === 0 && styles.reportRowEven]}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.reportProductName} numberOfLines={2}>{item.product_name}</Text>
                          <Text style={styles.reportProductCode}>Ref: {item.product || 'N/A'}</Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <View style={styles.godownBadge}>
                            <Text style={styles.godownBadgeText}>{item.godown_name || 'Main'}</Text>
                          </View>
                        </View>
                        <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                          <Text style={styles.reportStockQty}>{item.quantity}</Text>
                          <Text style={styles.reportStockUnit}>{item.unit || 'Nos'}</Text>
                        </View>
                      </View>
                    )}
                    ListEmptyComponent={
                      <View style={styles.modalCenter}>
                        <Ionicons name="search-outline" size={48} color={Colors.text.tertiary} />
                        <Text style={styles.emptyStockText}>No items match your search</Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: Colors.text.secondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginTop: 30,
  },
  headerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: "700",
    color: Colors.text.primary,
  },
  backButton: { padding: 4 },
  refreshButton: { padding: 4 },
  content: { flex: 1, padding: Spacing.lg },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning[50],
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: 8,
  },
  offlineText: {
    fontSize: Typography.sizes.sm,
    color: Colors.success.main,
    fontWeight: '700',
  },

  formSection: { marginBottom: Spacing.lg },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  required: { color: Colors.error.main },
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
  inputIcon: { marginRight: Spacing.sm },
  inputText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  placeholderText: { color: Colors.text.tertiary },

  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary[50],
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },

  paymentContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  paymentButton: {
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
  paymentButtonActive: { borderColor: 'transparent' },
  activeGradient: { ...StyleSheet.absoluteFillObject },
  paymentText: {
    fontSize: Typography.sizes.base,
    fontWeight: "600",
    color: Colors.text.secondary,
    zIndex: 1,
  },
  paymentTextActive: { color: "#ffffff" },

  proceedButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xl,
    ...Shadows.colored.primary,
  },
  proceedGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: 8,

  },
  proceedText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Modal styles
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
  searchIcon: { marginRight: Spacing.sm },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.success[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  listItemText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
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
    backgroundColor: Colors.success[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.success.main,
  },
  customerInfo: { flex: 1 },
  customerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  customerCode: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  customerDetails: {
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

  priceBadge: {
    backgroundColor: Colors.success.main,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  priceBadgeText: {
    color: '#ffffff',
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
  },

  // G.STOCK Button Card
  gStockButtonCard: {
    backgroundColor: '#ffffff',
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eef2f6',
    ...Shadows.md,
  },
  gStockButtonGradient: {
    padding: Spacing.md,
  },
  gStockButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gStockButtonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  gStockButtonSubtitle: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  gStockIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success.main,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stock Report Modal Styles
  stockModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  stockModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    height: '92%',
    padding: Spacing.lg,
  },
  stockModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  stockModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  stockModalSubtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 4,
  },
  closeModalButton: {
    padding: 4,
  },
  stockSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginBottom: Spacing.lg,
  },
  stockSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text.primary,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    backgroundColor: '#f8fafc',
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  tableLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.text.tertiary,
    letterSpacing: 1,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reportRowEven: {
    backgroundColor: '#fafafa',
  },
  reportProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  reportProductCode: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  godownBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  godownBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  reportStockQty: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.success.main,
  },
  reportStockUnit: {
    fontSize: 9,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingStockText: {
    marginTop: 12,
    color: Colors.text.secondary,
    fontSize: 14,
  },
});