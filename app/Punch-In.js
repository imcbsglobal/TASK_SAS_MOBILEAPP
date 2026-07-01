import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from "expo-linear-gradient";
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from "expo-router";
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../constants/theme";
import dbService from "../src/services/database";
import pdfService from "../src/services/pdfService";
import printerService from "../src/services/printerService";

// LayoutAnimation setup for Android
if (Platform.OS === 'android') {
  if (UIManager && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const { width, height } = Dimensions.get('window');
const isSmallDevice = width < 360;
const scale = (size) => Math.round(size * (width / 390));

// Haversine formula to calculate distance in meters
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  // Parse all to float to handle string coordinates from API
  const φ1 = deg2rad(parseFloat(lat1));
  const φ2 = deg2rad(parseFloat(lat2));
  const dLat = deg2rad(parseFloat(lat2) - parseFloat(lat1));
  const dLon = deg2rad(parseFloat(lon2) - parseFloat(lon1));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

export default function PunchInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Data State
  const [allCustomers, setAllCustomers] = useState([]);
  const [areas, setAreas] = useState([]);

  // Selection State
  const [selectedArea, setSelectedArea] = useState("All");
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState("");
  const [step, setStep] = useState(1); // 1: Selection, 2: Action

  // Searchable Picker State
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [pickerFilteredCustomers, setPickerFilteredCustomers] = useState([]);
  const [showAreaPicker, setShowAreaPicker] = useState(false); // iOS Area Picker

  // Location Log State
  const [rawLocations, setRawLocations] = useState([]);
  const [showLocationLog, setShowLocationLog] = useState(false);

  // Punch/Location State
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [punchStatus, setPunchStatus] = useState(null);
  const [workHours, setWorkHours] = useState(0);

  // Selfie/Action State
  const [selfieUri, setSelfieUri] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInlineCamera, setShowInlineCamera] = useState(false);
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [notes, setNotes] = useState("");
  const [punching, setPunching] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState("");
  const [punchinStatusToPost, setPunchinStatusToPost] = useState("");
  const [showDistanceSetting, setShowDistanceSetting] = useState(false);

  // Transaction Management State
  const [expandedSection, setExpandedSection] = useState(null); // 'pending' | 'uploaded'
  const [selectedSubCategory, setSelectedSubCategory] = useState(null); // 'Order', 'Sales', 'Return', 'Collection'

  useFocusEffect(
    useCallback(() => {
      loadData();
      getCurrentLocation();
      checkPunchStatus();
      loadShowDistanceSetting();
    }, [])
  );

  // Update work hours every minute if punched in
  useEffect(() => {
    if (punchStatus?.is_punched_in) {
      const interval = setInterval(() => {
        setWorkHours(prev => prev + (1 / 60));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [punchStatus?.is_punched_in]);

  // Sort customers alphabetically
  // Filter and Sort customers based on Area
  // Filter and Sort customers based on Area
  useEffect(() => {
    let filtered = [...allCustomers];

    // Filter by Area if not "All"
    if (selectedArea && selectedArea !== "All") {
      filtered = filtered.filter(c => {
        // Logic from Entry.js: Check area OR place
        const customerArea = c.area && c.area.trim() !== "" ? c.area : c.place;
        return customerArea === selectedArea;
      });
    }

    const sorted = filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setFilteredCustomers(sorted);
  }, [allCustomers, selectedArea]);

  // Reset selection when Area changes
  useEffect(() => {
    setSelectedCustomerCode("");
    setCustomerSearchQuery("");
  }, [selectedArea]);

  // Filter customers for Picker Search
  useEffect(() => {
    if (!showCustomerPicker) return;

    const query = customerSearchQuery.toLowerCase();
    const filtered = filteredCustomers.filter(c =>
      (c.name || "").toLowerCase().includes(query) ||
      (c.code || "").toLowerCase().includes(query)
    );
    setPickerFilteredCustomers(filtered);
  }, [customerSearchQuery, filteredCustomers, showCustomerPicker]);

  // If punched in, auto-select customer and move to Step 2
  useEffect(() => {
    if (!loading && step === 1 && punchStatus?.is_punched_in && allCustomers.length > 0) {
      // Find customer by code (most reliable) or firm_name
      const customer = allCustomers.find(c => 
        (punchStatus.customer_code && c.code === punchStatus.customer_code) || 
        (punchStatus.firm_name && c.name === punchStatus.firm_name)
      );

      if (customer) {
        console.log('[PunchIn] Auto-navigating to active punch at:', customer.name);
        setSelectedCustomerCode(customer.code);
        setStep(2);
      }
    }
  }, [punchStatus, allCustomers, loading, step]);

  const checkPunchStatus = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const response = await fetch('https://tasksas.com/api/punch-status/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[PunchIn] Status:', data);
        if (data.success && data.is_punched_in && data.data) {
          setPunchStatus({
            ...data.data,
            is_punched_in: true,
            // Normalize ID and Codes to handle inconsistencies in API responses across different users/sessions
            punchin_id: data.data.punchin_id || data.data.id,
            firm_code: data.data.firm_code || data.data.customer_code,
            customer_code: data.data.customer_code || data.data.firm_code
          });
          setWorkHours(data.data.current_work_hours || 0);

          // Optional: If punched in, maybe auto-select the customer?
          // We need to find the customer in our list.
          // This might be tricky if the list hasn't loaded yet.
        } else {
          setPunchStatus(null);
          setWorkHours(0);
        }
      }
    } catch (error) {
      console.error('[PunchIn] Error checking status:', error);
    }
  };

  const loadShowDistanceSetting = async () => {
    try {
      const val = await AsyncStorage.getItem('settings_show_distance');
      setShowDistanceSetting(val === 'true');
      console.log('[PunchIn] Show Distance Setting:', val === 'true');
    } catch (error) {
      console.error('[PunchIn] Error loading show distance setting:', error);
    }
  };

  // --- Transaction Management Logic ---

  const handleManagementSectionPress = (section) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedSection === section) {
      setExpandedSection(null);
      setSelectedSubCategory(null);
    } else {
      setExpandedSection(section);
      setSelectedSubCategory(null);
    }
  };

  const handleSubCategoryPress = (category) => {
    router.push({
      pathname: "/Management/TransactionList",
      params: { type: expandedSection, category: category }
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        Alert.alert("Error", "User not authenticated. Please login.");
        setLoading(false);
        return;
      }

      console.log("[PunchIn] Fetching areas, shop locations, and debtors concurrently...");
      const username = await AsyncStorage.getItem("username");
      if (username) setLoggedInUser(username);

      const fetchOptions = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const [areaResponse, shopLocResponse, debtorsResp] = await Promise.all([
        fetch('https://tasksas.com/api/area/list/', fetchOptions).catch(e => { console.error("Area API error", e); return null; }),
        fetch('https://tasksas.com/api/shop-location/table/', fetchOptions).catch(e => { console.error("Shop Location API error", e); return null; }),
        fetch('https://tasksas.com/api/debtors/get-debtors/', fetchOptions).catch(e => { console.error("Debtors API error", e); return null; })
      ]);

      // Process Areas
      let fetchedAreas = ["All"];
      if (areaResponse && areaResponse.ok) {
        const areaData = await areaResponse.json();
        console.log("[PunchIn] Areas API Result:", areaData);
        if (areaData.success && Array.isArray(areaData.areas)) {
          fetchedAreas = ["All", ...areaData.areas.sort()];
        }
      }
      setAreas(fetchedAreas);

      // Process Shop Locations
      if (!shopLocResponse || !shopLocResponse.ok) {
        throw new Error(`Shop Location API error! status: ${shopLocResponse ? shopLocResponse.status : 'network/timeout'}`);
      }
      const result = await shopLocResponse.json();
      let firms = [];
      if (Array.isArray(result)) {
        firms = result;
      } else if (result.data && Array.isArray(result.data)) {
        firms = result.data;
      } else if (result.firms && Array.isArray(result.firms)) {
        firms = result.firms;
      }

      console.log(`[PunchIn] Fetched ${firms.length} shop locations for log`);
      setRawLocations(firms);

      // Create a Set of Verified Firm Codes (Status != 'pending')
      const verifiedFirmCodes = new Set();
      const firmLocationMap = new Map(); // Map to store coordinates by firm_code

      firms.forEach(firm => {
        // normalizing code to string and trimming
        const code = String(firm.firm_code || '').trim();
        const status = String(firm.status || '').toLowerCase();

        if (code && status !== 'pending') {
          verifiedFirmCodes.add(code);
          // Store coordinates for this firm
          firmLocationMap.set(code, {
            latitude: firm.latitude,
            longitude: firm.longitude,
            storeName: firm.storeName,
            storeLocation: firm.storeLocation
          });
        }
      });

      console.log(`[PunchIn] Found ${verifiedFirmCodes.size} verified firm codes`);

      // Process Debtors
      if (!debtorsResp || !debtorsResp.ok) {
        throw new Error(`Debtors API error! status: ${debtorsResp ? debtorsResp.status : 'network/timeout'}`);
      }

      const debtorsData = await debtorsResp.json();
      let debtors = [];
      if (Array.isArray(debtorsData)) {
        debtors = debtorsData;
      } else if (debtorsData.data && Array.isArray(debtorsData.data)) {
        debtors = debtorsData.data;
      } else if (debtorsData.debtors && Array.isArray(debtorsData.debtors)) {
        debtors = debtorsData.debtors;
      }

      console.log(`[PunchIn] Fetched ${debtors.length} debtors for selection`);

      // MAPPING Debtors: code, name, place, balance, client_id
      // AND merge coordinates from shop location API
      const mappedCustomers = debtors.map(debtor => {
        const customerCode = String(debtor.code || debtor.id?.toString() || '').trim();
        const locationData = firmLocationMap.get(customerCode);

        const rawLat = locationData?.latitude ?? debtor.latitude;
        const rawLon = locationData?.longitude ?? debtor.longitude;
        const parsedLat = parseFloat(rawLat);
        const parsedLon = parseFloat(rawLon);

        return {
          ...debtor,
          code: debtor.code || debtor.id?.toString(),
          name: debtor.name || "Unknown Debtor",
          place: debtor.place || debtor.area || '',
          area: debtor.area || '',
          balance: debtor.balance || 0,
          client_id: debtor.client_id,
          latitude: isNaN(parsedLat) ? null : parsedLat,
          longitude: isNaN(parsedLon) ? null : parsedLon,
        };
      });

      // APPLY FILTER: Only show verified customers
      const verifiedCustomers = mappedCustomers.filter(c => {
        const code = String(c.code || '').trim();
        return verifiedFirmCodes.has(code);
      });

      console.log(`[PunchIn] Filtered ${mappedCustomers.length} -> ${verifiedCustomers.length} verified customers`);

      setAllCustomers(verifiedCustomers);
      setFilteredCustomers(verifiedCustomers);
    } catch (error) {
      console.error("[PunchIn] Error loading data:", error);
      Alert.alert("Error", `Failed to load shop locations: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setRefreshingLocation(true);

      // 1. Check Permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required for Punch In/Out.');
        setRefreshingLocation(false);
        return;
      }

      // 2. Check Device Services (GPS enabled?)
      const providerStatus = await Location.getProviderStatusAsync();
      if (!providerStatus.locationServicesEnabled) {
        Alert.alert(
          "Location Disabled",
          "Please enable Location Services (GPS) on your device to proceed.",
          [{ text: "OK" }]
        );
        setRefreshingLocation(false);
        return;
      }

      // 3. Attempt High Accuracy Fetch
      try {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          timeout: 10000 // Increased to 10 seconds
        });
        setCurrentLocation(location.coords);
      } catch (highAccuracyError) {
        console.warn("High accuracy location failed, retrying with balanced...", highAccuracyError);

        // 4. Fallback to Balanced Accuracy
        try {
          let location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeout: 10000 // Increased to 10 seconds
          });
          setCurrentLocation(location.coords);
        } catch (balancedError) {
          console.warn("Balanced location failed, trying last known...", balancedError);

          // 5. Final Fallback: Last Known Position
          try {
            let lastLocation = await Location.getLastKnownPositionAsync();
            if (lastLocation) {
              setCurrentLocation(lastLocation.coords);
              Alert.alert("Location Warning", "Using last known location. Some features may be less accurate.");
            } else {
              throw new Error("No last known location available.");
            }
          } catch (lastKnownError) {
            console.error("All location fetch attempts failed:", lastKnownError);
            Alert.alert(
              "Location Error",
              "Could not determine your location. Please ensure GPS is ON and you have a clear view of the sky, then try again."
            );
          }
        }
      }
    } catch (error) {
      console.error("Error getting current location:", error);
      Alert.alert("Location Error", "An unexpected error occurred while fetching location.");
    } finally {
      setRefreshingLocation(false);
    }
  };

  const handleProceed = () => {
    if (!selectedCustomerCode) {
      Alert.alert("Selection Required", "Please select a customer to proceed.");
      return;
    }
    setStep(2);
  };

  const handleReset = () => {
    setStep(1);
  };

  const getSelectedCustomerDetails = () => {
    return allCustomers.find(c => c.code === selectedCustomerCode);
  };

  const startPunchInFlow = async () => {
    const customer = getSelectedCustomerDetails();
    if (!customer) return;

    if (punchStatus?.is_punched_in) {
      Alert.alert("Already Punched In", `You are currently punched in at ${punchStatus.firm_name}. Please punch out first.`);
      await savePunchAttemptLog({
        status: 'failed',
        time: new Date().toISOString(),
        firm_name: customer?.name || '',
        message: `Already punched in at ${punchStatus.firm_name}`,
      });
      return;
    }

    // Use already fetched location to eliminate lag
    let freshLocation = currentLocation;

    // Only try to fetch if we don't have it yet
    if (!freshLocation) {
      setPunching(true);
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 3000
        });
        freshLocation = loc.coords;
        setCurrentLocation(loc.coords);
      } catch {
        freshLocation = null;
      } finally {
        setPunching(false);
      }
    }

    if (!freshLocation) {
      Alert.alert("Location Missing", "Could not get your current location. Please enable GPS and try again.");
      await savePunchAttemptLog({
        status: 'failed',
        time: new Date().toISOString(),
        firm_name: customer?.name || '',
        message: 'Location unavailable — GPS could not be acquired',
      });
      return;
    }

    // Check distance if Show Distance setting is enabled
    if (showDistanceSetting && customer.latitude && customer.longitude) {
      const distance = getDistanceFromLatLonInMeters(
        freshLocation.latitude,
        freshLocation.longitude,
        customer.latitude,
        customer.longitude
      );

      console.log(`[PunchIn] Distance to shop: ${distance.toFixed(1)}m`);

      if (distance <= 100) {
        setPunchinStatusToPost("correct location");
        Alert.alert(
          "Correct Location",
          `You are ${distance.toFixed(0)}m from the shop. Proceeding with punch in.`,
          [{ text: "OK", onPress: () => takeSelfie() }]
        );
      } else {
        setPunchinStatusToPost("mismatch location");
        Alert.alert(
          "Mismatch Location",
          `You are ${distance >= 1000 ? (distance / 1000).toFixed(1) + 'km' : distance.toFixed(0) + 'm'} from the shop. You are outside the 100m range.`,
          [{ text: "OK", onPress: () => takeSelfie() }]
        );
      }
    } else {
      // Skip location cross-checking if setting is disabled
      setPunchinStatusToPost("location check skipped");
      takeSelfie();
    }
  };

  const takeSelfie = async () => {
    try {
      setShowConfirmModal(false);
      setSelfieUri(null);

      // We use the expo-camera permission hook here
      if (!cameraPermission?.granted) {
        const { granted } = await requestCameraPermission();
        if (!granted) {
          Alert.alert("Permission denied", "Camera permission is required for selfie verification.");
          const _cust = getSelectedCustomerDetails();
          await savePunchAttemptLog({
            status: 'failed',
            time: new Date().toISOString(),
            firm_name: _cust?.name || '',
            message: 'Camera permission denied',
          });
          return;
        }
      }

      // Open our inline camera modal instead of external intent
      setShowInlineCamera(true);

    } catch (error) {
      console.error("[PunchIn] Camera prep error:", error);
      Alert.alert("Error", "Failed to open camera. Please try again.");
    }
  };

  const handleCaptureSelfie = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.1,
          base64: false,
        });
        if (photo && photo.uri) {
          setSelfieUri(photo.uri);
          setShowInlineCamera(false);
          setShowConfirmModal(true);
        }
      } catch (e) {
        console.error("Capture error", e);
        Alert.alert("Error", "Could not capture image");
      }
    }
  };

  // ---- Punch Attempt Log Helper ----
  const savePunchAttemptLog = async ({ status, time, firm_name, message }) => {
    try {
      const username = await AsyncStorage.getItem("username");
      const logKey = `punch_attempt_logs_${username}`;
      const existingRaw = await AsyncStorage.getItem(logKey);
      let logs = existingRaw ? JSON.parse(existingRaw) : [];
      logs = [{ status, time, firm_name: firm_name || '', message: message || '' }, ...logs];
      await AsyncStorage.setItem(logKey, JSON.stringify(logs));
    } catch (e) {
      console.error('[PunchIn] Log save error:', e);
    }
  };
  // ------------------------------------

  const confirmPunchIn = async () => {
    console.log('[PunchIn] ===== confirmPunchIn CALLED =====');
    const customer = getSelectedCustomerDetails();
    console.log('[PunchIn] Customer:', customer?.code);
    console.log('[PunchIn] SelfieUri:', !!selfieUri);
    console.log('[PunchIn] CurrentLocation:', !!currentLocation);
    console.log('[PunchIn] PunchinStatusToPost:', punchinStatusToPost);

    if (!selfieUri || !customer || !currentLocation) {
      console.log('[PunchIn] Missing required data, returning');
      await savePunchAttemptLog({
        status: 'failed',
        time: new Date().toISOString(),
        firm_name: customer?.name || '',
        message: `Missing required data — selfie: ${!!selfieUri}, customer: ${!!customer}, location: ${!!currentLocation}`,
      });
      return;
    }

    try {
      console.log('[PunchIn] Setting punching to true');
      setPunching(true);
      console.log('[PunchIn] Getting auth token');
      const token = await AsyncStorage.getItem("authToken");

      let address = "";
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        });
        if (geocode && geocode.length > 0) {
          const loc = geocode[0];
          address = [loc.street, loc.city, loc.region, loc.country].filter(Boolean).join(', ');
        }
      } catch (e) {
        console.warn("Geocoding failed:", e);
      }

      const formData = new FormData();
      formData.append('customerCode', customer.code);
      formData.append('latitude', currentLocation.latitude.toString());
      formData.append('longitude', currentLocation.longitude.toString());
      formData.append('current_location', `${currentLocation.latitude},${currentLocation.longitude}`);

      // Safety check for customer coordinates
      const shopLat = customer.latitude || 0;
      const shopLon = customer.longitude || 0;
      formData.append('shop_location', `${shopLat},${shopLon}`);
      formData.append('punchin_status', punchinStatusToPost || 'unknown');
      formData.append('address', address || 'Unknown');
      formData.append('notes', notes || '');

      const filename = selfieUri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('image', {
        uri: selfieUri,
        name: filename,
        type: type
      });

      console.log('[PunchIn] ===== DATA BEING POSTED TO API =====');
      console.log('[PunchIn] customerCode:', customer.code);
      console.log('[PunchIn] latitude:', currentLocation.latitude);
      console.log('[PunchIn] longitude:', currentLocation.longitude);
      console.log('[PunchIn] current_location:', `${currentLocation.latitude},${currentLocation.longitude}`);
      console.log('[PunchIn] shop_location:', `${shopLat},${shopLon}`);
      console.log('[PunchIn] punchin_status:', punchinStatusToPost || 'unknown');
      console.log('[PunchIn] address:', address || 'Unknown');
      console.log('[PunchIn] notes:', notes || '');
      console.log('[PunchIn] image:', filename);
      console.log('[PunchIn] ==========================================');

      console.log('[PunchIn] Posting punch-in...');
      const response = await fetch('https://tasksas.com/api/punch-in/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      const result = await response.json();
      console.log('[PunchIn] Response:', result);

      if (response.ok && result.success) {
        // --- ADDED: Save to Punch History ---
        try {
          const username = await AsyncStorage.getItem("username");
          const historyKey = `punch_history_${username}`;
          const existingHistoryRaw = await AsyncStorage.getItem(historyKey);
          let history = existingHistoryRaw ? JSON.parse(existingHistoryRaw) : [];
          
          const newRecord = {
            id: result.data.punchin_id || result.data.id,
            firm_name: result.data.firm_name,
            punchin_time: result.data.punchin_time,
            punchout_time: null,
            duration: null
          };
          
          // Prepend and keep all
          history = [newRecord, ...history];
          await AsyncStorage.setItem(historyKey, JSON.stringify(history));
        } catch (histErr) {
          console.error('[PunchIn] History save error:', histErr);
        }
        // ------------------------------------

        // --- Save Punch Attempt Log (Success) ---
        await savePunchAttemptLog({
          status: 'success',
          time: new Date().toISOString(),
          firm_name: result.data.firm_name,
          message: `Punched in at ${result.data.firm_name}`
        });
        // ----------------------------------------

        // Immediately update punch status from the response — no second API call needed.
        // This avoids a timing issue where checkPunchStatus() might not yet see the new punch-in.
        setPunchStatus({
          ...result.data,
          is_punched_in: true,
          firm_name: result.data.firm_name,
          // Normalize ID and Codes consistently with checkPunchStatus
          punchin_id: result.data.punchin_id || result.data.id,
          firm_code: result.data.firm_code || result.data.customer_code,
          customer_code: result.data.customer_code || result.data.firm_code
        });
        setWorkHours(0);

        Alert.alert(
          "Punch In Successful",
          `Punched in at ${result.data.firm_name}\nTime: ${new Date(result.data.punchin_time).toLocaleTimeString()}`,
          [
            {
              text: "OK",
              onPress: () => {
                closeConfirmModal();
                setStep(2);
              }
            }
          ]
        );
      } else {
        // --- Save Punch Attempt Log (Failed - API rejection) ---
        await savePunchAttemptLog({
          status: 'failed',
          time: new Date().toISOString(),
          firm_name: customer?.name || '',
          message: result.message || 'API rejected punch-in'
        });
        // -------------------------------------------------------
        Alert.alert("Error", result.message || "Failed to punch in");
      }
    } catch (error) {
      // --- Save Punch Attempt Log (Failed - Network/Exception) ---
      try {
        await savePunchAttemptLog({
          status: 'failed',
          time: new Date().toISOString(),
          firm_name: getSelectedCustomerDetails()?.name || '',
          message: error?.message || 'Network or unexpected error'
        });
      } catch (_) {}
      // -----------------------------------------------------------
      console.error("[PunchIn] Error:", error);
      Alert.alert("Error", "Failed to punch in. Please try again.");
    } finally {
      setPunching(false);
    }
  };

  const handlePunchOut = async () => {
    const customer = getSelectedCustomerDetails();
    if (!punchStatus?.punchin_id) {
      console.warn('[PunchOut] Cannot punch out: punchin_id is missing', punchStatus);
      Alert.alert("Error", "Could not find active punch-in record. Please refresh.");
      return;
    }

    Alert.alert(
      "Confirm Punch Out",
      `Are you sure you want to punch out from ${customer.name}?\n\nWork Hours: ${workHours.toFixed(3)} hrs`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Punch Out",
          style: "destructive",
          onPress: async () => {
            if (punching) {
              console.log("[PunchOut] Already in progress, ignoring double-click");
              return;
            }
            try {
              setPunching(true);
              const token = await AsyncStorage.getItem("authToken");

              const url = `https://tasksas.com/api/punch-out/${punchStatus.punchin_id}/`;
              console.log('[PunchOut] URL:', url);
              console.log('[PunchOut] punchin_id:', punchStatus.punchin_id);
              console.log('[PunchOut] currentLocation:', currentLocation);

              // Reverse geocode for address
              let punchOutAddress = '';
              try {
                if (currentLocation) {
                  const geocode = await Location.reverseGeocodeAsync({
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude
                  });
                  if (geocode && geocode.length > 0) {
                    const loc = geocode[0];
                    punchOutAddress = [loc.street, loc.city, loc.region, loc.country].filter(Boolean).join(', ');
                  }
                }
              } catch (e) {
                console.warn('[PunchOut] Geocoding failed:', e);
              }
              // Build request body using FormData for consistency with Punch-In API
              const formData = new FormData();
              
              // Priority 1: locally selected code, Priority 2: firm_code, Priority 3: customer_code
              const resolvedCustomerCode = (customer?.code || punchStatus.firm_code || punchStatus.customer_code || "").toString().trim();
              
              // 1. Find shop coordinates for distance check
              let targetCustomer = customer;
              if (!targetCustomer && resolvedCustomerCode && allCustomers.length > 0) {
                targetCustomer = allCustomers.find(c => (c.code || "").toString().trim() === resolvedCustomerCode);
              }

              const shopLat = targetCustomer?.latitude || 0;
              const shopLon = targetCustomer?.longitude || 0;
              
              // 2. Calculate distance and determined override status
              let locationStatus = "unknown";
              let distance = -1;

              if (currentLocation && shopLat && shopLon) {
                distance = getDistanceFromLatLonInMeters(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  shopLat,
                  shopLon
                );
                locationStatus = distance <= 100 ? "correct location" : "mismatch location";
              } else {
                // If coordinates are missing, we force mismatch to try and bypass the check
                locationStatus = "mismatch location";
              }

              console.log(`[PunchOut] Distance: ${distance.toFixed(1)}m, Status: ${locationStatus}`);

              formData.append('customerCode', resolvedCustomerCode);
              formData.append('notes', notes || '');
              
              // Include shop location and status to enable bypass (same as punch-in)
              formData.append('shop_location', `${shopLat},${shopLon}`);
              formData.append('punchin_status', locationStatus);
              
              // Include multiple variations for robustness
              const backupCode = punchStatus.firm_code || punchStatus.customer_code || customer?.code || "";
              if (backupCode) {
                formData.append('firm_code', backupCode);
                formData.append('customer_code', backupCode); // underscore version
              }

              if (currentLocation) {
                formData.append('latitude', currentLocation.latitude.toString());
                formData.append('longitude', currentLocation.longitude.toString());
                formData.append('current_location', `${currentLocation.latitude},${currentLocation.longitude}`);
              }
              if (punchOutAddress) {
                formData.append('address', punchOutAddress);
              }

              console.log('[PunchOut] Payload:', resolvedCustomerCode, locationStatus);

              // URL with trailing slash is usually required by this backend to avoid redirects
              const urlWithSlash = `https://tasksas.com/api/punch-out/${punchStatus.punchin_id}/`;

              const response = await fetch(urlWithSlash, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
                },
                body: formData
              });

              console.log('[PunchOut] HTTP Status:', response.status);
              const responseText = await response.text();
              console.log('[PunchOut] Raw response:', responseText);

              let result;
              try {
                result = JSON.parse(responseText);
              } catch (e) {
                result = { success: false, message: responseText };
              }

              if (response.ok && (result.success || result.status === 'success')) {
                // --- ADDED: Update Punch History ---
                try {
                  const username = await AsyncStorage.getItem("username");
                  const historyKey = `punch_history_${username}`;
                  const existingHistoryRaw = await AsyncStorage.getItem(historyKey);
                  if (existingHistoryRaw) {
                    let history = JSON.parse(existingHistoryRaw);
                    const punchId = punchStatus.punchin_id;
                    const recordIndex = history.findIndex(r => r.id === punchId);
                    
                    if (recordIndex !== -1) {
                      history[recordIndex].punchout_time = new Date().toISOString();
                      history[recordIndex].duration = result.data?.work_duration_hours || result.data?.duration || workHours;
                      await AsyncStorage.setItem(historyKey, JSON.stringify(history));
                    }
                  }
                } catch (histErr) {
                  console.error('[PunchOut] History update error:', histErr);
                }
                // ------------------------------------

                Alert.alert(
                  "Punch Out Successful",
                  `Work Duration: ${result.data?.work_duration_hours?.toFixed(3) || 0} hours`,
                  [
                    { 
                      text: "OK", 
                      onPress: () => router.replace("/(tabs)/Home") 
                    }
                  ]
                );

                setPunchStatus(null);
                setWorkHours(0);
                setTimeout(() => {
                  checkPunchStatus();
                }, 1000);
              } else {
                const errMsg = result.message || result.detail || result.error || responseText || `HTTP ${response.status}`;
                console.error('[PunchOut] API Error:', errMsg, result);

                // --- SMART FAILSAFE ---
                // If the server says "no active punch found" or the session is already closed/not found,
                // we treat it as a success locally to resync the state.
                const fullErrorText = (errMsg + JSON.stringify(result)).toLowerCase();
                const isStaleIdError = fullErrorText.includes("no active punch") || 
                                      fullErrorText.includes("provided id") ||
                                      fullErrorText.includes("already be punched out") ||
                                      fullErrorText.includes("not found") ||
                                      response.status === 404;

                if (isStaleIdError) {
                  console.log("[PunchOut] Server says punch is already closed or ID is invalid. Treating as success locally.");
                  
                  // Clear local record of active punch
                  setPunchStatus(null);
                  setWorkHours(0);

                  Alert.alert(
                    "Session Resynced",
                    "This punch session was already closed on the server. Returning to home.",
                    [{ text: "OK", onPress: () => router.replace("/(tabs)/Home") }]
                  );
                } else {
                  Alert.alert("Punch Out Failed", errMsg);
                }
              }

            } catch (error) {
              console.error("[PunchOut] Error:", error);
              Alert.alert("Error", `Failed to punch out: ${error.message}`);
            } finally {
              setPunching(false);
            }
          }
        }
      ]
    );
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setSelfieUri(null);
    setNotes("");
  };

  const handleNavigateToActivePunch = () => {
    if (!punchStatus?.is_punched_in) return;

    // Find the customer that matches the active punch
    // We prioritize matching by Name as that is definitely in punchStatus
    // Ideally we would use code, but punchStatus might not have it unless we check the API response structure again.
    // Based on previous code: result.data.firm_name is used.
    const activeCustomer = allCustomers.find(c => c.name === punchStatus.firm_name);

    if (activeCustomer) {
      setSelectedCustomerCode(activeCustomer.code);
      setStep(2);
    } else {
      Alert.alert("Error", "Could not find the active customer in your list.");
    }
  };


  const renderSelectionStep = () => {
    const selectedCustomer = getSelectedCustomerDetails();

    return (
      <View style={styles.formContainer}>
        <Text style={styles.stepTitle}>Select Customer for Punch-In</Text>

        {punchStatus?.is_punched_in && (
          <TouchableOpacity
            style={styles.statusBannerSmall}
            onPress={handleNavigateToActivePunch}
          >
            <Ionicons name="time" size={24} color={Colors.primary.main} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTextSmall}>
                Punched in at {punchStatus.firm_name}
              </Text>
              <Text style={styles.statusSubtextSmall}>
                Tap here to Punch Out
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary.main} />
          </TouchableOpacity>
        )}
        {/* Area Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Area (Optional)</Text>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity 
              style={styles.searchablePickerTrigger}
              onPress={() => setShowAreaPicker(true)}
            >
              <Text style={styles.searchablePickerText}>{selectedArea || "All"}</Text>
              <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={selectedArea}
                onValueChange={(itemValue) => setSelectedArea(itemValue)}
                style={styles.picker}
                dropdownIconColor={Colors.text.primary}
              >
                {areas.map((area, index) => (
                  <Picker.Item
                    key={index}
                    label={area || "All"}
                    value={area}
                    style={styles.pickerItem}
                  />
                ))}
              </Picker>
            </View>
          )}
        </View>

        {/* Customer Selection - Searchable */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Customer</Text>
          <TouchableOpacity
            style={styles.searchablePickerTrigger}
            onPress={() => {
              setCustomerSearchQuery("");
              setPickerFilteredCustomers(filteredCustomers);
              setShowCustomerPicker(true);
            }}
          >
            <Text 
              style={[
                styles.searchablePickerText,
                !selectedCustomerCode && styles.placeholderText
              ]}
              allowFontScaling={false}
            >
              {selectedCustomer ? selectedCustomer.name : "Select a customer..."}
            </Text>
            <Ionicons name="caret-down" size={12} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.helperText}>
            {filteredCustomers.length} total customers
          </Text>
        </View>

        {/* Location Verification Log Card */}
        {renderLocationLogCard()}

        {/* Transaction Management Sections */}
        {renderManagementSection('pending')}
        {renderManagementSection('uploaded')}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!selectedCustomerCode) && styles.disabledButton
          ]}
          onPress={handleProceed}
          disabled={!selectedCustomerCode}
        >
          <Text style={styles.primaryButtonText}>Proceed</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderActionStep = () => {
    const customer = getSelectedCustomerDetails();
    if (!customer) return null;

    // Check distance
    let distanceText = "Calculating...";
    let distance = Infinity;
    let canPunch = false;

    if (currentLocation && customer.latitude && customer.longitude) {
      distance = getDistanceFromLatLonInMeters(
        currentLocation.latitude,
        currentLocation.longitude,
        customer.latitude,
        customer.longitude
      );
      distanceText = distance >= 1000
        ? `${(distance / 1000).toFixed(1)}km away`
        : `${distance.toFixed(0)}m away`;
      const gpsAccuracy = currentLocation.accuracy || 0;
      canPunch = distance <= (100 + gpsAccuracy);
    }

    // Logic check
    const isActiveContext = punchStatus?.is_punched_in && punchStatus?.firm_name === customer.name;
    const isBlocked = punchStatus?.is_punched_in && !isActiveContext;

    return (
      <View style={styles.actionContainer}>
        {/* Customer Card */}
        <View style={styles.customerCard}>
          <View style={styles.customerHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customer.name.charAt(0)}</Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerNameBig}>{customer.name}</Text>
              <Text style={styles.customerCode}>{customer.code}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={16} color={Colors.text.secondary} />
              <Text style={styles.detailText}>{customer.place || "N/A"}</Text>
            </View>
          </View>

          {isActiveContext && (
            <View style={styles.statusBannerActive}>
              <Ionicons name="time" size={20} color={Colors.success.main} />
              <Text style={styles.statusTextActive}>
                You are punched in here. Work Hours: {workHours.toFixed(3)}
              </Text>
            </View>
          )}

          {isBlocked && (
            <View style={styles.statusBannerBlocked}>
              <Ionicons name="lock-closed" size={20} color={Colors.error.main} />
              <Text style={styles.statusTextBlocked}>
                You are already punched in at {punchStatus.firm_name}. Please punch out there first.
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.buttonStack}>
          {isActiveContext ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.takeOrderButton]}
                onPress={() => router.push({
                  pathname: "/Order/Entry",
                  params: { preselectedCustomerCode: customer.code }
                })}
              >
                <Ionicons name="cart-outline" size={24} color="#FFF" />
                <Text style={styles.actionButtonText}>Take Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
                onPress={() => router.push({
                  pathname: "/Sales/SalesEntry",
                  params: { preselectedCustomerCode: customer.code }
                })}
              >
                <Ionicons name="cash-outline" size={24} color="#FFF" />
                <Text style={styles.actionButtonText}>Take Sales</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FF7043' }]}
                onPress={() => router.push({
                  pathname: "/SalesReturn/ReturnEntry",
                  params: { preselectedCustomerCode: customer.code }
                })}
              >
                <Ionicons name="return-up-back-outline" size={24} color="#FFF" />
                <Text style={styles.actionButtonText}>Sales Return</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#7E57C2' }]}
                onPress={() => router.push({
                  pathname: "/Collection/Collection",
                  params: { preselectedCustomerCode: customer.code }
                })}
              >
                <Ionicons name="wallet-outline" size={24} color="#FFF" />
                <Text style={styles.actionButtonText}>Collection</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.punchOutButton]}
                onPress={handlePunchOut}
                disabled={punching}
              >
                {punching ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={24} color="#FFF" />
                    <Text style={styles.actionButtonText}>Punch Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.punchInButton,
                isBlocked && styles.disabledButton
              ]}
              onPress={startPunchInFlow}
              disabled={punching || isBlocked}
            >
              {punching ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={24} color="#FFF" />
                  <Text style={styles.actionButtonText}>Punch In</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleReset}
            disabled={punching}
          >
            <Text style={styles.secondaryButtonText}>Select Different Customer</Text>
          </TouchableOpacity> */}
        </View>
      </View>
    );
  };

  const renderLocationLogCard = () => {
    // Filter log by logged in user
    const userLocations = rawLocations.filter(l =>
      (l.status === 'verified' || l.status === 'pending') &&
      l.taskDoneBy === loggedInUser
    );

    const verifiedCount = userLocations.filter(l => l.status === 'verified').length;
    const pendingCount = userLocations.filter(l => l.status === 'pending').length;

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => setShowLocationLog(true)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={['#fff', '#f8f9fa']}
          style={styles.logCardGradient}
        >
          <View style={styles.logCardHeader}>
            <View style={styles.logIconContainer}>
              <Ionicons name="shield-checkmark" size={24} color={Colors.primary.main} />
            </View>
            <View style={styles.logCardContent}>
              <Text style={styles.logCardTitle}>Location Verification Log</Text>
              <Text style={styles.logCardSubtitle}>Check status of shop locations</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
          </View>

          <View style={styles.logStatsRow}>
            <View style={styles.logStatItem}>
              <Text style={styles.logStatValue}>{verifiedCount}</Text>
              <Text style={styles.logStatLabel}>Verified</Text>
              <View style={[styles.statusDot, { backgroundColor: Colors.success.main }]} />
            </View>
            <View style={styles.logStatDivider} />
            <View style={styles.logStatItem}>
              <Text style={styles.logStatValue}>{pendingCount}</Text>
              <Text style={styles.logStatLabel}>Pending</Text>
              <View style={[styles.statusDot, { backgroundColor: Colors.warning.main }]} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderCustomerPicker = () => (
    <>
      <Modal
      visible={showCustomerPicker}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCustomerPicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModalContent}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.pickerModalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => setShowCustomerPicker(false)}>
              <Ionicons name="close-circle" size={24} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.pickerSearchContainer}>
            <Ionicons name="search" size={20} color={Colors.text.tertiary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search customer..."
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
              autoFocus={true}
            />
          </View>

          <FlatList
            data={pickerFilteredCustomers}
            keyExtractor={item => item.code}
            style={styles.pickerList}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerListItem}
                onPress={() => {
                  setSelectedCustomerCode(item.code);
                  setShowCustomerPicker(false);
                }}
              >
                <View>
                  <Text style={styles.pickerListItemText}>{item.name}</Text>
                  <Text style={styles.pickerListItemSubText}>{item.place || "N/A"}</Text>
                </View>
                {selectedCustomerCode === item.code && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary.main} />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.pickerEmptyText}>No customers found</Text>
            }
          />
        </View>
      </View>
    </Modal>

    {/* Area Picker Modal (iOS Only) */}
    <Modal
      visible={showAreaPicker}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowAreaPicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.pickerModalContent, { height: 'auto', maxHeight: '60%' }]}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.pickerModalTitle}>Select Area</Text>
            <TouchableOpacity onPress={() => setShowAreaPicker(false)}>
              <Ionicons name="close-circle" size={24} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={areas}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.pickerListItem}
                onPress={() => {
                  setSelectedArea(item);
                  setShowAreaPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerListItemText,
                  selectedArea === item && { color: Colors.primary.main, fontWeight: '700' }
                ]}>
                  {item || "All"}
                </Text>
                {selectedArea === item && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary.main} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  </>
);

  const renderLocationLogModal = () => (
    <Modal
      visible={showLocationLog}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowLocationLog(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModalContent}>
          <View style={styles.pickerModalHeader}>
            <Text style={styles.pickerModalTitle}>Location Log</Text>
            <TouchableOpacity onPress={() => setShowLocationLog(false)}>
              <Ionicons name="close-circle" size={24} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={rawLocations.filter(l =>
              (l.status === 'verified' || l.status === 'pending') &&
              l.taskDoneBy === loggedInUser
            )}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            style={styles.pickerList}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={styles.logListItem}>
                <View style={styles.logListHeader}>
                  <Text style={styles.logListStoreName}>{item.storeName || item.firm_name}</Text>
                  <View style={[
                    styles.logStatusBadge,
                    { backgroundColor: item.status === 'verified' ? Colors.success[50] : Colors.warning[50] }
                  ]}>
                    <Text style={[
                      styles.logStatusText,
                      { color: item.status === 'verified' ? Colors.success.main : Colors.warning.main }
                    ]}>
                      {(item.status || 'unknown').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.logListRow}>
                  <Ionicons name="location-outline" size={14} color={Colors.text.tertiary} />
                  <Text style={styles.logListLocation}>{item.storeLocation || item.area || 'Unknown Location'}</Text>
                </View>

                <View style={styles.logListFooter}>
                  <Text style={styles.logListMeta}>
                    By: <Text style={{ fontWeight: '600' }}>{item.taskDoneBy || 'N/A'}</Text>
                  </Text>
                  <Text style={styles.logListMeta}>
                    {item.lastCapturedTime ? new Date(item.lastCapturedTime).toLocaleDateString() : '-'}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.pickerEmptyText}>No verification logs found</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );

  const renderConfirmModal = () => (
    <Modal
      visible={showConfirmModal}
      animationType="slide"
      transparent={true}
      onRequestClose={closeConfirmModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.confirmModalContent}>
          <Text style={styles.modalTitle}>Confirm Punch In</Text>
          <Text style={styles.modalSubtitle}>Shop: {getSelectedCustomerDetails()?.name}</Text>

          {selfieUri && (
            <Image 
              source={selfieUri} 
              style={styles.selfieImage} 
              contentFit="cover"
            />
          )}

          <TextInput
            style={styles.notesInput}
            placeholder="Add notes (optional)"
            placeholderTextColor={Colors.text.tertiary}
            value={notes}
            onChangeText={setNotes}
            multiline={true}
            numberOfLines={3}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonCancel]}
              onPress={takeSelfie}
              disabled={punching}
            >
              <Text style={styles.modalButtonTextCancel}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSave]}
              onPress={confirmPunchIn}
              disabled={punching}
            >
              {punching ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalButtonText}>Confirm Punch In</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={closeConfirmModal} disabled={punching}>
            <Ionicons name="close-circle" size={32} color={Colors.neutral[400]} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderInlineCameraModal = () => (
    <Modal
      visible={showInlineCamera}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setShowInlineCamera(false)}
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="front"
        >
          <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end', paddingBottom: 40, alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ position: 'absolute', top: 50, left: 20, padding: 10 }}
              onPress={() => setShowInlineCamera(false)}
            >
              <Ionicons name="close-circle" size={36} color="#FFF" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 255, 255, 0.3)', justifyContent: 'center', alignItems: 'center' }}
              onPress={handleCaptureSelfie}
            >
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' }} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    </Modal>
  );

  const renderSubCategoryGrid = (section) => {
    const categories = ['Order', 'Sales', 'Return', 'Collection'];
    const icons = {
      Order: 'cart-outline',
      Sales: 'receipt-outline',
      Return: 'refresh-circle-outline',
      Collection: 'wallet-outline'
    };

    return (
      <View style={styles.subCategoryGrid}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={styles.subCategoryButton}
            onPress={() => handleSubCategoryPress(cat)}
          >
            <View style={styles.subCategoryIconBox}>
              <Ionicons 
                name={icons[cat] || 'document-outline'} 
                size={24} 
                color={Colors.primary.main} 
              />
            </View>
            <Text style={styles.subCategoryLabel}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderManagementSection = (section) => {
    const isExpanded = expandedSection === section;
    const title = section === 'pending' ? 'Pending Transactions' : 'Uploaded Transactions';
    const subtitle = section === 'pending' ? 'Items waiting to be synced' : 'Last 2 days history';
    const icon = section === 'pending' ? 'cloud-upload-outline' : 'cloud-done-outline';
    const iconColor = section === 'pending' ? Colors.warning.main : Colors.success.main;

    return (
      <View style={styles.managementSectionWrapper}>
        <TouchableOpacity 
          style={styles.managementHeaderCard}
          onPress={() => handleManagementSectionPress(section)}
          activeOpacity={0.7}
        >
          <View style={styles.managementHeaderLeft}>
            <View style={[styles.managementIconCircle, { backgroundColor: iconColor + '15' }]}>
              <Ionicons name={icon} size={24} color={iconColor} />
            </View>
            <View>
              <Text style={styles.managementTitle}>{title}</Text>
              <Text style={styles.managementSubtitle}>{subtitle}</Text>
            </View>
          </View>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={Colors.text.tertiary} 
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.managementExpandedContent}>
            {renderSubCategoryGrid(section)}
          </View>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={Gradients.background} style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push("/Home")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.title}>PUNCH-IN MANAGEMENT</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary.main} />
              <Text style={styles.loadingText}>Loading Shop Locations...</Text>
            </View>
          ) : (
            step === 1 ? renderSelectionStep() : renderActionStep()
          )}
        </ScrollView>

        {/* Modals */}
        {renderCustomerPicker()}
        {renderInlineCameraModal()}
        {renderConfirmModal()}
        {renderLocationLogModal()}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  backButton: {
    padding: Spacing.xs,
  },
  content: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.text.secondary,
    fontSize: Typography.sizes.base,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: scale(Spacing.xl),
    ...Shadows.md,
  },
  stepTitle: {
    fontSize: scale(Typography.sizes.lg),
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: scale(Spacing.xl),
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: Spacing.xs,
  },
  pickerWrapper: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    overflow: 'hidden',
  },
  picker: {
    color: Colors.text.primary,
    height: Platform.OS === 'ios' ? 150 : 50,
  },
  pickerItem: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
  },
  // Searchable Picker Styles
  searchablePickerTrigger: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.light,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  searchablePickerText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  placeholderText: {
    color: Colors.text.tertiary,
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    width: '100%',
    maxWidth: 400,
    height: '80%',
    ...Shadows.xl,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs
  },
  pickerModalTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  pickerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border.light,
    marginBottom: Spacing.md,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    height: '100%'
  },
  pickerList: {
    flex: 1,
  },
  pickerListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  pickerListItemText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  pickerListItemSubText: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  pickerEmptyText: {
    textAlign: 'center',
    marginTop: Spacing.lg,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
  helperText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary.main,
    paddingVertical: scale(Spacing.md),
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    ...Shadows.sm,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: scale(Typography.sizes.base),
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: Colors.neutral[300],
    elevation: 0,
    shadowOpacity: 0,
  },
  actionContainer: {
    gap: Spacing.xl,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: scale(Spacing.xl),
    ...Shadows.lg,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(Spacing.md),
    marginBottom: scale(Spacing.lg),
  },
  avatar: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: scale(Typography.sizes['2xl']),
    fontWeight: '700',
    color: Colors.primary.main,
  },
  customerInfo: {
    flex: 1,
  },
  customerNameBig: {
    fontSize: scale(Typography.sizes.xl),
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  customerCode: {
    fontSize: scale(Typography.sizes.sm),
    color: Colors.text.secondary,
    backgroundColor: Colors.neutral[100],
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.light,
    marginVertical: Spacing.md,
  },
  detailsGrid: {
    gap: Spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailText: {
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
  },
  badgeSuccess: {
    backgroundColor: Colors.success[50],
  },
  badgeError: {
    backgroundColor: Colors.error[50],
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBannerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // Increased gap
    backgroundColor: Colors.primary[50],
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl, // Increased margin
    borderWidth: 1, // Added border to make it look interactive
    borderColor: Colors.primary[100],
  },
  statusTextSmall: {
    color: Colors.primary.main,
    fontSize: Typography.sizes.md, // Increased font size
    fontWeight: '700', // Bold
  },
  statusSubtextSmall: {
    color: Colors.primary[700],
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  statusBannerActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    padding: Spacing.sm,
    backgroundColor: Colors.success[50],
    borderRadius: BorderRadius.md,
  },
  statusTextActive: {
    color: Colors.success.main,
    fontWeight: '600',
    fontSize: Typography.sizes.sm,
  },
  statusBannerBlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    padding: Spacing.sm,
    backgroundColor: Colors.error[50],
    borderRadius: BorderRadius.md,
  },
  statusTextBlocked: {
    color: Colors.error.main,
    fontWeight: '600',
    fontSize: Typography.sizes.sm,
    flex: 1
  },
  buttonStack: {
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    paddingVertical: scale(Spacing.lg),
    borderRadius: BorderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: scale(Spacing.md),
    ...Shadows.md,
  },
  punchInButton: {
    backgroundColor: Colors.primary.main,
  },
  punchOutButton: {
    backgroundColor: Colors.warning.main,
  },
  takeOrderButton: {
    backgroundColor: Colors.secondary.main, // Or any distinct color
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: scale(Typography.sizes.lg),
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.medium,
  },
  secondaryButtonText: {
    color: Colors.text.primary,
    fontSize: Typography.sizes.base,
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  confirmModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: scale(Spacing.xl),
    width: '100%',
    maxWidth: 400,
    ...Shadows.xl,
  },
  modalTitle: {
    fontSize: scale(Typography.sizes.xl),
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
    textAlign: 'center'
  },
  modalSubtitle: {
    fontSize: scale(Typography.sizes.sm),
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: scale(Spacing.lg),
  },
  selfieImage: {
    width: '100%',
    height: scale(180),
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  notesInput: {
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
    color: Colors.text.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  modalButtonCancel: {
    backgroundColor: Colors.neutral[100],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  modalButtonSave: {
    backgroundColor: Colors.primary.main,
  },
  modalButtonConfirm: {
    backgroundColor: Colors.primary.main,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: Typography.sizes.base,
  },
  modalButtonTextCancel: {
    color: Colors.text.primary,
    fontWeight: '600',
    fontSize: Typography.sizes.base,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },

  // Log Card Styles
  logCard: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    ...Shadows.sm,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border.light,
    overflow: 'hidden'
  },
  logCardGradient: {
    padding: Spacing.md,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  logCardContent: {
    flex: 1,
  },
  logCardTitle: {
    fontSize: scale(Typography.sizes.md),
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  logCardSubtitle: {
    fontSize: scale(Typography.sizes.xs),
    color: Colors.text.secondary,
  },
  logStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  logStatItem: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'column',
    position: 'relative',
  },
  logStatValue: {
    fontSize: scale(Typography.sizes.lg),
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  logStatLabel: {
    fontSize: scale(Typography.sizes.xs),
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logStatDivider: {
    width: 1,
    height: '60%',
    backgroundColor: Colors.border.light,
  },

  // Log List Item Styles
  logListItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
    backgroundColor: '#fff',
  },
  logListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logListStoreName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  logStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  logStatusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  logListLocation: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  logListFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
  },
  logListMeta: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
  },
  // Management Styles
  managementSectionWrapper: {
    marginBottom: Spacing.md,
  },
  managementHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  managementHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  managementIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  managementTitle: {
    fontSize: scale(Typography.sizes.base),
    fontWeight: '700',
    color: Colors.text.primary,
  },
  managementSubtitle: {
    fontSize: scale(Typography.sizes.xs),
    color: Colors.text.secondary,
    marginTop: 2,
  },
  managementExpandedContent: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: -8,
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    ...Shadows.sm,
  },
  subCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  subCategoryButton: {
    width: '47%',
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  subCategoryButtonSelected: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
  },
  subCategoryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Shadows.sm,
  },
  subCategoryIconBoxSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  subCategoryLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  subCategoryLabelSelected: {
    color: '#FFF',
  },
  managementListContainer: {
    marginTop: Spacing.md,
  },
  managementListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: 4,
  },
  managementListTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  managementListCount: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  managementCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
    overflow: 'hidden',
  },
  managementCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  managementCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  managementCustomerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  managementMetaText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  managementCardRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  managementAmount: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: Colors.primary.main,
  },
  managementCardDetails: {
    padding: Spacing.md,
    backgroundColor: Colors.neutral[50],
  },
  managementDivider: {
    height: 1,
    backgroundColor: Colors.border.light,
    marginBottom: Spacing.sm,
  },
  managementItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  managementItemName: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    flex: 1,
    marginRight: 8,
  },
  managementItemQty: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  managementActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  managementActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  managementActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  managementEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  managementEmptyText: {
    marginTop: 12,
    color: Colors.text.tertiary,
    fontSize: Typography.sizes.sm,
  },
  // Printer Modal
  printerModal: {
    backgroundColor: '#FFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxHeight: '80%',
    ...Shadows.xl,
  },
  printerToggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[100],
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  printerToggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  printerToggleButtonActive: {
    backgroundColor: '#FFF',
    ...Shadows.sm,
  },
  printerToggleText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  printerToggleTextActive: {
    color: Colors.primary.main,
  },
  printerList: {
    maxHeight: 300,
  },
  printerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  printerName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  printerAddress: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
  },
  emptyPrinterText: {
    textAlign: 'center',
    color: Colors.text.tertiary,
    marginVertical: Spacing.xl,
  },
  rescanButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  rescanButtonText: {
    color: Colors.primary.main,
    fontWeight: '700',
    fontSize: Typography.sizes.base,
  },
  pendingDot: { backgroundColor: Colors.warning.main },
  syncedDot: { backgroundColor: Colors.success.main },
});
