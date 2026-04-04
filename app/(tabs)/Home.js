// app/(tabs)/Home.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { BorderRadius, Colors, Gradients, Spacing, Typography } from '../../constants/theme';
import OfflineIndicator from '../../src/components/OfflineIndicator';
import printerService from '../../src/services/printerService';

const { width } = Dimensions.get('window');

const Home = ({ navigation }) => {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [username, setUsername] = useState('User');

  // Demo Banner State
  const [isDemo, setIsDemo] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [daysRemaining, setDaysRemaining] = useState(0);

  // Remote Punch-In Restriction
  const [isRemotePunchRestricted, setIsRemotePunchRestricted] = useState(false);


  useEffect(() => {
    // Load username from storage
    const loadUsername = async () => {
      try {
        const storedUsername = await AsyncStorage.getItem('username');
        if (storedUsername) {
          setUsername(storedUsername);
        }
      } catch (error) {
        console.error('Error loading username:', error);
      }
    };

    const checkRemotePunchRestriction = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const storedUsername = await AsyncStorage.getItem('username');
        if (!token || !storedUsername) return;

        const response = await fetch('https://tasksas.com/api/settings/options/', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const users = data.users || [];
          const currentUser = users.find(
            u => (u.username || u.id || '').toUpperCase() === storedUsername.toUpperCase()
          );
          if (currentUser && currentUser.remote_punchin_allow === true) {
            setIsRemotePunchRestricted(true);
          } else {
            setIsRemotePunchRestricted(false);
          }
        }
      } catch (e) {
        console.log('[Home] Remote punch check error:', e);
      }
    };

    loadUsername();
    checkRemotePunchRestriction();

    // Animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const checkDemoStatus = async () => {
        try {
          const demoStatus = await AsyncStorage.getItem("isDemo");
          if (demoStatus === "true") {
            setIsDemo(true);
          } else {
            setIsDemo(false);
          }
        } catch (e) { }
      };
      checkDemoStatus();
    }, [])
  );

  // MODULE PERMISSIONS
  const [allowedModules, setAllowedModules] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const fetchModules = async () => {
        try {
          const modulesStr = await AsyncStorage.getItem("activatedModules");
          if (modulesStr) {
            const modules = JSON.parse(modulesStr);
            console.log("Loaded Modules:", modules.length);
            // Create a set of module codes for faster lookup
            const moduleCodes = new Set(modules.map(m => m.module_code));
            setAllowedModules(moduleCodes);
          } else {
            // Fallback: If no modules saved (e.g. old login), maybe show all or fetch?
            // For now, let's assume if it's not present, we might be in a legacy state or offline.
            // BUT strict requirement says "check packages".
            // If we want to be strict: setAllowedModules(new Set());
            // If we want to be backward compatible until re-login: setAllowedModules(null);
            setAllowedModules(null);
          }
        } catch (e) {
          console.log("Error loading modules", e);
        }
      };

      fetchModules();
    }, [])
  );

  const showPunchInAlert = () => {
    Alert.alert(
      'Access Restricted',
      'You can only access this feature through Punch In. Please punch in at a customer location first.',
      [{ text: 'OK' }]
    );
  };

  const allQuickActions = [
    {
      icon: 'wallet-outline',
      title: 'COLLECTION',
      description: 'Record customer payments',
      onPress: () => isRemotePunchRestricted ? showPunchInAlert() : router.push("/Collection/Collection"),
      gradient: Gradients.accent,
      shadowColor: Colors.accent.main,
      moduleCode: 'MOD009',
    },
    {
      icon: 'cube-outline',
      title: 'ORDER',
      description: 'Place a new stock order',
      onPress: () => isRemotePunchRestricted ? showPunchInAlert() : router.push("/Order/Entry"),
      gradient: Gradients.secondary,
      shadowColor: Colors.secondary.main,
      moduleCode: 'MOD007',
    },
    {
      icon: 'cart-outline',
      title: 'SALES',
      description: 'Create a new sales entry',
      onPress: () => isRemotePunchRestricted ? showPunchInAlert() : router.push("/Sales/SalesEntry"),
      gradient: Gradients.success,
      shadowColor: Colors.success.main,
      moduleCode: 'MOD008',
    },
    {
      icon: 'return-up-back-outline',
      title: 'SALES RETURN',
      description: 'Process a return',
      onPress: () => isRemotePunchRestricted ? showPunchInAlert() : router.push("/SalesReturn/ReturnEntry"),
      gradient: Colors.primary[400] ? [Colors.primary[400], Colors.primary[600]] : Gradients.primary,
      shadowColor: Colors.primary.main,
      moduleCode: 'MOD010',
    },
    {
      icon: 'cloud-download-outline',
      title: 'SYNC DATA',
      description: 'Download & Refresh',
      onPress: () => router.push("/SyncData"),
      gradient: Gradients.info || [Colors.primary[400], Colors.primary[600]],
      shadowColor: Colors.primary.main,
      // Always allowed
    },
    {
      icon: 'finger-print',
      title: 'PUNCH IN',
      description: 'Mark your attendance',
      onPress: () => router.push("/Punch-In"),
      gradient: Gradients.success,
      shadowColor: Colors.success.main,
      moduleCode: 'MOD011',
    },
    {
      icon: 'people',
      title: 'CUSTOMERS',
      description: 'Registered customers',
      onPress: () => router.push("/customers"),
      gradient: [Colors.secondary[400], Colors.secondary[600]],
      shadowColor: Colors.secondary.main,
      moduleCode: 'MOD012',
    },
    {
      icon: 'location',
      title: 'LOCATION',
      description: 'Location Capture',
      onPress: () => router.push("/location-capture"),
      gradient: [Colors.warning[400], Colors.warning[600]],
      shadowColor: Colors.warning.main,
      moduleCode: 'MOD011',
    },
  ];

  const quickActions = allQuickActions.filter(action => {
    // If it has no moduleCode, it is always allowed (Basic features)
    if (!action.moduleCode) return true;

    // If we haven't loaded modules yet (null), show all (or hide all? decision: show all for UX speed/backward compat)
    // OR strict mode: valid active license MUST have modules.
    if (allowedModules === null) return true; // Show until we know otherwise

    // Check if the module code exists in the allowed set
    return allowedModules.has(action.moduleCode);
  });


  const getCurrentDate = () => {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
  };

  return (
    <LinearGradient colors={Gradients.background} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.primary[50]} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >


          {/* Header Section */}
          <Animated.View
            style={[
              styles.headerSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.greeting}>Hello, {username}</Text>
                {isDemo && (
                  <Text style={[styles.date, { color: '#FF9800', fontWeight: 'bold' }]}>DEMO LICENSE</Text>
                )}
                <Text style={styles.date}>{getCurrentDate()}</Text>
              </View>
              <View>
                <OfflineIndicator />
              </View>
            </View>
          </Animated.View>

          {/* Quick Actions Grid */}
          <Animated.View
            style={[
              styles.actionsGrid,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <View style={styles.gridContainer}>
              {quickActions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.actionCardContainer,
                    action.highlight && styles.highlightCard
                  ]}
                  onPress={action.onPress}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={action.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.actionCard,
                      { shadowColor: action.shadowColor }
                    ]}
                  >
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={action.icon}
                        size={28}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={styles.actionTitle}>
                        {action.title}
                      </Text>
                      <Text style={styles.actionDescription} numberOfLines={2}>
                        {action.description}
                      </Text>
                    </View>
                    <Ionicons
                      name="arrow-forward-circle"
                      size={24}
                      color="rgba(255,255,255,0.6)"
                      style={styles.arrowIcon}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>© 2026 All rights reserved. IMCB Solutions LLP</Text>
          </View>
        </ScrollView>


      </SafeAreaView>
    </LinearGradient >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },

  headerSection: {
    marginBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: Typography.sizes['2xl'],
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  date: {
    fontSize: Typography.sizes.sm,
    color: Colors.text.secondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
    marginTop: Spacing.md,
  },
  actionsGrid: {
    marginTop: Spacing.md,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  actionCardContainer: {
    width: (width - (Spacing.lg * 2) - Spacing.md) / 2, // calculate exact width for 2 columns
    marginBottom: Spacing.sm,
  },
  highlightCard: {
    width: '100%', // full width for highlighted card
  },
  actionCard: {
    height: 160,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    justifyContent: 'space-between',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(10px)', // works on some versions, ignored on others
  },
  cardContent: {
    marginTop: Spacing.sm,
  },
  actionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  actionDescription: {
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    fontWeight: '500',
  },
  arrowIcon: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
  },

  footerContainer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl * 2, // Extra space for safe area
  },
  footerText: {
    color: Colors.text.tertiary,
    fontSize: Typography.sizes.xs,
  },
});

export default Home;