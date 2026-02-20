// app/(tabs)/Company.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { BorderRadius, Colors, Gradients, Shadows, Spacing, Typography } from "../../constants/theme";
import dbService from "../../src/services/database";

const Company = () => {
  const router = useRouter();
  const [customersCount, setCustomersCount] = useState(0);
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    loadCustomerCount();
  }, []);

  const loadCustomerCount = async () => {
    try {
      await dbService.init();
      const stats = await dbService.getDataStats();
      setCustomersCount(stats?.customers || 0);
    } catch (error) {
      console.error('[Company] Error loading customer count:', error);
    }
  };

  const handleLogout = async () => {
    try {
      // SMART LOGOUT: Preserve License & Device Info, Clear User Data
      const keys = await AsyncStorage.getAllKeys();
      const preservedKeys = [
        'clientId',
        'licenseInfo',
        'licenseKey',
        'deviceId',
        'device_hardware_id',
        'app_settings'
      ];

      // Also preserve all placed_orders_* keys (user-specific order data)
      const keysToRemove = keys.filter(key => {
        if (preservedKeys.includes(key)) return false;
        if (key.startsWith('placed_orders_')) return false; // Preserve order data
        return true;
      });

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log('[Company] Smart Logout: Cleared', keysToRemove);
      }
    } catch (e) {
      console.error('[Company] Logout Error:', e);
    }

    setLogoutVisible(false);
    router.replace("/LoginScreen");
  };

  // MODULE PERMISSIONS
  const [allowedModules, setAllowedModules] = useState(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const modulesStr = await AsyncStorage.getItem("activatedModules");
        if (modulesStr) {
          const modules = JSON.parse(modulesStr);
          // Create a set of module codes for faster lookup
          const moduleCodes = new Set(modules.map(m => m.module_code));
          setAllowedModules(moduleCodes);
        } else {
          setAllowedModules(null);
        }
      } catch (e) {
        console.log("Error loading modules", e);
      }
    };

    fetchModules();
  }, []);

  const allQuickActions = [
    {
      icon: "business",
      title: "About Company",
      description: "Company mission, values, and history",
      onPress: () => router.push("/company-info"),
      color: Colors.primary.main,
      bg: Colors.primary[50],
      // Always allowed
    },
    {
      icon: "people",
      title: "Customers",
      description: `${customersCount} registered customers`,
      onPress: () => router.push("/customers"),
      color: Colors.secondary.main,
      bg: Colors.secondary[50],
      moduleCode: 'MOD012', // Customers Module
    }
  ];

  const quickActions = allQuickActions.filter(action => {
    if (!action.moduleCode) return true;
    if (allowedModules === null) return true;
    return allowedModules.has(action.moduleCode);
  });

  const showLocationCapture = allowedModules === null || allowedModules.has('MOD011'); // Punch In Module

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Company</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          <View style={styles.bannerContainer}>
            <LinearGradient
              colors={Gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              <View style={styles.bannerContent}>
                <View style={styles.bannerIcon}>
                  <Ionicons name="briefcase" size={32} color={Colors.primary.main} />
                </View>
                <View>
                  <Text style={styles.bannerTitle}>Business Center</Text>
                  <Text style={styles.bannerSubtitle}>Manage your company data</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <View style={styles.listContainer}>
              {quickActions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.actionCard}
                  onPress={action.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: action.bg }]}>
                    <Ionicons name={action.icon} size={24} color={action.color} />
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionDescription}>{action.description}</Text>
                  </View>

                  <View style={styles.arrowContainer}>
                    <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>


          {/* Attendance Section */}
          {showLocationCapture && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attendance</Text>
              <View style={styles.attendanceCard}>
                <TouchableOpacity
                  style={styles.attendanceItem}
                  activeOpacity={0.7}
                  onPress={() => router.push("/location-capture")}
                >
                  <View style={[styles.attendanceIcon, { backgroundColor: Colors.warning[50] }]}>
                    <Ionicons name="location" size={24} color={Colors.warning.main} />
                  </View>
                  <Text style={styles.attendanceLabel}>Location Capture</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.infoSection}>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={20} color={Colors.primary.main} />
              <Text style={styles.infoText}>
                Use the Home screen to download or sync the latest company data.
              </Text>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => setLogoutVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.error.main} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Logout Confirmation Modal */}
        <Modal
          visible={logoutVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setLogoutVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalIcon}>
                <Ionicons name="log-out" size={32} color={Colors.error.main} />
              </View>
              <Text style={styles.modalTitle}>Confirm Logout</Text>
              <Text style={styles.modalMessage}>
                Are you sure you want to end your session?
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setLogoutVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleLogout}
                >
                  <Text style={styles.confirmButtonText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    marginTop: 35,
    paddingBottom: Spacing.md,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  pageTitle: {
    fontSize: Typography.sizes['3xl'],
    fontWeight: '700',
    color: Colors.text.primary,
  },
  scrollView: {
    flex: 1
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: 100, // Space for tab bar
  },
  bannerContainer: {
    marginBottom: Spacing.xl,
  },
  banner: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  bannerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  bannerTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  listContainer: {
    gap: Spacing.md,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  actionTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
  },
  arrowContainer: {
    marginLeft: Spacing.sm,
  },
  infoSection: {
    marginTop: Spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.primary[50], // Very light purple
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary[100],
  },
  infoText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.primary[900],
    lineHeight: 20,
  },

  attendanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.light,
    ...Shadows.sm,
  },
  attendanceItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  attendanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attendanceLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.error[50],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.error[100],
  },
  logoutText: {
    fontSize: Typography.sizes.base,
    color: Colors.error.main,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.xl,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.error[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  modalMessage: {
    fontSize: Typography.sizes.base,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.medium,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error.main,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default Company;