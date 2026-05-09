
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from "expo-linear-gradient";
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions, // Added TextInput
    FlatList,
    Platform,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../constants/theme";
import dbService from "../src/services/database";

const { width, height } = Dimensions.get('window');
const API_DEBTORS = "https://tasksas.com/api/debtors/get-debtors/";

export default function LocationCaptureScreen() {
    const router = useRouter();

    // Data State
    const [allCustomers, setAllCustomers] = useState([]);
    const [areas, setAreas] = useState([]);

    // Selection State
    const [selectedArea, setSelectedArea] = useState("All");
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [selectedCustomerCode, setSelectedCustomerCode] = useState("");

    // UI State
    const [loading, setLoading] = useState(true);
    const [capturing, setCapturing] = useState(false);
    const [capturedCustomers, setCapturedCustomers] = useState(new Set());
    const [step, setStep] = useState(1); // 1: Selection, 2: Action

    // Searchable Picker State
    const [showCustomerPicker, setShowCustomerPicker] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState("");
    const [pickerFilteredCustomers, setPickerFilteredCustomers] = useState([]);

    // Map State
    const [showMap, setShowMap] = useState(false);
    const [currentRegion, setCurrentRegion] = useState(null);
    const [markerCoordinate, setMarkerCoordinate] = useState(null);
    const [capturedAddress, setCapturedAddress] = useState(null); // Added state for address
    const [showAreaPicker, setShowAreaPicker] = useState(false); // iOS Area Picker

    useEffect(() => {
        loadData();
    }, []);

    // Filter customers when Area changes
    useEffect(() => {
        let filtered = allCustomers;
        if (selectedArea !== "All") {
            filtered = allCustomers.filter(c => c.area === selectedArea);
        }
        // Sort alphabetically
        filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setFilteredCustomers(filtered);

        // Reset selected customer if not in new list
        if (selectedCustomerCode) {
            const exists = filtered.find(c => c.code === selectedCustomerCode);
            if (!exists) setSelectedCustomerCode("");
        }
    }, [selectedArea, allCustomers]);

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

    const loadData = async () => {
        try {
            setLoading(true);

            // 1. Get Token
            const token = await AsyncStorage.getItem("authToken");
            if (!token) {
                Alert.alert("Error", "User not authenticated. Please login.");
                setLoading(false);
                return;
            }

            // 2. Fetch Customers from API
            console.log(`[LocationCapture] Fetching debtors from: ${API_DEBTORS}`);
            const response = await fetch(API_DEBTORS, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('[LocationCapture] GET Status:', response.status);
            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${responseText.substring(0, 100)}`);
            }

            let json;
            try {
                json = JSON.parse(responseText);
            } catch (e) {
                throw new Error('Invalid JSON response from server');
            }

            let customersData = [];
            if (Array.isArray(json)) {
                customersData = json;
            } else if (json.data && Array.isArray(json.data)) {
                customersData = json.data;
            } else if (json.debtors && Array.isArray(json.debtors)) {
                customersData = json.debtors;
            }

            // 2b. Fetch Verified Locations to Exclude
            console.log(`[LocationCapture] Fetching verified locations...`);
            let verifiedCodes = new Set();
            try {
                const verifiedResponse = await fetch('https://tasksas.com/api/shop-location/table/', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (verifiedResponse.ok) {
                    const verifiedResult = await verifiedResponse.json();
                    let verifiedList = [];
                    if (Array.isArray(verifiedResult)) {
                        verifiedList = verifiedResult;
                    } else if (verifiedResult.data && Array.isArray(verifiedResult.data)) {
                        verifiedList = verifiedResult.data;
                    } else if (verifiedResult.firms && Array.isArray(verifiedResult.firms)) {
                        verifiedList = verifiedResult.firms;
                    }

                    // Filter only status === 'verified' and extract codes
                    verifiedList.forEach(item => {
                        if (item.status === 'verified') {
                            // Support both field names just in case
                            const code = item.firm_code || item.code || item.id?.toString();
                            if (code) verifiedCodes.add(code);
                        }
                    });
                    console.log(`[LocationCapture] Found ${verifiedCodes.size} verified locations to exclude`);
                }
            } catch (vError) {
                console.warn("[LocationCapture] Failed to fetch verified locations:", vError);
                // We continue even if this fails, just won't filter
            }

            // Filter customers to exclude verified ones
            const filteredCustomersData = customersData.filter(c => !verifiedCodes.has(c.code));
            console.log(`[LocationCapture] Showing ${filteredCustomersData.length} customers (Excluded ${customersData.length - filteredCustomersData.length})`);

            // Extract Areas from filtered data
            const areaSet = new Set(filteredCustomersData.map(c => c.area).filter(a => a && a.trim() !== ""));
            const areaList = ["All", ...Array.from(areaSet).sort()];
            setAreas(areaList);

            // 3. Get Local Locations (to show captured status)
            await dbService.init();
            const locations = await dbService.getCustomerLocations();
            const capturedSet = new Set(locations.map(l => l.customer_code));
            setCapturedCustomers(capturedSet);

            setAllCustomers(filteredCustomersData);
            setFilteredCustomers(filteredCustomersData);

        } catch (error) {
            console.error("Error loading data:", error);
            Alert.alert("Error", `Failed to load customers: ${error.message}`);
        } finally {
            setLoading(false);
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
        // Optional: Keep selection or clear it? keeping it is usually friendlier.
    };

    const getSelectedCustomerDetails = () => {
        return allCustomers.find(c => c.code === selectedCustomerCode);
    };

    const openMapForCustomer = async () => {
        const customer = getSelectedCustomerDetails();
        if (!customer) return;

        try {
            setCapturing(true);

            // Check location permissions
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission denied', 'Permission to access location was denied');
                setCapturing(false);
                return;
            }

            // Get current location with timeout
            const location = await Promise.race([
                Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Location timeout')), 10000)
                )
            ]);

            if (!location || !location.coords) {
                throw new Error('Invalid location data');
            }

            const { latitude, longitude } = location.coords;

            // Validate coordinates
            if (isNaN(latitude) || isNaN(longitude)) {
                throw new Error('Invalid coordinates');
            }

            // Reverse Geocoding
            try {
                setCapturedAddress("Fetching address...");
                const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (reverseGeocode && reverseGeocode.length > 0) {
                    const address = reverseGeocode[0];
                    // Construct a readable address string
                    const parts = [
                        address.street,
                        address.district,
                        address.city,
                        address.subregion,
                        address.region
                    ].filter(p => p); // Filter out null/undefined
                    setCapturedAddress(parts.join(', '));
                } else {
                    setCapturedAddress("Address not found");
                }
            } catch (geocodeError) {
                console.warn("Reverse geocoding failed:", geocodeError);
                setCapturedAddress("Could not fetch address");
            }

            const initialRegion = {
                latitude,
                longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            };

            setCurrentRegion(initialRegion);
            setMarkerCoordinate({ latitude, longitude });

            // Small delay before showing map to ensure state is set
            setTimeout(() => {
                setShowMap(true);
            }, 100);

        } catch (error) {
            console.error("Error opening map:", error);
            Alert.alert(
                "Location Error",
                error.message === 'Location timeout'
                    ? "Location request timed out. Please try again."
                    : "Failed to retrieve current location. Please check your GPS settings."
            );
        } finally {
            setCapturing(false);
        }
    };

    const handleSaveLocation = async () => {
        const selectedCustomer = getSelectedCustomerDetails();
        if (!selectedCustomer || !markerCoordinate) {
            Alert.alert("Error", "Missing customer or location data");
            return;
        }

        try {
            setCapturing(true);

            const { latitude, longitude } = markerCoordinate;

            // Validate coordinates
            if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
                throw new Error("Invalid coordinates");
            }

            console.log('[LocationCapture] Saving location for:', selectedCustomer.name, { latitude, longitude });

            // 1. Save to local DB
            let localSaveSuccess = false;
            try {
                await dbService.init();
                await dbService.saveCustomerLocation(selectedCustomer.code, latitude, longitude);
                localSaveSuccess = true;
                console.log('[LocationCapture] Local save successful');
            } catch (dbError) {
                console.error('[LocationCapture] Database save failed:', dbError);
                Alert.alert(
                    "Database Error",
                    "Failed to save location locally. The location will still be sent to the server."
                );
            }

            // 2. POST to API
            let apiSaveSuccess = false;
            try {
                const token = await AsyncStorage.getItem("authToken");
                if (!token) {
                    throw new Error("No authentication token");
                }

                const apiPayload = {
                    firm_name: selectedCustomer.name,
                    latitude: latitude,
                    longitude: longitude
                };

                console.log('[LocationCapture] Posting to API:', apiPayload);

                const response = await fetch('https://tasksas.com/api/shop-location/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(apiPayload)
                });

                console.log('[LocationCapture] POST Status:', response.status);
                const responseText = await response.text();

                if (!response.ok) {
                    console.warn('[LocationCapture] POST Error:', response.status, responseText);
                    throw new Error(`API returned ${response.status}: ${responseText.substring(0, 100)}`);
                } else {
                    apiSaveSuccess = true;
                }
            } catch (apiError) {
                console.error('[LocationCapture] API request failed:', apiError);

                let errorMessage = apiError.message;
                if (errorMessage === 'Network request failed') {
                    errorMessage = "Network request failed. Check internet connection.";
                }

                if (!localSaveSuccess) {
                    Alert.alert(
                        "Save Failed",
                        `Failed to save location. Error: ${errorMessage}`
                    );
                    setCapturing(false);
                    return;
                }
            }

            // 3. Update local state to reflect captured status
            setCapturedCustomers(prev => new Set(prev).add(selectedCustomer.code));

            // Show success message
            const successMessage = apiSaveSuccess
                ? `Location saved successfully for ${selectedCustomer.name}`
                : `Location saved locally. Will sync when online.`;

            Alert.alert("Success", successMessage);

            // Close Modal
            setShowMap(false);
            setCurrentRegion(null);
            setMarkerCoordinate(null);
            setCapturedAddress(null);

        } catch (error) {
            console.error("[LocationCapture] Error saving location:", error);
            Alert.alert("Error", `Failed to save location: ${error.message}`);
        } finally {
            setCapturing(false);
        }
    };

    const renderSelectionStep = () => {
        const selectedCustomer = getSelectedCustomerDetails();

        return (
            <View style={styles.formContainer}>
                <Text style={styles.stepTitle}>Select Customer</Text>

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
                                        label={area}
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
                        {filteredCustomers.length} customers in selected area
                    </Text>
                </View>

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

        const isCaptured = capturedCustomers.has(customer.code);

        return (
            <View style={styles.actionContainer}>
                {/* Customer Card with iOS shadow fix */}
                <View style={styles.customerCardWrapper}>
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
                            <View style={styles.detailItem}>
                                <Ionicons name="call-outline" size={16} color={Colors.text.secondary} />
                                <Text style={styles.detailText}>{customer.phone || "N/A"}</Text>
                            </View>
                            <View style={styles.detailItem}>
                                <Ionicons name="map-outline" size={16} color={Colors.text.secondary} />
                                <Text style={styles.detailText}>{customer.area || "N/A"}</Text>
                            </View>
                        </View>

                        {isCaptured && (
                            <View style={styles.statusBadge}>
                                <Ionicons name="checkmark-circle" size={16} color={Colors.success.main} />
                                <Text style={styles.statusText}>Location Captured</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.buttonStack}>
                    <TouchableOpacity
                        style={[styles.captureActionButton, isCaptured && styles.updateActionButton]}
                        onPress={openMapForCustomer}
                        disabled={capturing}
                    >
                        {capturing ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Ionicons name="location" size={24} color="#FFF" />
                                <Text style={styles.captureActionText}>
                                    {isCaptured ? "Update Location" : "Capture Location"}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={handleReset}
                        disabled={capturing}
                    >
                        <Text style={styles.secondaryButtonText}>Select Different Customer</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <LinearGradient colors={Gradients.background} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.push("/Home")} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={Colors.primary.main} />
                    </TouchableOpacity>
                    <Text style={styles.title}>Location Capture</Text>
                    <View style={{ width: 24 }} />
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    {loading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Colors.primary.main} />
                            <Text style={styles.loadingText}>Loading Data...</Text>
                        </View>
                    ) : (
                        step === 1 ? renderSelectionStep() : renderActionStep()
                    )}
                </ScrollView>

                {/* Searchable Picker Modal */}
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
                                            {item}
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

                {/* Map Modal */}
                <Modal
                    visible={showMap}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => {
                        setShowMap(false);
                        setCurrentRegion(null);
                        setMarkerCoordinate(null);
                    }}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.confirmModalContent}>
                            <View style={styles.modalHeader}>
                                <Ionicons name="location" size={48} color={Colors.primary.main} />
                                <Text style={styles.modalTitle}>Confirm Location</Text>
                                <Text style={styles.modalSubtitle}>{getSelectedCustomerDetails()?.name}</Text>
                            </View>

                            {markerCoordinate ? (
                                <View style={styles.coordinatesContainer}>
                                    <View style={styles.coordRow}>
                                        <Text style={styles.coordLabel}>Latitude:</Text>
                                        <Text style={styles.coordValue}>{markerCoordinate.latitude.toFixed(6)}</Text>
                                    </View>
                                    <View style={styles.coordRow}>
                                        <Text style={styles.coordLabel}>Longitude:</Text>
                                        <Text style={styles.coordValue}>{markerCoordinate.longitude.toFixed(6)}</Text>
                                    </View>
                                    {capturedAddress && (
                                        <View style={styles.addressContainer}>
                                            <Ionicons name="map" size={16} color={Colors.primary.main} style={{ marginTop: 2 }} />
                                            <Text style={styles.addressText}>{capturedAddress}</Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <ActivityIndicator size="large" color={Colors.primary.main} />
                            )}

                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCancel]}
                                    onPress={() => {
                                        setShowMap(false);
                                        setCurrentRegion(null);
                                        setMarkerCoordinate(null);
                                    }}
                                    disabled={capturing}
                                >
                                    <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSave]}
                                    onPress={handleSaveLocation}
                                    disabled={capturing || !markerCoordinate}
                                >
                                    {capturing ? (
                                        <ActivityIndicator size="small" color="#FFF" />
                                    ) : (
                                        <>
                                            <Ionicons name="save-outline" size={20} color="#FFF" />
                                            <Text style={styles.modalButtonText}>Save</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
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
        padding: Spacing.xl,
        ...Shadows.md,
    },
    stepTitle: {
        fontSize: Typography.sizes.lg,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: Spacing.xl,
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
        height: '80%', // Taller for list
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
    addressContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: Spacing.md,
        padding: Spacing.sm,
        backgroundColor: Colors.primary[50], // Light purple bg
        borderRadius: BorderRadius.md,
        width: '100%',
    },
    addressText: {
        flex: 1,
        fontSize: Typography.sizes.sm,
        color: Colors.primary[900], // Darker purple text
        lineHeight: 20,
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
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
        ...Shadows.sm,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.base,
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
    customerCardWrapper: {
        marginBottom: Spacing.xl,
        backgroundColor: 'transparent',
        ...Shadows.lg,
    },
    customerCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        overflow: 'hidden',
    },
    customerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.primary[100],
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: Typography.sizes['2xl'],
        fontWeight: '700',
        color: Colors.primary.main,
    },
    customerInfo: {
        flex: 1,
    },
    customerNameBig: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.text.primary,
        marginBottom: 4,
    },
    customerCode: {
        fontSize: Typography.sizes.sm,
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
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: Spacing.lg,
        padding: Spacing.sm,
        backgroundColor: Colors.success[50],
        borderRadius: BorderRadius.md,
        alignSelf: 'flex-start',
    },
    statusText: {
        color: Colors.success.main,
        fontWeight: '600',
        fontSize: Typography.sizes.sm,
    },
    buttonStack: {
        gap: Spacing.md,
    },
    captureActionButton: {
        flexDirection: 'row',
        backgroundColor: Colors.warning.main,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.xl,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.md,
        ...Shadows.md,
    },
    updateActionButton: {
        backgroundColor: Colors.success.main,
    },
    captureActionText: {
        color: '#FFFFFF',
        fontSize: Typography.sizes.lg,
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
        padding: Spacing.xl,
        width: '100%',
        maxWidth: 400,
        ...Shadows.xl,
    },
    modalHeader: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    modalTitle: {
        fontSize: Typography.sizes.xl,
        fontWeight: '700',
        color: Colors.text.primary,
        marginTop: Spacing.md,
    },
    modalSubtitle: {
        fontSize: Typography.sizes.sm,
        color: Colors.text.secondary,
        marginTop: 4,
        textAlign: 'center',
    },
    coordinatesContainer: {
        backgroundColor: Colors.neutral[50],
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
    },
    coordRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border.light,
    },
    coordLabel: {
        fontSize: Typography.sizes.base,
        fontWeight: '600',
        color: Colors.text.secondary,
    },
    coordValue: {
        fontSize: Typography.sizes.base,
        fontWeight: '700',
        color: Colors.primary.main,
        fontFamily: 'monospace',
    },
    modalActions: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    modalButton: {
        flex: 1,
        flexDirection: 'row',
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
    modalButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: Typography.sizes.base,
    },
    modalButtonTextCancel: {
        color: Colors.text.primary,
        fontWeight: '600',
        fontSize: Typography.sizes.base,
    }
});
