// app/(tabs)/Dashboard.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Spacing, Typography } from "../../constants/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const [licenseKey, setLicenseKey] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // License validity states
  const [expiryDate, setExpiryDate] = useState("");
  const [remainingDays, setRemainingDays] = useState(null);
  const [isExpired, setIsExpired] = useState(false);



  useEffect(() => {
    loadStoredData();
  }, []);

  useEffect(() => {
    if (licenseKey) {
      fetchLicenseInfo();
    }
  }, [licenseKey]);

  const loadStoredData = async () => {
    try {
      const storedLicenseKey = await AsyncStorage.getItem("licenseKey");
      const storedDeviceId = await AsyncStorage.getItem("deviceId");
      const storedCustomerName = await AsyncStorage.getItem("customerName");

      const demoStatus = await AsyncStorage.getItem("isDemo");
      const demoExpiry = await AsyncStorage.getItem("demoExpiresAt");

      setLicenseKey(storedLicenseKey || "");
      setDeviceId(storedDeviceId || "");
      setCustomerName(storedCustomerName || "");



      // Override for Demo
      if (demoStatus === "true" && demoExpiry) {
        setExpiryDate(demoExpiry);
        const now = new Date();
        const exp = new Date(demoExpiry);
        const diff = exp - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        setRemainingDays(days > 0 ? days : 0);
        setIsExpired(days <= 0);
        // Prevent fetching API again purely for validity if known
      }
    } catch (error) {
      console.error("Error loading stored data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const fetchLicenseInfo = async () => {
    try {
      // Check demo status first to avoid overwriting with potentially empty API match if not in customer list
      const demoStatus = await AsyncStorage.getItem("isDemo");
      if (demoStatus === "true") return;

      const LICENSE_INFO_API = "https://activate.imcbs.com/mobileapp/api/project/tasksas/";

      const response = await fetch(LICENSE_INFO_API, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok && data.success && data.customers && data.customers.length > 0) {
        // Find the customer with matching license key
        const customer = data.customers.find(c => c.license_key === licenseKey);

        if (customer && customer.license_validity) {
          const validity = customer.license_validity;
          setExpiryDate(validity.expiry_date || "");
          setRemainingDays(validity.remaining_days);
          setIsExpired(validity.is_expired || false);
        }
      }
    } catch (error) {
      console.error("Error fetching license info:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLicenseInfo();
    setRefreshing(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Not available";
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const handleRemoveLicense = async () => {
    Alert.alert(
      "Remove License",
      "Are you sure you want to remove this license? You will need to activate again and login.",
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

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout? The license will remain active.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: logout,
        },
      ]
    );
  };

  const logout = async () => {
    try {
      // CLEAR ONLY SESSION DATA
      const sessionKeys = ["authToken", "user", "loginTimestamp"];
      await AsyncStorage.multiRemove(sessionKeys);
      router.replace("/");
    } catch (error) {
      console.error("Logout error", error);
      Alert.alert("Error", "Failed to logout.");
    }
  };



  const removeLicense = async () => {
    if (!licenseKey || !deviceId) {
      Alert.alert("Error", "License information not found");
      return;
    }

    setLoading(true);

    try {
      const LOGOUT_API = "https://activate.imcbs.com/mobileapp/api/project/tasksas/logout/";

      console.log("Removing license...");
      console.log("License Key:", licenseKey);
      console.log("Device ID:", deviceId);

      const response = await fetch(LOGOUT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          license_key: licenseKey,
          device_id: deviceId,
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        setLoading(false);
        return;
      }

      if (response.ok && data.success) {
        await AsyncStorage.multiRemove([
          "licenseActivated",
          "licenseKey",
          "deviceId",
          "customerName",
          "projectName",
          "clientId",
          "user",
          "authToken",
          "licenseInfo",
        ]);

        Alert.alert(
          "Success",
          "License removed successfully. You will be redirected to activation.",
          [
            {
              text: "OK",
              onPress: () => {
                router.replace("/");
              },
            },
          ]
        );
      } else {
        const errorMessage = data.message || data.error || "Failed to remove license.";
        Alert.alert("Error", errorMessage);
      }
    } catch (error) {
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) {
    return (
      <LinearGradient colors={Gradients.darkBackground} style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary[300]} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={Gradients.darkBackground} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary[300]}
              colors={[Colors.primary[300]]}
            />
          }
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark" size={40} color={Colors.primary[400]} />
              </View>
              <Text style={styles.title}>Dashboard</Text>
              <Text style={styles.subtitle}>License Management</Text>
            </View>

            {/* License Validity Card */}
            {expiryDate && (
              <View style={[styles.validityCard, isExpired && styles.expiredCard]}>
                <View style={styles.validityHeader}>
                  <Ionicons
                    name={isExpired ? "alert-circle" : "time-outline"}
                    size={24}
                    color={isExpired ? Colors.error[400] : Colors.primary[400]}
                  />
                  <Text style={styles.validityTitle}>License Validity</Text>
                </View>

                <View style={styles.validityContent}>
                  <View style={styles.validityRow}>
                    <View style={styles.validityItem}>
                      <Text style={styles.validityLabel}>Expiry Date</Text>
                      <Text style={[styles.validityValue, isExpired && styles.expiredText]}>
                        {formatDate(expiryDate)}
                      </Text>
                    </View>

                    <View style={styles.validityDivider} />

                    <View style={styles.validityItem}>
                      <Text style={styles.validityLabel}>Days Remaining</Text>
                      <View style={styles.daysContainer}>
                        <Text style={[styles.daysValue, isExpired && styles.expiredText]}>
                          {remainingDays !== null ? remainingDays : "N/A"}
                        </Text>
                        <Text style={[styles.daysText, isExpired && styles.expiredText]}>
                          {remainingDays === 1 ? "day" : "days"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {isExpired && (
                    <View style={styles.expiredBanner}>
                      <Ionicons name="warning" size={16} color={Colors.error[300]} />
                      <Text style={styles.expiredBannerText}>License has expired</Text>
                    </View>
                  )}

                  {!isExpired && remainingDays !== null && remainingDays <= 30 && (
                    <View style={styles.warningBanner}>
                      <Ionicons name="alert-circle-outline" size={16} color="#FFA500" />
                      <Text style={styles.warningBannerText}>
                        License expiring soon
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* License Information Card */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusBadge, isExpired && styles.statusBadgeExpired]}>
                  <View style={[styles.statusDot, isExpired && styles.statusDotExpired]} />
                  <Text style={[styles.statusText, isExpired && styles.statusTextExpired]}>
                    {isExpired ? "Expired License" : "Active License"}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {customerName ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Customer</Text>
                  <Text style={styles.infoValue}>{customerName}</Text>
                </View>
              ) : null}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>License Key</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {licenseKey || "Not available"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device ID</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {deviceId || "Not available"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>App Version</Text>
                <Text style={styles.infoValue}>4.3.3</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Generated Date</Text>
                <Text style={styles.infoValue}>20/06/2026</Text>

              </View>

            </View>

            {/* Info Text */}
            <View style={styles.warningContainer}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.text.tertiary} />
              <Text style={styles.warningText}>
                Removing the license will require re-activation and login.
              </Text>
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              style={[styles.logoutButton]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.primary[500], Colors.primary[700]]}
                style={styles.gradientButton}
              >
                <Ionicons name="log-out-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Logout</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Remove License Button */}
            <TouchableOpacity
              style={[styles.removeButton, loading && styles.buttonDisabled]}
              onPress={handleRemoveLicense}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={loading ? [Colors.error[300], Colors.error[300]] : [Colors.error[500], Colors.error[700]]}
                style={styles.gradientButton}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.buttonText}>Removing...</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.buttonText}>Remove License</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    paddingTop: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing['3xl'],
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing['2xl'],
    marginTop: Spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  title: {
    fontSize: Typography.sizes['3xl'],
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.md,
    color: Colors.text.tertiary,
    fontWeight: "400",
  },
  validityCard: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    marginBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  expiredCard: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  validityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  validityTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: Spacing.sm,
  },
  validityContent: {
    gap: Spacing.md,
  },
  validityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  validityItem: {
    flex: 1,
    alignItems: 'center',
  },
  validityDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: Spacing.md,
  },
  validityLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    marginBottom: Spacing.sm,
    fontWeight: "500",
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  validityValue: {
    fontSize: Typography.sizes.base,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  daysContainer: {
    alignItems: 'center',
  },
  daysValue: {
    fontSize: Typography.sizes['3xl'],
    color: Colors.primary[300],
    fontWeight: '700',
  },
  daysText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  expiredText: {
    color: Colors.error[300],
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 8,
    marginTop: Spacing.sm,
  },
  expiredBannerText: {
    color: Colors.error[300],
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 8,
    marginTop: Spacing.sm,
  },
  warningBannerText: {
    color: '#FFA500',
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusBadgeExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success.main,
    marginRight: 8,
  },
  statusDotExpired: {
    backgroundColor: Colors.error[400],
  },
  statusText: {
    color: Colors.success[300],
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
  },
  statusTextExpired: {
    color: Colors.error[300],
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: Spacing.lg,
  },
  infoRow: {
    marginBottom: Spacing.md,
  },
  infoLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    marginBottom: 4,
    fontWeight: "500",
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: Typography.sizes.base,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  warningContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    gap: 8,
    paddingHorizontal: Spacing.xl,
  },
  warningText: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    textAlign: 'center',
    flex: 1,
  },
  removeButton: {
    width: '100%',
    shadowColor: Colors.error.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: Spacing.xl,
  },
  gradientButton: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: Typography.sizes.base,
    fontWeight: "bold",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoutButton: {
    width: '100%',
    shadowColor: Colors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: Spacing.md,
  },



});