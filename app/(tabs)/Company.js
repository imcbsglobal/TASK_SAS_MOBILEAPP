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
import printerService from "../../src/services/printerService";
import { KeyboardAvoidingView, Platform, TextInput } from "react-native";

const Company = () => {
  const router = useRouter();
  const [customersCount, setCustomersCount] = useState(0);
  const [logoutVisible, setLogoutVisible] = useState(false);

  // Settings Modal State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
  const [isProductSettingsOpen, setIsProductSettingsOpen] = useState(false);
  const [isPaymentSettingsOpen, setIsPaymentSettingsOpen] = useState(false);
  const [isPrintFormSettingsOpen, setIsPrintFormSettingsOpen] = useState(false);
  const [isTaxSettingsOpen, setIsTaxSettingsOpen] = useState(false);
  const [isPunchInSettingsOpen, setIsPunchInSettingsOpen] = useState(false);
  const [paperSize, setPaperSize] = useState(58); // Default 58mm
  const [showStockOnly, setShowStockOnly] = useState(false);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState('Cash');
  const [defaultQuantity, setDefaultQuantity] = useState(1); // Default to 1
  const [printFormType, setPrintFormType] = useState('form1'); // 'form1' | 'form2' | 'form3'
  const [taxCodeSetting, setTaxCodeSetting] = useState('no_tax'); // 'no_tax' | 'plus_tax' | 'reverse_tax'
  const [orderToReturn, setOrderToReturn] = useState(false);
  const [termsAndConditions, setTermsAndConditions] = useState(''); // T&C text for print footer
  const [termsInput, setTermsInput] = useState(''); // Editing buffer for T&C
  const [tcModalVisible, setTcModalVisible] = useState(false); // Modal for editing T&C
  const [showDistance, setShowDistance] = useState(false); // Punch In distance validation


  useEffect(() => {
    loadCustomerCount();
    loadPrinterSettings();
    loadProductSettings();
    loadPaymentSettings();
    loadPrintFormSettings();
    loadTaxSettings();
    loadPunchInSettings();
  }, []);

  const loadPrinterSettings = async () => {
    // We can rely on printerService to load its own settings, but we need to know the current value for UI
    try {
      await printerService.loadSettings();
      setPaperSize(printerService.printerWidthMM);
      // Load Terms & Conditions
      const tc = await AsyncStorage.getItem('printer_terms_conditions');
      const tcText = tc || '';
      setTermsAndConditions(tcText);
      setTermsInput(tcText);
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

  const handleSaveTermsAndConditions = async () => {
    try {
      await AsyncStorage.setItem('printer_terms_conditions', termsInput.trim());
      setTermsAndConditions(termsInput.trim());
    } catch (e) {
      console.log("Error saving T&C", e);
    }
  };

  const handleClearTermsAndConditions = async () => {
    try {
      await AsyncStorage.removeItem('printer_terms_conditions');
      setTermsAndConditions('');
      setTermsInput('');
    } catch (e) {
      console.log("Error clearing T&C", e);
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

      const qtyKey = `settings_default_quantity_${currentUsername}`;
      const qtyVal = await AsyncStorage.getItem(qtyKey);
      if (qtyVal !== null) {
        setDefaultQuantity(parseInt(qtyVal, 10));
      } else {
        setDefaultQuantity(1);
      }

      const otrVal = await AsyncStorage.getItem('settings_order_to_return');
      setOrderToReturn(otrVal === 'true');
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

  const toggleOrderToReturn = async () => {
    const newValue = !orderToReturn;
    setOrderToReturn(newValue);
    try {
      await AsyncStorage.setItem('settings_order_to_return', String(newValue));
    } catch (e) {
      console.log("Error saving order to return setting", e);
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

  const loadTaxSettings = async () => {
    try {
      const val = await AsyncStorage.getItem('settings_tax_code');
      if (val) setTaxCodeSetting(val);
    } catch (e) {
      console.log("Error loading tax settings", e);
    }
  };

  const handleTaxSettingSelection = async (setting) => {
    setTaxCodeSetting(setting);
    try {
      await AsyncStorage.setItem('settings_tax_code', setting);
    } catch (e) {
      console.log("Error saving tax settings", e);
    }
  };

  const loadPunchInSettings = async () => {
    try {
      const val = await AsyncStorage.getItem('settings_show_distance');
      if (val === 'true') setShowDistance(true);
      else setShowDistance(false);
    } catch (e) {
      console.log("Error loading punch in settings", e);
    }
  };

  const toggleShowDistance = async () => {
    const newValue = !showDistance;
    setShowDistance(newValue);
    try {
      await AsyncStorage.setItem('settings_show_distance', String(newValue));
    } catch (e) {
      console.log("Error saving show distance setting", e);
    }
  };


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
      icon: "settings-outline",
      title: "Settings",
      description: "Printer & App configuration",
      onPress: () => {
        loadPrinterSettings();
        loadProductSettings();
        loadPaymentSettings();
        loadPrintFormSettings();
        loadTaxSettings();
        loadPunchInSettings();
        setIsPrinterSettingsOpen(false);
        setIsProductSettingsOpen(false);
        setIsPaymentSettingsOpen(false);
        setIsPrintFormSettingsOpen(false);
        setIsTaxSettingsOpen(false);
        setIsPunchInSettingsOpen(false);
        setSettingsModalVisible(true);
      },
      color: Colors.text.primary,
      bg: Colors.neutral[100],
    }
  ];

  const quickActions = allQuickActions.filter(action => {
    if (!action.moduleCode) return true;
    if (allowedModules === null) return true;
    return allowedModules.has(action.moduleCode);
  });


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

        {/* Settings Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={settingsModalVisible}
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>

              {/* Header */}
              <View style={styles.modalHeader}>
                {isPrinterSettingsOpen || isProductSettingsOpen || isPaymentSettingsOpen || isPrintFormSettingsOpen || isTaxSettingsOpen || isPunchInSettingsOpen ? (
                  <TouchableOpacity onPress={() => {
                    setIsPrinterSettingsOpen(false);
                    setIsProductSettingsOpen(false);
                    setIsPaymentSettingsOpen(false);
                    setIsPrintFormSettingsOpen(false);
                    setIsTaxSettingsOpen(false);
                    setIsPunchInSettingsOpen(false);
                  }} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
                  </TouchableOpacity>
                ) : null}

                <Text style={styles.modalTitle}>
                  {isPrinterSettingsOpen ? "Printer Settings" :
                    (isProductSettingsOpen ? "Product Settings" :
                      (isPaymentSettingsOpen ? "Payment Settings" :
                        (isPrintFormSettingsOpen ? "Print Form" :
                          (isTaxSettingsOpen ? "Tax Settings" :
                            (isPunchInSettingsOpen ? "Punch In Settings" : "Settings")))))}
                </Text>

                <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Content Logic */}
              {!isPrinterSettingsOpen && !isProductSettingsOpen && !isPaymentSettingsOpen && !isPrintFormSettingsOpen && !isTaxSettingsOpen && !isPunchInSettingsOpen ? (
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
                          {printFormType === 'form3' ? 'Form 3 selected' : printFormType === 'form2' ? 'Form 2 selected (No HSN/GST)' : 'Form 1 selected (With HSN/GST)'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.text.tertiary} />
                  </TouchableOpacity>

                  {/* Tax Code Settings */}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsTaxSettingsOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(233, 30, 99, 0.1)' }]}>
                        <Ionicons name="calculator-outline" size={24} color="#E91E63" />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Tax Code Settings</Text>
                        <Text style={styles.menuItemSubtitle}>Configure tax logic for Form 3</Text>
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

                  {/* Punch In Settings */}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setIsPunchInSettingsOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(33, 150, 243, 0.1)' }]}>
                        <Ionicons name="location-outline" size={24} color="#2196F3" />
                      </View>
                      <View>
                        <Text style={styles.menuItemTitle}>Punch In</Text>
                        <Text style={styles.menuItemSubtitle}>Location validation settings</Text>
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

                  <View style={{ height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 }} />

                  <TouchableOpacity
                    style={[styles.menuItem, { borderBottomWidth: 0 }]}
                    onPress={toggleOrderToReturn}
                    activeOpacity={0.8}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: orderToReturn ? 'rgba(76, 175, 80, 0.1)' : 'rgba(158, 158, 158, 0.1)' }]}>
                        <Ionicons name={orderToReturn ? "return-up-back" : "return-up-back-outline"} size={24} color={orderToReturn ? Colors.success.main : Colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemTitle}>Order to Return</Text>
                        <Text style={styles.menuItemSubtitle} numberOfLines={2}>
                          {orderToReturn ? "Ask to go to return after placing order" : "No prompt after placing order"}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={orderToReturn ? "toggle" : "toggle-outline"}
                      size={32}
                      color={orderToReturn ? Colors.success.main : Colors.text.tertiary}
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

                  <View style={[styles.sizeSelectionContainer, { flexDirection: 'column', alignItems: 'stretch' }]}>
                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 12, justifyContent: 'flex-start' }, printFormType === 'form1' && styles.sizeOptionSelected]}
                      onPress={() => handlePrintFormSelection('form1')}
                    >
                      <Ionicons name={printFormType === 'form1' ? "radio-button-on" : "radio-button-off"} size={24} color={printFormType === 'form1' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, printFormType === 'form1' && styles.sizeOptionTitleSelected]}>Form 1</Text>
                        <Text style={styles.sizeOptionSubtitle}>Standard with HSN / GST</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 12, justifyContent: 'flex-start' }, printFormType === 'form2' && styles.sizeOptionSelected]}
                      onPress={() => handlePrintFormSelection('form2')}
                    >
                      <Ionicons name={printFormType === 'form2' ? "radio-button-on" : "radio-button-off"} size={24} color={printFormType === 'form2' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, printFormType === 'form2' && styles.sizeOptionTitleSelected]}>Form 2</Text>
                        <Text style={styles.sizeOptionSubtitle}>No HSN / GST (Compact)</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 40, justifyContent: 'flex-start' }, printFormType === 'form3' && styles.sizeOptionSelected]}
                      onPress={() => handlePrintFormSelection('form3')}
                    >
                      <Ionicons name={printFormType === 'form3' ? "radio-button-on" : "radio-button-off"} size={24} color={printFormType === 'form3' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, printFormType === 'form3' && styles.sizeOptionTitleSelected]}>Form 3</Text>
                        <Text style={styles.sizeOptionSubtitle}>Dynamic Tax support</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : isPunchInSettingsOpen ? (
                /* Inner Punch In Settings View */
                <View style={styles.settingItem}>
                  <TouchableOpacity
                    style={[styles.menuItem, { borderBottomWidth: 0 }]}
                    onPress={toggleShowDistance}
                    activeOpacity={0.8}
                  >
                    <View style={styles.menuItemLeft}>
                      <View style={[styles.menuIconContainer, { backgroundColor: showDistance ? 'rgba(33, 150, 243, 0.1)' : 'rgba(158, 158, 158, 0.1)' }]}>
                        <Ionicons name={showDistance ? "navigate" : "navigate-outline"} size={24} color={showDistance ? '#2196F3' : Colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuItemTitle}>Show Distance</Text>
                        <Text style={styles.menuItemSubtitle} numberOfLines={2}>
                          {showDistance ? "Validate location within 100m radius" : "No distance validation"}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={showDistance ? "toggle" : "toggle-outline"}
                      size={32}
                      color={showDistance ? '#2196F3' : Colors.text.tertiary}
                    />
                  </TouchableOpacity>

                  <Text style={[styles.helperText, { marginTop: 16, textAlign: 'left', paddingHorizontal: 4 }]}>
                    When enabled, users will see "Correct Location" if within 100m of shop, or "Mismatch Location" if outside this range during punch in.
                  </Text>
                </View>
              ) : isTaxSettingsOpen ? (
                /* Inner Tax Settings View */
                <View style={styles.settingItem}>
                  <View style={styles.settingLabelContainer}>
                    <Text style={styles.settingLabel}>Tax Code Settings</Text>
                  </View>
                  
                  <Text style={[styles.helperText, { marginBottom: 16 }]}>
                    Choose how tax is calculated for products on Form 3.
                  </Text>

                  <View style={[styles.sizeSelectionContainer, { flexDirection: 'column', alignItems: 'stretch' }]}>
                    {taxCodeSetting === 'no_tax' && (
                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 12, justifyContent: 'flex-start' }, taxCodeSetting === 'no_tax' && styles.sizeOptionSelected]}
                      onPress={() => handleTaxSettingSelection('no_tax')}
                    >
                      <Ionicons name={taxCodeSetting === 'no_tax' ? "radio-button-on" : "radio-button-off"} size={24} color={taxCodeSetting === 'no_tax' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, taxCodeSetting === 'no_tax' && styles.sizeOptionTitleSelected]}>No Tax</Text>
                        <Text style={styles.sizeOptionSubtitle}>Standard calculation (Tax ignored)</Text>
                      </View>
                    </TouchableOpacity>
                    )}

                    {taxCodeSetting === 'plus_tax' && (
                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 12, justifyContent: 'flex-start' }, taxCodeSetting === 'plus_tax' && styles.sizeOptionSelected]}
                      onPress={() => handleTaxSettingSelection('plus_tax')}
                    >
                      <Ionicons name={taxCodeSetting === 'plus_tax' ? "radio-button-on" : "radio-button-off"} size={24} color={taxCodeSetting === 'plus_tax' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, taxCodeSetting === 'plus_tax' && styles.sizeOptionTitleSelected]}>Plus Tax</Text>
                        <Text style={styles.sizeOptionSubtitle}>Tax added to rate</Text>
                      </View>
                    </TouchableOpacity>
                    )}

                    {taxCodeSetting === 'reverse_tax' && (
                    <TouchableOpacity
                      style={[styles.sizeOption, { marginBottom: 40, justifyContent: 'flex-start' }, taxCodeSetting === 'reverse_tax' && styles.sizeOptionSelected]}
                      onPress={() => handleTaxSettingSelection('reverse_tax')}
                    >
                      <Ionicons name={taxCodeSetting === 'reverse_tax' ? "radio-button-on" : "radio-button-off"} size={24} color={taxCodeSetting === 'reverse_tax' ? Colors.primary.main : Colors.text.tertiary} style={{ marginRight: 12 }} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, taxCodeSetting === 'reverse_tax' && styles.sizeOptionTitleSelected]}>Reverse Tax</Text>
                        <Text style={styles.sizeOptionSubtitle}>Rate includes tax</Text>
                      </View>
                    </TouchableOpacity>
                    )}
                  </View>
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

                    <TouchableOpacity
                      style={[styles.sizeOption, paperSize === 114 && styles.sizeOptionSelected]}
                      onPress={() => handlePaperSizeSelection(114)}
                    >
                      <Ionicons name={paperSize === 114 ? "radio-button-on" : "radio-button-off"} size={24} color={paperSize === 114 ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, paperSize === 114 && styles.sizeOptionTitleSelected]}>4.5 Inch</Text>
                        <Text style={styles.sizeOptionSubtitle}>Pro Wide Receipt</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sizeOption, paperSize === 127 && styles.sizeOptionSelected]}
                      onPress={() => handlePaperSizeSelection(127)}
                    >
                      <Ionicons name={paperSize === 127 ? "radio-button-on" : "radio-button-off"} size={24} color={paperSize === 127 ? Colors.primary.main : Colors.text.tertiary} />
                      <View>
                        <Text style={[styles.sizeOptionTitle, paperSize === 127 && styles.sizeOptionTitleSelected]}>5 Inch</Text>
                        <Text style={styles.sizeOptionSubtitle}>Ultra Wide Receipt</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.helperText}>
                    Select 2 Inch for portable printers, 3 Inch for desktop, 4 Inch for extra wide, 4.5 Inch for pro, 5 Inch for ultra wide.
                  </Text>

                  <View style={styles.visualizerContainer}>
                    <Text style={[styles.visualizerText, { width: '100%', textAlign: 'center' }]}>
                      Preview Line Width:
                    </Text>
                    <Text style={[styles.visualizerLine, { fontSize: 10 }]}>
                      {'-'.repeat(Math.floor((paperSize / 58) * 32))}
                    </Text>
                  </View>

                  {/* Terms & Conditions Button */}
                  <View style={{ marginTop: 20 }}>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#f8f9fa',
                        padding: 16,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#e0e0e0'
                      }}
                      onPress={() => setTcModalVisible(true)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Ionicons name="document-text-outline" size={24} color={Colors.primary.main} />
                        <View>
                          <Text style={{ fontWeight: '600', color: Colors.text.primary }}>Terms & Conditions</Text>
                          <Text style={{ fontSize: 12, color: Colors.text.tertiary }}>
                            {termsAndConditions ? 'T&C added' : 'Add print footer text'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Dedicated T&C Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={tcModalVisible}
          onRequestClose={() => setTcModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.5)',
              justifyContent: 'center',
              padding: 20
            }}
          >
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              elevation: 20
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary }}>Edit Terms & Conditions</Text>
                <TouchableOpacity onPress={() => setTcModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: Colors.text.tertiary, fontSize: 13, marginBottom: 12 }}>
                This text will be printed at the bottom of every receipt.
              </Text>

              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  borderRadius: 12,
                  padding: 14,
                  minHeight: 120,
                  textAlignVertical: 'top',
                  fontSize: 15,
                  color: '#333',
                  backgroundColor: '#f9f9f9',
                  marginBottom: 20,
                }}
                multiline
                autoFocus
                placeholder="Enter terms and conditions..."
                placeholderTextColor="#aaa"
                value={termsInput}
                onChangeText={setTermsInput}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: Colors.primary.main,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                    elevation: 2
                  }}
                  onPress={async () => {
                    await handleSaveTermsAndConditions();
                    setTcModalVisible(false);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save</Text>
                </TouchableOpacity>
                
                {termsAndConditions ? (
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#fff',
                      paddingVertical: 14,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#f44336'
                    }}
                    onPress={async () => {
                      await handleClearTermsAndConditions();
                      setTcModalVisible(false);
                    }}
                  >
                    <Text style={{ color: '#f44336', fontWeight: '700', fontSize: 16 }}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>



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

  confirmButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default Company;