// src/screens/LoginScreen.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import LicenseActivationScreen from "./LicenseActivationScreen";

const { width, height } = Dimensions.get("window");

export default function LoginScreen() {
  const router = useRouter();

  const [clientId, setClientId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [demoExpiresAt, setDemoExpiresAt] = useState("");
  const [demoDaysRemaining, setDemoDaysRemaining] = useState(0);
  const [licenseKey, setLicenseKey] = useState("");
  const [companyName, setCompanyName] = useState("");
  
  // Multi-license state
  const [availableLicenses, setAvailableLicenses] = useState([]);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [showLicensePicker, setShowLicensePicker] = useState(false);
  
  // Add License Modal
  const [showAddLicenseModal, setShowAddLicenseModal] = useState(false);


  // Glow animation
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2500 }), -1, true);
  }, []);

  const animatedGlow = useAnimatedStyle(() => ({
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glow.value * 0.5,
    shadowRadius: glow.value * 15,
    elevation: glow.value * 10,
  }));

  // Load clientId, Demo Status, and Available Licenses
  useEffect(() => {
    loadLicenses();
  }, []);

  // Reload licenses when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadLicenses();
    }, [])
  );

  const loadLicenses = async () => {
    try {
      // Load available licenses
      const licensesStr = await AsyncStorage.getItem("activatedLicenses");
      if (licensesStr) {
        const licenses = JSON.parse(licensesStr);
        setAvailableLicenses(licenses);
        
        // Auto-select if only one license or load last used
        const lastClientId = await AsyncStorage.getItem("clientId");
        if (lastClientId) {
          const lastLicense = licenses.find(l => l.client_id === lastClientId);
          if (lastLicense) {
            setSelectedLicense(lastLicense);
            setClientId(lastLicense.client_id);
            setLicenseKey(lastLicense.license_key);
            setCompanyName(lastLicense.shop_name);
          }
        } else if (licenses.length === 1) {
          setSelectedLicense(licenses[0]);
          setClientId(licenses[0].client_id);
          setLicenseKey(licenses[0].license_key);
          setCompanyName(licenses[0].shop_name);
        }
      }

      const stored = await AsyncStorage.getItem("clientId");
      if (stored && !selectedLicense) setClientId(stored.trim().toUpperCase());

      const storedKey = await AsyncStorage.getItem("licenseKey");
      if (storedKey && !licenseKey) setLicenseKey(storedKey);

      const storedCompany = await AsyncStorage.getItem("customerName");
      if (storedCompany && !companyName) setCompanyName(storedCompany);

      const demoStatus = await AsyncStorage.getItem("isDemo");

      if (demoStatus === "true") {
        const expiry = await AsyncStorage.getItem("demoExpiresAt");
        setIsDemo(true);
        setDemoExpiresAt(expiry);
        if (expiry) {
          const now = new Date();
          const expDate = new Date(expiry);
          const diffTime = expDate - now;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDemoDaysRemaining(diffDays > 0 ? diffDays : 0);
        }
      }
    } catch (e) {
      console.error('Error loading licenses:', e);
    }
  };

  // AUTO-LOGIN: Check for existing session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = await AsyncStorage.getItem("authToken");
        const loginTimestamp = await AsyncStorage.getItem("loginTimestamp");

        if (token) {
          // Check if session is expired (20 hours = 72000000 ms)
          const now = Date.now();
          const twentyHours = 20 * 60 * 60 * 1000;

          if (!loginTimestamp || (now - parseInt(loginTimestamp, 10) > twentyHours)) {
            console.log('[LoginScreen] Session expired or invalid timestamp');
            await AsyncStorage.multiRemove(["authToken", "user", "loginTimestamp"]);
            return; // Stay on login screen
          }

          console.log('[LoginScreen] Found valid session, redirecting to Home');
          router.replace("/(tabs)/Home");
        }
      } catch (e) {
        console.error('[LoginScreen] Session check failed:', e);
      }
    };
    checkSession();
  }, []);

  // Handle license activation success
  const handleLicenseActivationSuccess = () => {
    setShowAddLicenseModal(false);
    loadLicenses(); // Reload licenses
  };

  // Handle license selection
  const handleLicenseSelect = async (license) => {
    setSelectedLicense(license);
    setClientId(license.client_id);
    setLicenseKey(license.license_key);
    setCompanyName(license.shop_name);
    setShowLicensePicker(false);
    
    // Update current license in storage
    await AsyncStorage.setItem("clientId", license.client_id);
    await AsyncStorage.setItem("licenseKey", license.license_key);
    await AsyncStorage.setItem("customerName", license.shop_name);
    
    if (license.isDemo) {
      setIsDemo(true);
      setDemoExpiresAt(license.expires_at || "");
      await AsyncStorage.setItem("isDemo", "true");
      await AsyncStorage.setItem("demoExpiresAt", license.expires_at || "");
    } else {
      setIsDemo(false);
      await AsyncStorage.removeItem("isDemo");
      await AsyncStorage.removeItem("demoExpiresAt");
    }
  };

  // LICENSE VALIDATION
  const validateLicense = async () => {
    try {
      const stored = await AsyncStorage.getItem("clientId");
      const usedClientId = (stored || clientId || "").toString().trim().toUpperCase();

      if (!usedClientId) {
        return { ok: false, reason: "missing_client" };
      }

      const url = "https://activate.imcbs.com/mobileapp/api/project/tasksas/";
      const fetchUrl = `${url}?t=${Date.now()}`;

      let res;
      try {
        res = await fetch(fetchUrl, {
          method: "GET",
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        });
      } catch (networkErr) {
        return { ok: false, reason: "network" };
      }

      if (!res.ok) return { ok: false, reason: "network" };

      let data;
      try {
        data = await res.json();
      } catch {
        return { ok: false, reason: "invalid_response" };
      }

      if (!Array.isArray(data.customers) && !Array.isArray(data.demo_licenses))
        return { ok: false, reason: "invalid_response" };

      let matched = null;
      let isDemo = false;

      // 1. Check Normal Customers
      if (data.customers) {
        matched = data.customers.find(
          (c) => (c?.client_id ?? "").toString().trim().toUpperCase() === usedClientId
        );
      }

      // 2. Check Demo Licenses if not found
      if (!matched && data.demo_licenses) {
        const demoMatch = data.demo_licenses.find(
          (d) => (d?.client_id ?? "").toString().trim().toUpperCase() === usedClientId
        );

        if (demoMatch) {
          matched = {
            client_id: demoMatch.client_id,
            license_key: demoMatch.demo_license,
            status: demoMatch.status,
            package: "DEMO",
            expires_at: demoMatch.expires_at // Keep for validaton
          };
          isDemo = true;
        }
      }

      if (!matched) return { ok: false, reason: "not_found" };

      // Expired demo check
      if (isDemo && matched.expires_at) {
        const expires = new Date(matched.expires_at);
        const now = new Date();
        if (expires < now) {
          return { ok: false, reason: "inactive" }; // Treat expired demo as inactive
        }
      }

      const status = (matched.status ?? "").toString().trim().toUpperCase();
      if (status !== "ACTIVE") return { ok: false, reason: "inactive" };

      try {
        await AsyncStorage.setItem(
          "licenseInfo",
          JSON.stringify({
            client_id: matched.client_id,
            license_key: matched.license_key ?? "",
            status: matched.status ?? "Active",
            package: matched.package ?? "",
          })
        );

        // Update individual keys for the display UI
        if (matched.license_key) {
          await AsyncStorage.setItem("licenseKey", matched.license_key);
          setLicenseKey(matched.license_key);
        }

        // Ensure customer_name is used for Company display
        const nameToSave = matched.customer_name;
        if (nameToSave) {
          await AsyncStorage.setItem("customerName", nameToSave);
          setCompanyName(nameToSave);
        }

        if (isDemo) {
          await AsyncStorage.setItem("isDemo", "true");
          await AsyncStorage.setItem("demoExpiresAt", matched.expires_at || "");
        } else {
          const existingDemo = await AsyncStorage.getItem("isDemo");
          if (existingDemo !== "true") {
            await AsyncStorage.removeItem("isDemo");
            await AsyncStorage.removeItem("demoExpiresAt");
          }
        }

        // Save Modules
        if (matched.modules) {
          await AsyncStorage.setItem("activatedModules", JSON.stringify(matched.modules));
          console.log("✅ Saved modules from Login:", matched.modules.length);
        } else {
          await AsyncStorage.removeItem("activatedModules");
        }
      } catch (err) {
        console.error("Storage error in validateLicense:", err);
      }


      return { ok: true, customer: matched };
    } catch {
      return { ok: false, reason: "network" };
    }
  };

  // LOGIN
  const handleLogin = async () => {
    if (!selectedLicense && availableLicenses.length > 0) {
      Alert.alert("Select Shop", "Please select a shop/license before logging in.");
      return;
    }
    
    if (!username || !password) {
      Alert.alert("Missing Details", "Please enter username and password.");
      return;
    }

    setLoading(true);

    try {
      const stored = await AsyncStorage.getItem("clientId");
      if (stored) setClientId(stored.trim().toUpperCase());
    } catch { }

    const licenseResult = await validateLicense();

    if (!licenseResult.ok) {
      setLoading(false);

      switch (licenseResult.reason) {
        case "missing_client":
          Alert.alert("Client ID Missing", "Please select the client first.");
          break;
        case "network":
          Alert.alert("Network Error", "Check your internet connection.");
          break;
        case "invalid_response":
          Alert.alert("Server Error", "Unexpected server response.");
          break;
        case "not_found":
          Alert.alert("Invalid License", "Client not registered.");
          break;
        case "inactive":
          Alert.alert("License Inactive", "Contact administrator.");
          break;
        default:
          Alert.alert("License Error", "Unable to validate license.");
      }
      return;
    }

    const validClientId = licenseResult.customer.client_id;

    try {
      const loginResp = await fetch("https://tasksas.com/api/login/", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          client_id: validClientId,
        }),
      });

      if (!loginResp.ok) {
        Alert.alert("Login Failed", "Invalid username or password.");
        setLoading(false);
        return;
      }

      const loginData = await loginResp.json().catch(() => null);
      if (!loginData || !loginData.token) {
        Alert.alert("Login Failed", "Invalid response from server.");
        setLoading(false);
        return;
      }

      // Save allowed modules
      await AsyncStorage.setItem(
        "allowedMenuIds",
        JSON.stringify(loginData?.user?.allowedMenuIds || [])
      );

      // ROBUST DATA SAVING: Use Local Variables as Fallback
      // The API return might be messy or missing fields. We trust our inputs.
      const savedRole = loginData?.user?.role ?? "";
      const savedAccountCode = loginData?.user?.accountcode ?? "";
      const savedClientId = (loginData?.user?.client_id || validClientId || "").trim();
      const savedUsername = (loginData?.user?.username || username || "").trim();

      await AsyncStorage.setItem("role", savedRole);
      await AsyncStorage.setItem("accountcode", savedAccountCode);
      await AsyncStorage.setItem("client_id", savedClientId);
      await AsyncStorage.setItem("username", savedUsername);

      await AsyncStorage.setItem("authToken", loginData.token);
      await AsyncStorage.setItem("user", JSON.stringify(loginData.user));
      await AsyncStorage.setItem("loginTimestamp", Date.now().toString());

      console.log('[Login] Saved Credentials:', { savedClientId, savedUsername });

      router.replace("/(tabs)/Home");
    } catch (err) {
      console.log('Login Error', err);
      Alert.alert("Network Error", "Unable to reach login server.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLicense = async () => {
    Alert.alert(
      "Remove License",
      "Are you sure you want to remove the license? You will need to activate again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: removeLicense,
        },
      ]
    );
  };

  const removeLicense = async () => {
    setLoading(true);
    try {
      // Get license info
      let licenseKey = "";
      let deviceId = "";

      try {
        const licenseInfoStr = await AsyncStorage.getItem("licenseInfo");
        if (licenseInfoStr) {
          const info = JSON.parse(licenseInfoStr);
          licenseKey = info.license_key;
        }
        // Fallback to direct storage
        if (!licenseKey) licenseKey = await AsyncStorage.getItem("licenseKey");

        deviceId = await AsyncStorage.getItem("deviceId");
      } catch (e) { console.log(e); }

      if (!licenseKey || !deviceId) {
        Alert.alert("Error", "License information not found.");
        setLoading(false);
        return;
      }

      const LOGOUT_API = "https://activate.imcbs.com/mobileapp/api/project/tasksas/logout/";

      const response = await fetch(LOGOUT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKey, device_id: deviceId }),
      });

      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch (e) { }

      if (response.ok && data?.success) {
        // Clear all data
        const keys = await AsyncStorage.getAllKeys();
        await AsyncStorage.multiRemove(keys);

        Alert.alert(
          "Success",
          "License removed.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      } else {
        Alert.alert("Error", data?.message || "Failed to remove license.");
      }

    } catch (error) {
      Alert.alert("Error", "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Cannot open this link");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to open link");
    }
  };

  return (
    <LinearGradient
      colors={Gradients.background}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />
      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>DEMO MODE - Expires {demoExpiresAt} ({demoDaysRemaining} days remaining)</Text>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Animated.View entering={FadeInDown.springify()} style={[styles.formContainer, animatedGlow]}>
            <View style={styles.header}>
              <Text style={styles.title}>
                Task<Text style={styles.titleAccent}>SAS</Text>
              </Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </View>

            {/* Shop Selector */}
            {availableLicenses.length > 0 && (
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Select Shop</Text>
                <TouchableOpacity
                  style={styles.shopSelector}
                  onPress={() => setShowLicensePicker(true)}
                >
                  <Ionicons name="business-outline" size={20} color={Colors.text.tertiary} style={styles.icon} />
                  <Text style={[styles.shopSelectorText, !selectedLicense && { color: Colors.text.tertiary }]}>
                    {selectedLicense ? selectedLicense.shop_name : "Select a shop..."}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.text.tertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  placeholderTextColor={Colors.text.tertiary}
                  value={username}
                  autoCapitalize="characters"
                  onChangeText={(text) => setUsername(text.toUpperCase().replace(/\s/g, ""))}
                />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.text.tertiary}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={Colors.text.tertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.8 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={Gradients.primary}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Login</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Add License Button */}
            <TouchableOpacity 
              style={styles.addLicenseButton}
              onPress={() => setShowAddLicenseModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary.main} />
              <Text style={styles.addLicenseText}>Add Another License</Text>
            </TouchableOpacity>

            {/* License Info Display - Compact */}
            {(licenseKey || clientId) && (
              <View style={styles.licenseInfoContainer}>
                <View style={styles.licenseInfoRow}>
                  <Text style={styles.licenseInfoLabel}>License:</Text>
                  <Text style={styles.licenseInfoValue} numberOfLines={1}>{licenseKey || "N/A"}</Text>
                </View>
                <View style={styles.licenseInfoRow}>
                  <Text style={styles.licenseInfoLabel}>Client ID:</Text>
                  <Text style={styles.licenseInfoValue}>{clientId || "N/A"}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.removeLicenseButton} onPress={handleRemoveLicense}>
              <Text style={styles.removeLicenseText}>Remove License</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Social Media Icons */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[styles.socialIcon, { backgroundColor: '#FF9800' }]}
              onPress={() => handleSocialLink('mailto:info@imcbs.com')}
            >
              <Ionicons name="mail" size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialIcon, { backgroundColor: '#4CAF50' }]}
              onPress={() => handleSocialLink('https://www.imcbs.com/')}
            >
              <Ionicons name="globe" size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialIcon, { backgroundColor: '#E4405F' }]}
              onPress={() => handleSocialLink('https://www.instagram.com/imcbusinesssolution?igsh=bTF0aGNyaXJjMHZ4')}
            >
              <Ionicons name="logo-instagram" size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialIcon, { backgroundColor: '#1877F2' }]}
              onPress={() => handleSocialLink('https://www.facebook.com/people/IMC-Business-Solution/100069040622427/')}
            >
              <Ionicons name="logo-facebook" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>© 2026 All rights reserved. IMCB Solutions LLP</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Shop Picker Modal */}
      <Modal
        visible={showLicensePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLicensePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Shop</Text>
              <TouchableOpacity onPress={() => setShowLicensePicker(false)}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.licenseList}>
              {availableLicenses.map((license, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.licenseItem,
                    selectedLicense?.client_id === license.client_id && styles.licenseItemSelected
                  ]}
                  onPress={() => handleLicenseSelect(license)}
                >
                  <View style={styles.licenseItemContent}>
                    <Ionicons 
                      name="business" 
                      size={24} 
                      color={selectedLicense?.client_id === license.client_id ? Colors.primary.main : Colors.text.secondary} 
                    />
                    <View style={styles.licenseItemText}>
                      <Text style={[
                        styles.licenseItemName,
                        selectedLicense?.client_id === license.client_id && styles.licenseItemNameSelected
                      ]}>
                        {license.shop_name}
                      </Text>
                      <Text style={styles.licenseItemId}>Client ID: {license.client_id}</Text>
                      {license.isDemo && (
                        <Text style={styles.licenseItemDemo}>DEMO LICENSE</Text>
                      )}
                    </View>
                  </View>
                  {selectedLicense?.client_id === license.client_id && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primary.main} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add License Modal */}
      <Modal
        visible={showAddLicenseModal}
        animationType="slide"
        onRequestClose={() => setShowAddLicenseModal(false)}
      >
        <LicenseActivationScreen onActivationSuccess={handleLicenseActivationSuccess} />
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logo: {
    width: 80,
    height: 80,
  },

  formContainer: {
    width: width * 0.9,
    maxWidth: 400,
    backgroundColor: '#FFF',
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.xl,
    alignItems: "center",
    ...Shadows.xl,
  },

  header: { alignItems: 'center', marginBottom: Spacing.lg },

  title: { fontSize: Typography.sizes['2xl'], fontWeight: "800", color: Colors.text.primary },
  titleAccent: { color: Colors.primary.main },
  subtitle: { fontSize: Typography.sizes.sm, color: Colors.text.secondary, marginTop: 4 },

  inputWrapper: { width: '100%', marginBottom: Spacing.md },
  label: { fontSize: Typography.sizes.xs, fontWeight: "600", color: Colors.text.primary, marginBottom: 6, marginLeft: 4 },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    backgroundColor: Colors.neutral[50],
  },

  icon: { marginRight: Spacing.sm },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: Typography.sizes.base,
    height: '100%',
  },
  eyeIcon: { padding: Spacing.sm },

  button: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    marginTop: Spacing.sm,
    ...Shadows.colored.primary,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: Typography.sizes.base, fontWeight: "700" },

  forgotButton: { marginTop: Spacing.md, padding: Spacing.xs },
  forgotText: { color: Colors.primary.main, fontSize: Typography.sizes.xs, fontWeight: "600" },

  removeLicenseButton: { marginTop: Spacing.sm, padding: Spacing.xs },
  removeLicenseText: { color: Colors.error.main, fontSize: Typography.sizes.xs, fontWeight: "600", opacity: 0.7 },

  addLicenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary.main,
    borderRadius: BorderRadius.lg,
    borderStyle: 'dashed',
  },
  addLicenseText: {
    color: Colors.primary.main,
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
  },

  licenseInfoContainer: {
    width: '100%',
    backgroundColor: Colors.neutral[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  licenseInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  licenseInfoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
  },
  licenseInfoValue: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.secondary,
    flex: 1,
    textAlign: 'right',
  },

  footerText: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    color: Colors.text.tertiary,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  socialContainer: {
    flexDirection: "row",
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  socialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.md,
  },
  demoBanner: {
    backgroundColor: '#FF9800',
    width: '100%',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Platform.OS === 'ios' ? 40 : 0,
    elevation: 5,
    zIndex: 1000
  },
  demoText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Shop Selector Styles
  shopSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border.light,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    backgroundColor: Colors.neutral[50],
  },
  shopSelectorText: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: Typography.sizes.base,
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
    maxHeight: '70%',
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  licenseList: {
    padding: Spacing.lg,
  },
  licenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.neutral[50],
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  licenseItemSelected: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.primary[50],
  },
  licenseItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  licenseItemText: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  licenseItemName: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  licenseItemNameSelected: {
    color: Colors.primary.main,
  },
  licenseItemId: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.secondary,
  },
  licenseItemDemo: {
    fontSize: Typography.sizes.xs,
    color: '#FF9800',
    fontWeight: '700',
    marginTop: 4,
  },
});
