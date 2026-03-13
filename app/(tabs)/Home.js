// app/(tabs)/Home.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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

  // Settings Modal State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
  const [isProductSettingsOpen, setIsProductSettingsOpen] = useState(false);
  const [isPaymentSettingsOpen, setIsPaymentSettingsOpen] = useState(false);
  const [isPrintFormSettingsOpen, setIsPrintFormSettingsOpen] = useState(false);
  const [paperSize, setPaperSize] = useState(58); // Default 58mm
  const [showStockOnly, setShowStockOnly] = useState(false);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState('Cash');
  const [defaultQuantity, setDefaultQuantity] = useState(1); // Default to 1
  const [printFormType, setPrintFormType] = useState('form1'); // 'form1' | 'form2'

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

    loadUsername();
    loadUsername();
    loadPrinterSettings();
    loadProductSettings();
    loadPaymentSettings();
    loadPrintFormSettings();

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

  const allQuickActions = [
    {
      icon: 'wallet-outline',
      title: 'COLLECTION',
      description: 'Record customer payments',
      onPress: () => router.push("/Collection/Collection"),
      gradient: Gradients.accent,
      shadowColor: Colors.accent.main,
      moduleCode: 'MOD009',
    },
    {
      icon: 'cube-outline',
      title: 'ORDER',
      description: 'Place a new stock order',
      onPress: () => router.push("/Order/Entry"),
      gradient: Gradients.secondary,
      shadowColor: Colors.secondary.main,
      moduleCode: 'MOD007',
    },
    {
      icon: 'cart-outline',
      title: 'SALES',
      description: 'Create a new sales entry',
      onPress: () => router.push("/Sales/SalesEntry"),
      gradient: Gradients.success,
      shadowColor: Colors.success.main,
      moduleCode: 'MOD008',
    },
    {
      icon: 'return-up-back-outline',
      title: 'SALES RETURN',
      description: 'Process a return',
      onPress: () => router.push("/SalesReturn/ReturnEntry"),
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
      icon: 'settings-outline',
      title: 'SETTINGS',
      description: 'Printer configuration',
      onPress: () => {
        loadPrinterSettings();
        loadPaymentSettings();
        loadPrintFormSettings();
        setIsPrinterSettingsOpen(false);
        setIsProductSettingsOpen(false);
        setIsPaymentSettingsOpen(false);
        setIsPrintFormSettingsOpen(false);
        setSettingsModalVisible(true);
      },
      gradient: [Colors.text.secondary, Colors.text.primary],
      shadowColor: '#000',
      // Always allowed
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

  const loadPrinterSettings = async () => {
    // We can rely on printerService to load its own settings, but we need to know the current value for UI
    try {
      await printerService.loadSettings();
      setPaperSize(printerService.printerWidthMM);
    } catch (e) {
      console.log("Printer settings load error", e);
    }
  };

  const handlePaperSizeSelection = async (size) => {
    setPaperSize(size);
    try {
      await printerService.setPaperWidth(size);
    } catch (e) {
      console.log("Printer paper size set error", e);
    }
  };

  const loadProductSettings = async () => {
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (!currentUsername) return;

      const key = `settings_show_stock_only_${currentUsername}`;
      const val = await AsyncStorage.getItem(key);
      if (val === 'true') setShowStockOnly(true);
      else setShowStockOnly(false);

      // Load Default Quantity
      const qtyKey = `settings_default_quantity_${currentUsername}`;
      const qtyVal = await AsyncStorage.getItem(qtyKey);
      if (qtyVal !== null) {
        setDefaultQuantity(parseInt(qtyVal, 10));
      } else {
        setDefaultQuantity(1); // Default if not set
      }
    } catch (e) {
      console.log("Error loading product settings", e);
    }
  };

  const toggleShowStockOnly = async () => {
    const newValue = !showStockOnly;
    setShowStockOnly(newValue);
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (currentUsername) {
        const key = `settings_show_stock_only_${currentUsername}`;
        await AsyncStorage.setItem(key, String(newValue));
      }
    } catch (e) {
      console.log("Error saving product settings", e);
    }
  };

  const toggleDefaultQuantity = async () => {
    const newValue = defaultQuantity === 1 ? 0 : 1;
    setDefaultQuantity(newValue);
    try {
      const currentUsername = await AsyncStorage.getItem('username');
      if (currentUsername) {
        const key = `settings_default_quantity_${currentUsername}`;
        await AsyncStorage.setItem(key, String(newValue));
      }
    } catch (e) {
      console.log("Error saving default quantity settings", e);
    }
  };

  const loadPaymentSettings = async () => {
    try {
      const val = await AsyncStorage.getItem('settings_default_payment_method');
      if (val) setDefaultPaymentMethod(val);
    } catch (e) {
      console.log("Error loading payment settings", e);
    }
  };

  const handlePaymentMethodSelection = async (method) => {
    setDefaultPaymentMethod(method);
    try {
      await AsyncStorage.setItem('settings_default_payment_method', method);
    } catch (e) {
      console.log("Error saving payment settings", e);
    }
  };

  const loadPrintFormSettings = async () => {
    try {
      const val = await AsyncStorage.getItem('settings_print_form_type');
      if (val) setPrintFormType(val);
    } catch (e) {
      console.log("Error loading print form settings", e);
    }
  };

  const handlePrintFormSelection = async (formType) => {
    setPrintFormType(formType);
    try {
      await AsyncStorage.setItem('settings_print_form_type', formType);
    } catch (e) {
      console.log("Error saving print form settings", e);
    }
  };

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

        {/* Settings Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={settingsModalVisible}
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>

              {/* Header */}
              <View style={styles.modalHeader}>
                {isPrinterSettingsOpen || isProductSettingsOpen || isPaymentSettingsOpen || isPrintFormSettingsOpen ? (
                  <TouchableOpacity onPress={() => {
                    setIsPrinterSettingsOpen(false);
                    setIsProductSettingsOpen(false);
                    setIsPaymentSettingsOpen(false);
                    setIsPrintFormSettingsOpen(false);
                  }} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.modalTitle}>
                  {isPrinterSettingsOpen ? "Printer Settings" :
                    (isProductSettingsOpen ? "Product Settings" :
                      (isPaymentSettingsOpen ? "Payment Settings" :
                        (isPrintFormSettingsOpen ? "Print Form" : "Settings")))}
                </Text>

                <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Content Logic */}
              {/* Content Logic */}
              {!isPrinterSettingsOpen && !isProductSettingsOpen && !isPaymentSettingsOpen && !isPrintFormSettingsOpen ? (
                /* Main Settings Menu */
                <View>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsPrinterSettingsOpen(true)}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
                        <Ionicons name="print-outline" size={24} color={Colors.primary.main} />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Printer Settings</Text>
                        <Text style={styles.menuItemSubtitle}>Configure paper size & width</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.text.tertiary} />
                  </TouchableOpacity>

                  {/* Print Form Settings */}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsPrintFormSettingsOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.08)' }]}>
                        <Ionicons name="document-text-outline" size={24} color={Colors.primary.main} />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Print Form</Text>
                        <Text style={styles.menuItemSubtitle}>
                          {printFormType === 'form2' ? 'Form 2 selected (No HSN/GST)' : 'Form 1 selected (With HSN/GST)'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.text.tertiary} />
                  </TouchableOpacity>

                  {/* Product Settings */}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsProductSettingsOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(255, 152, 0, 0.1)' }]}>
                        <Ionicons name="cube-outline" size={24} color="#FF9800" />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Products</Text>
                        <Text style={styles.menuItemSubtitle}>Manage product visibility</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.text.tertiary} />
                  </TouchableOpacity>

                  {/* Payment Settings */}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsPaymentSettingsOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
                        <Ionicons name="card-outline" size={24} color={Colors.success.main} />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Payment Method</Text>
                        <Text style={styles.menuItemSubtitle}>Set default for new orders</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ) : isProductSettingsOpen ? (
                /* Inner Product Settings View */
                <View style={styles.settingItem}>
                  <TouchableOpacity
                    style={[styles.menuItem, { borderBottomWidth: 0 }]}
                    onPress={toggleShowStockOnly}
                    activeOpacity={0.8}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: showStockOnly ? 'rgba(76, 175, 80, 0.1)' : 'rgba(158, 158, 158, 0.1)' }]}>
                        <Ionicons name={showStockOnly ? "checkmark-circle" : "ellipse-outline"} size={24} color={showStockOnly ? Colors.success.main : Colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemTitle}>Show Stock Only</Text>
                        <Text style={styles.menuItemSubtitle} numberOfLines={2}>Only display products with available stock</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={showStockOnly ? "toggle" : "toggle-outline"}
                      size={32}
                      color={showStockOnly ? Colors.success.main : Colors.text.tertiary}
                    />
                  </TouchableOpacity>

                  <View style={{ height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 }} />

                  <TouchableOpacity
                    style={[styles.menuItem, { borderBottomWidth: 0 }]}
                    onPress={toggleDefaultQuantity}
                    activeOpacity={0.8}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: defaultQuantity === 1 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(158, 158, 158, 0.1)' }]}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: defaultQuantity === 1 ? Colors.success.main : Colors.text.tertiary }}>
                          {defaultQuantity}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemTitle}>Default Form Quantity</Text>
                        <Text style={styles.menuItemSubtitle} numberOfLines={2}>
                          {defaultQuantity === 1 ? "Start with quantity 1" : "Start with quantity 0 (Manual Entry)"}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={defaultQuantity === 1 ? "toggle" : "toggle-outline"}
                      size={32}
                      color={defaultQuantity === 1 ? Colors.success.main : Colors.text.tertiary}
                    />
                  </TouchableOpacity>
                </View>
              ) : isPaymentSettingsOpen ? (
                /* Inner Payment Settings View */
                <View style={styles.settingItem}>
                  <View style={styles.settingLabelContainer}>
                    <Text style={styles.settingLabel}>Default Payment Method</Text>
                  </View>

                  <View style={styles.sizeSelectionContainer}>
                    <TouchableOpacity
                      style={[styles.sizeOption, defaultPaymentMethod === 'Cash' && styles.sizeOptionSelected]}
                      onPress={() => handlePaymentMethodSelection('Cash')}
                    >
                      <Ionicons name={defaultPaymentMethod === 'Cash' ? "radio-button-on" : "radio-button-off"} size={24} color={defaultPaymentMethod === 'Cash' ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, defaultPaymentMethod === 'Cash' && styles.sizeOptionTitleSelected]}>Cash</Text>
                        <Text style={styles.sizeOptionSubtitle}>Standard Cash/Bank</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, defaultPaymentMethod === 'Credit' && styles.sizeOptionSelected]}
                      onPress={() => handlePaymentMethodSelection('Credit')}
                    >
                      <Ionicons name={defaultPaymentMethod === 'Credit' ? "radio-button-on" : "radio-button-off"} size={24} color={defaultPaymentMethod === 'Credit' ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, defaultPaymentMethod === 'Credit' && styles.sizeOptionTitleSelected]}>Credit</Text>
                        <Text style={styles.sizeOptionSubtitle}>Credit Sale</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    This method will be auto-selected when you create a new order.
                  </Text>
                </View>
              ) : isPrintFormSettingsOpen ? (
                /* Inner Print Form Settings View */
                <View style={styles.settingItem}>
                  <Text style={[styles.settingLabel, { marginBottom: 12 }]}>Select Print Format</Text>
                  <Text style={[styles.helperText, { marginBottom: 16 }]}>
                    Choose which receipt layout to use when printing orders.
                  </Text>

                  {/* Form 1 Card */}
                  <TouchableOpacity
                    style={[
                      styles.sizeOption,
                      { flexDirection: 'column', alignItems: 'flex-start', padding: 12, marginBottom: 12 },
                      printFormType === 'form1' && styles.sizeOptionSelected
                    ]}
                    onPress={() => handlePrintFormSelection('form1')}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <Ionicons
                        name={printFormType === 'form1' ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={printFormType === 'form1' ? Colors.primary.main : Colors.text.tertiary}
                      />
                      <Text style={[styles.sizeOptionTitle, printFormType === 'form1' && styles.sizeOptionTitleSelected]}>
                        Form 1  —  With HSN / GST
                      </Text>
                    </View>
                    <View style={styles.printPreviewBox}>
                      <Text style={styles.printPreviewText}>{`Company Name
--------------------------------
Item           Qty      Total
--------------------------------
PRODUCT NAME   1.000    50.00
  HSN:1234 GST:12%
PRODUCT 2      2.000   100.00
  HSN:5678 GST:5%
--------------------------------
TOTAL:              150.00`}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Form 2 Card */}
                  <TouchableOpacity
                    style={[
                      styles.sizeOption,
                      { flexDirection: 'column', alignItems: 'flex-start', padding: 12, marginBottom: 4 },
                      printFormType === 'form2' && styles.sizeOptionSelected
                    ]}
                    onPress={() => handlePrintFormSelection('form2')}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <Ionicons
                        name={printFormType === 'form2' ? 'radio-button-on' : 'radio-button-off'}
                        size={22}
                        color={printFormType === 'form2' ? Colors.primary.main : Colors.text.tertiary}
                      />
                      <Text style={[styles.sizeOptionTitle, printFormType === 'form2' && styles.sizeOptionTitleSelected]}>
                        Form 2  —  No HSN / GST
                      </Text>
                    </View>
                    <View style={styles.printPreviewBox}>
                      <Text style={styles.printPreviewText}>{`Company Name
--------------------------------
Sales Receipt
--------------------------------
Inv Date: 01/01/2025 10:30
Inv No  : SP991   Salesman: ALI
Customer: FOOD BASKET
--------------------------------
NO ITEM         QTY  PRICE TOTAL
--------------------------------
1  PRODUCT NAME 2.00  28.00 56.00
2  PRODUCT 2    1.00  35.00 35.00
--------------------------------
TOTAL:                    91.00
--------------------------------
         Thank You!`}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Inner Printer Settings View */
                <View style={styles.settingItem}>

                  <View style={styles.settingLabelContainer}>
                    <Text style={styles.settingLabel}>Paper Size</Text>
                  </View>

                  <View style={styles.sizeSelectionContainer}>
                    <TouchableOpacity
                      style={[styles.sizeOption, paperSize === 58 && styles.sizeOptionSelected]}
                      onPress={() => handlePaperSizeSelection(58)}
                    >
                      <Ionicons name={paperSize === 58 ? "radio-button-on" : "radio-button-off"} size={24} color={paperSize === 58 ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, paperSize === 58 && styles.sizeOptionTitleSelected]}>2 Inch</Text>
                        <Text style={styles.sizeOptionSubtitle}>Standard Receipt</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, paperSize === 80 && styles.sizeOptionSelected]}
                      onPress={() => handlePaperSizeSelection(80)}
                    >
                      <Ionicons name={paperSize === 80 ? "radio-button-on" : "radio-button-off"} size={24} color={paperSize === 80 ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, paperSize === 80 && styles.sizeOptionTitleSelected]}>3 Inch</Text>
                        <Text style={styles.sizeOptionSubtitle}>Wide Receipt</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, paperSize === 104 && styles.sizeOptionSelected]}
                      onPress={() => handlePaperSizeSelection(104)}
                    >
                      <Ionicons name={paperSize === 104 ? "radio-button-on" : "radio-button-off"} size={24} color={paperSize === 104 ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, paperSize === 104 && styles.sizeOptionTitleSelected]}>4 Inch</Text>
                        <Text style={styles.sizeOptionSubtitle}>Extra Wide Receipt</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    Select 2 Inch for portable printers, 3 Inch for desktop, 4 Inch for extra wide.
                  </Text>

                  <View style={styles.visualizerContainer}>
                    <Text style={[styles.visualizerText, { width: '100%', textAlign: 'center' }]}>
                      Preview Line Width:
                    </Text>
                    <Text style={[styles.visualizerLine, { fontSize: 10 }]}>
                      {'-'.repeat(Math.floor((paperSize / 58) * 32))}
                    </Text>
                  </View>
                </View>
              )}

            </View>
          </View>
        </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end', // sheet style or center? center might be better for small settings
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: Spacing.md
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  settingItem: {
    marginBottom: Spacing.xl,
  },
  settingLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: 10
  },
  settingLabel: {
    fontSize: Typography.sizes.lg,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3
  },
  valueContainer: {
    alignItems: 'center',
    minWidth: 80,
  },
  valueText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  unitText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500'
  },
  helperText: {
    textAlign: 'center',
    marginTop: 8,
    color: Colors.text.tertiary,
    fontSize: 12
  },
  closeButton: {
    backgroundColor: Colors.secondary.main,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.sm
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: Spacing.xs
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1, // Allow taking up available space
    paddingRight: Spacing.md // Add spacing before the right icon/toggle
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  menuItemSubtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.text.tertiary,
    marginTop: 2
  },
  backButton: {
    marginRight: Spacing.sm
  },
  visualizerContainer: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: '#f8f9fa',
    borderRadius: BorderRadius.lg,
    alignItems: 'center'
  },
  visualizerText: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  visualizerLine: {
    fontFamily: 'monospace',
    color: Colors.text.secondary
  },
  sizeSelectionContainer: {
    flexDirection: 'column',
    gap: Spacing.md,
    marginBottom: Spacing.md
  },
  sizeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    gap: Spacing.sm,
    backgroundColor: '#fff'
  },
  sizeOptionSelected: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.primary[50]
  },
  sizeOptionTitle: {
    fontWeight: '600',
    fontSize: 14,
    color: Colors.text.secondary
  },
  sizeOptionTitleSelected: {
    color: Colors.primary.main
  },
  sizeOptionSubtitle: {
    fontSize: 10,
    color: Colors.text.tertiary
  },
  printPreviewBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
    padding: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  printPreviewText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: '#333',
    lineHeight: 14,
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